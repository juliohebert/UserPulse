import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { get, del } from '../../services/api'
import type { Jornada } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { DesignStatusBadge } from '../../components/ui/DesignStatusBadge'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConteudo, podeExcluirOuImportarConteudo } from '../../utils/permissions'
import { limiteTrial } from '../../utils/limiteTrial'

const PER_PAGE = 10

type SortKey = 'jornada' | 'status' | 'etapas' | 'atualizado'
type SortDirection = 'asc' | 'desc'
type ColumnKey = SortKey | 'acoes'
type FiltroStatus = 'todos' | 'ativos' | 'inativos'
type FiltroEtapas = 'todas' | 'com' | 'sem'

const TABLE_COLUMNS: Array<{ label: string; key: ColumnKey; sortKey: SortKey | null }> = [
  { label: 'Jornada', key: 'jornada', sortKey: 'jornada' },
  { label: 'Status', key: 'status', sortKey: 'status' },
  { label: 'Etapas', key: 'etapas', sortKey: 'etapas' },
  { label: 'Atualizado em', key: 'atualizado', sortKey: 'atualizado' },
  { label: 'Ações', key: 'acoes', sortKey: null },
]

const COLUNAS_INICIAIS: Record<ColumnKey, boolean> = {
  jornada: true,
  status: true,
  etapas: true,
  atualizado: true,
  acoes: true,
}

const STATUS_FILTRO: Array<{ value: FiltroStatus; label: string }> = [
  { value: 'todos', label: 'Todas' },
  { value: 'ativos', label: 'Ativas' },
  { value: 'inativos', label: 'Inativas' },
]

const COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-2xl border border-l-[8px] border-outline-variant/40 border-l-primary bg-surface-container-lowest px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
        <p className="text-label-md font-bold text-on-surface-variant">{label}</p>
      </div>
      <p className="mt-2 text-headline-md font-bold leading-none text-on-surface">{value}</p>
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-label-md font-bold text-primary">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remover filtro ${label}`} className="rounded-full p-0.5 transition-colors hover:text-error">
        <span className="material-symbols-outlined text-[14px] leading-none">close</span>
      </button>
    </span>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label-md font-bold text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-outline-variant bg-surface-bright px-3 text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function valorOrdenacao(j: Jornada, key: SortKey): string | number {
  switch (key) {
    case 'jornada': return j.titulo
    case 'status': return j.ativo ? 'Ativa' : 'Inativa'
    case 'etapas': return j._count?.etapas ?? 0
    case 'atualizado': return new Date(j.atualizado_em).getTime()
  }
}

function compararJornadas(a: Jornada, b: Jornada, key: SortKey, direction: SortDirection): number {
  const valorA = valorOrdenacao(a, key)
  const valorB = valorOrdenacao(b, key)
  const resultado = typeof valorA === 'number' && typeof valorB === 'number'
    ? valorA - valorB
    : COLLATOR.compare(String(valorA), String(valorB))
  return direction === 'asc' ? resultado : -resultado
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return <DesignStatusBadge variant={ativo ? 'success' : 'neutral'}>{ativo ? 'Ativo' : 'Inativo'}</DesignStatusBadge>
}

export function JornadasIndex() {
  const { user } = useAuth()
  // RBAC real (ver server/src/middleware/requireEscritaTenant.ts) — VIEWER
  // só lê; esconder os botões aqui é só UX, o backend já bloqueia 403.
  const podeEscrever = podeEscreverConteudo(user?.role)
  // Excluir jornada é hard delete (ver controller) — mais restrito que
  // criar/editar: só ADMIN/SUPER_ADMIN, EDITOR não.
  const podeExcluir = podeExcluirOuImportarConteudo(user?.role)
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useSearchParams()
  const [busca, setBusca] = useState(() => searchParams.get('busca') ?? '')
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [colunasAberto, setColunasAberto] = useState(false)
  const [filtrosAberto, setFiltrosAberto] = useState(false)
  const [colunasVisiveis, setColunasVisiveis] = useState(COLUNAS_INICIAIS)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
  const [filterAtivo, setFilterAtivo] = useState<FiltroStatus>('todos')
  const [filterEtapas, setFilterEtapas] = useState<FiltroEtapas>('todas')
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [jornadaExcluir, setJornadaExcluir] = useState<Jornada | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const colunasRef = useRef<HTMLDivElement | null>(null)
  const filtrosRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    setError(null)
    get<Jornada[]>('/jornadas')
      .then(setJornadas)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const buscaUrl = searchParams.get('busca') ?? ''
    setBusca(prev => (prev === buscaUrl ? prev : buscaUrl))
  }, [searchParams])

  useEffect(() => {
    const termo = busca.trim()
    const atual = searchParams.get('busca') ?? ''
    if (termo === atual) return
    const next = new URLSearchParams(searchParams)
    if (termo) next.set('busca', termo)
    else next.delete('busca')
    setSearchParams(next, { replace: true })
  }, [busca, searchParams, setSearchParams])

  useEffect(() => {
    if (!colunasAberto) return
    const onMouseDown = (e: MouseEvent) => {
      if (colunasRef.current && !colunasRef.current.contains(e.target as Node)) setColunasAberto(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setColunasAberto(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [colunasAberto])

  useEffect(() => {
    if (!filtrosAberto) return
    const onMouseDown = (e: MouseEvent) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target as Node)) setFiltrosAberto(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltrosAberto(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filtrosAberto])

  const q = busca.trim().toLowerCase()
  const filtered = jornadas.filter(j => {
    if (filterAtivo === 'ativos' && !j.ativo) return false
    if (filterAtivo === 'inativos' && j.ativo) return false
    if (filterEtapas === 'com' && (j._count?.etapas ?? 0) === 0) return false
    if (filterEtapas === 'sem' && (j._count?.etapas ?? 0) > 0) return false
    if (q && !`${j.titulo} ${j.slug}`.toLowerCase().includes(q)) return false
    return true
  })

  const ordered = sort ? [...filtered].sort((a, b) => compararJornadas(a, b, sort.key, sort.direction)) : filtered
  const paginated = ordered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const ativas = jornadas.filter(j => j.ativo).length
  const inativas = jornadas.length - ativas
  // Fase 6E — jornadas.length já é o TOTAL cadastrado do tenant (GET
  // /jornadas sem filtro `ativo` não filtra por status, ver
  // server/src/controllers/jornadas.ts listar()) — reaproveitado direto,
  // sem endpoint novo.
  const limiteJornadas = limiteTrial(user?.tenant.plano, user?.tenant.plano?.limite_jornadas_ativas, jornadas.length, 'jornada')
  const clearFilters = () => {
    setBusca('')
    setFilterAtivo('todos')
    setFilterEtapas('todas')
    setPage(1)
  }
  const totalFiltrosAtivos = [filterAtivo !== 'todos', filterEtapas !== 'todas'].filter(Boolean).length
  const hasFilters = Boolean(busca || totalFiltrosAtivos > 0)
  const totalColunasSelecionadas = TABLE_COLUMNS.filter(col => colunasVisiveis[col.key]).length

  const ordenarPor = (key: SortKey) => {
    setSort(prev => {
      if (prev?.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { key, direction: 'asc' }
    })
    setPage(1)
  }

  const limparBusca = () => {
    setBusca('')
    setBuscaAberta(false)
    setPage(1)
  }

  const alternarColuna = (key: ColumnKey) => {
    if (key === 'jornada') return
    setColunasVisiveis(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const excluirJornada = async () => {
    if (!jornadaExcluir) return
    const jornada = jornadaExcluir
    setExcluindoId(jornada.id)
    setMensagem(null)
    try {
      await del(`/jornadas/${jornada.id}`)
      setJornadas(prev => prev.filter(j => j.id !== jornada.id))
      setJornadaExcluir(null)
      setMensagem({ tipo: 'sucesso', texto: 'Jornada removida com sucesso.' })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível remover a jornada. Tente novamente.' })
    } finally {
      setExcluindoId(null)
    }
  }

  return (
    <div>
      <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
        {mensagem && (
          <div className={`mb-4 p-3 rounded-xl text-body-md flex items-center gap-2 ${
            mensagem.tipo === 'sucesso' ? 'bg-tertiary/10 text-tertiary' : 'bg-error-container text-on-error-container'
          }`}>
            <span className="material-symbols-outlined text-[18px]">{mensagem.tipo === 'sucesso' ? 'check_circle' : 'error'}</span>
            {mensagem.texto}
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Jornadas</h3>
            </div>
            {podeEscrever && (
              <Button
                onClick={() => {
                  // Fase 6E — trial no limite: nem navega pro formulário, só
                  // avisa (mesma mensagem do backend). Continua permitido
                  // editar/desativar/excluir jornadas existentes.
                  if (limiteJornadas.atingido) { setMensagem({ tipo: 'erro', texto: limiteJornadas.mensagem! }); return }
                  navigate('/jornadas/novo')
                }}
                variant="gradient"
                size="lg"
                className="shrink-0"
                iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
              >
                Nova Jornada
              </Button>
            )}
          </div>

          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-5 border-b border-outline-variant/30 bg-surface-container-low/30">
              <MetricCard label="Total de jornadas" value={jornadas.length.toLocaleString('pt-BR')} icon="route" />
              <MetricCard label="Jornadas ativas" value={ativas.toLocaleString('pt-BR')} icon="play_circle" />
              <MetricCard label="Jornadas inativas" value={inativas.toLocaleString('pt-BR')} icon="pause_circle" />
              <MetricCard label="Total de etapas" value={jornadas.reduce((total, j) => total + (j._count?.etapas ?? 0), 0).toLocaleString('pt-BR')} icon="format_list_numbered" />
            </div>
          )}

          {!loading && !error && (
            <div className="flex flex-col gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface-container-lowest md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-label-md font-bold uppercase tracking-wide text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-primary">list_alt</span>
                  Localizadas
                </p>
                <p className="text-label-md text-outline">
                  {filtered.length.toLocaleString('pt-BR')} de {jornadas.length.toLocaleString('pt-BR')} jornada{jornadas.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="flex items-center gap-2 md:justify-end">
                {buscaAberta ? (
                  <div className="relative w-full min-w-[220px] md:w-80">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
                    <input
                      autoFocus
                      value={busca}
                      onChange={e => { setBusca(e.target.value); setPage(1) }}
                      placeholder="Filtrar por título ou slug..."
                      className="h-9 w-full rounded-xl border border-outline-variant bg-surface-bright pl-9 pr-9 text-body-md focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={limparBusca}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-outline transition-colors hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                ) : busca ? (
                  <button
                    type="button"
                    onClick={() => { setBuscaAberta(true); setColunasAberto(false); setFiltrosAberto(false) }}
                    className="inline-flex h-9 max-w-[260px] items-center gap-2 rounded-xl border border-outline-variant bg-surface-bright px-3 text-label-md font-bold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">search</span>
                    <span className="truncate">{busca}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setBuscaAberta(true); setColunasAberto(false); setFiltrosAberto(false) }}
                    aria-label="Buscar jornada"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant bg-surface-bright text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[20px]">search</span>
                  </button>
                )}

                <div className="relative" ref={colunasRef}>
                  <button
                    type="button"
                    onClick={() => { setColunasAberto(v => !v); setBuscaAberta(false); setFiltrosAberto(false) }}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-outline-variant bg-surface-bright px-3 text-label-md font-bold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">view_column</span>
                    Colunas
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{totalColunasSelecionadas}</span>
                  </button>
                  {colunasAberto && (
                    <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
                      <div className="border-b border-outline-variant/30 px-4 py-3">
                        <p className="text-label-md font-bold text-on-surface">Colunas visíveis</p>
                      </div>
                      <div className="p-2">
                        <button
                          type="button"
                          onClick={() => setColunasVisiveis(COLUNAS_INICIAIS)}
                          className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-body-md font-bold text-primary transition-colors hover:bg-primary-fixed"
                        >
                          Mostrar todas
                          <span className="material-symbols-outlined text-[16px]">select_all</span>
                        </button>
                        {TABLE_COLUMNS.map(col => (
                          <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-body-md text-on-surface transition-colors hover:bg-surface-container-low">
                            <input
                              type="checkbox"
                              checked={colunasVisiveis[col.key]}
                              disabled={col.key === 'jornada'}
                              onChange={() => alternarColuna(col.key)}
                              className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                            />
                            <span className={col.key === 'jornada' ? 'text-on-surface-variant' : ''}>{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative" ref={filtrosRef}>
                  <button
                    type="button"
                    onClick={() => { setFiltrosAberto(v => !v); setColunasAberto(false); setBuscaAberta(false) }}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-outline-variant bg-surface-bright px-3 text-label-md font-bold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">filter_list</span>
                    Filtros
                    {totalFiltrosAtivos > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{totalFiltrosAtivos}</span>}
                  </button>
                  {filtrosAberto && (
                    <div className="absolute right-0 z-[80] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
                      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-3">
                        <p className="text-label-md font-bold text-on-surface">Filtrar jornadas</p>
                        {totalFiltrosAtivos > 0 && <button type="button" onClick={clearFilters} className="text-label-md font-bold text-primary hover:underline">Limpar</button>}
                      </div>
                      <div className="grid grid-cols-1 gap-3 p-4">
                        <FilterSelect label="Status" value={filterAtivo} options={STATUS_FILTRO} onChange={value => { setFilterAtivo(value as FiltroStatus); setPage(1) }} />
                        <FilterSelect
                          label="Etapas"
                          value={filterEtapas}
                          options={[
                            { value: 'todas', label: 'Todas' },
                            { value: 'com', label: 'Com etapas' },
                            { value: 'sem', label: 'Sem etapas' },
                          ]}
                          onChange={value => { setFilterEtapas(value as FiltroEtapas); setPage(1) }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && !error && hasFilters && (
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-outline-variant/30 bg-surface-container-low/30">
              {busca && <FilterChip label={busca} onRemove={() => { setBusca(''); setPage(1) }} />}
              {filterAtivo !== 'todos' && (
                <FilterChip label={filterAtivo === 'ativos' ? 'Ativas' : 'Inativas'} onRemove={() => { setFilterAtivo('todos'); setPage(1) }} />
              )}
              {filterEtapas !== 'todas' && (
                <FilterChip label={filterEtapas === 'com' ? 'Com etapas' : 'Sem etapas'} onRemove={() => { setFilterEtapas('todas'); setPage(1) }} />
              )}
              <button type="button" onClick={clearFilters} className="ml-auto text-label-md font-bold text-on-surface-variant transition-colors hover:text-error">
                Limpar filtros
              </button>
            </div>
          )}

          <div className="min-h-[420px]">
          {loading && <LoadingSpinner />}
          {error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon="route"
              title={jornadas.length === 0 ? 'Nenhuma jornada criada ainda' : 'Nenhuma jornada encontrada'}
              description={jornadas.length === 0 ? 'Crie a primeira jornada para guiar o onboarding dos seus usuários.' : 'Ajuste os filtros para ver outras jornadas.'}
              action={
                jornadas.length === 0 && podeEscrever ? (
                  <Button
                    onClick={() => navigate('/jornadas/novo')}
                    variant="gradient"
                    size="md"
                  >
                    Nova Jornada
                  </Button>
                ) : undefined
              }
            />
          )}

          {!loading && !error && filtered.length > 0 && (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/50 border-b border-outline-variant/40">
                      {TABLE_COLUMNS.filter(col => colunasVisiveis[col.key]).map(col => {
                        const active = sort?.key === col.sortKey
                        const align = col.key === 'acoes' ? ' text-right' : col.key === 'status' || col.key === 'etapas' ? ' text-center' : ''
                        const visibility = col.key === 'atualizado' ? ' hidden lg:table-cell' : ''
                        return (
                          <th key={col.key} className={`px-4 py-3 text-[11px] text-on-surface-variant font-bold uppercase tracking-wide whitespace-nowrap${align}${visibility}`}>
                            {col.sortKey ? (
                              <button type="button" onClick={() => ordenarPor(col.sortKey!)} className="inline-flex items-center gap-1 rounded-lg transition-colors hover:text-primary">
                                {col.label}
                                <span className={`material-symbols-outlined text-[14px] leading-none transition-opacity ${active ? 'opacity-100' : 'opacity-35'}`}>
                                  {active && sort.direction === 'desc' ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                                </span>
                              </button>
                            ) : col.label}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {paginated.map(jornada => (
                      <tr key={jornada.id} className={`group transition-colors ${!jornada.ativo ? 'opacity-60' : ''} hover:bg-surface-container-low/60`}>
                        {colunasVisiveis.jornada && <td className="px-4 py-4 align-middle max-w-[360px]">
                          {podeEscrever ? (
                            <button
                              onClick={() => navigate(`/jornadas/${jornada.id}/editar`)}
                              className="text-body-md font-bold text-on-surface hover:text-primary transition-colors text-left truncate max-w-full"
                            >
                              {jornada.titulo}
                            </button>
                          ) : (
                            <span className="text-body-md font-bold text-on-surface">{jornada.titulo}</span>
                          )}
                          {jornada.descricao && (
                            <p className="text-label-sm text-on-surface-variant truncate max-w-xs">{jornada.descricao}</p>
                          )}
                        </td>}
                        {colunasVisiveis.status && <td className="px-4 py-4 align-middle text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2.5">
                            <StatusBadge ativo={jornada.ativo} />
                          </div>
                        </td>}
                        {colunasVisiveis.etapas && <td className="px-4 py-4 align-middle text-body-md font-bold text-center text-on-surface whitespace-nowrap">
                          {jornada._count?.etapas ?? 0} etapa(s)
                        </td>}
                        {colunasVisiveis.atualizado && <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant whitespace-nowrap hidden lg:table-cell">{formatDateTime(jornada.atualizado_em)}</td>}
                        {colunasVisiveis.acoes && <td className="px-4 py-4 align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <JornadaActions jornada={jornada} navigate={navigate} excluindoId={excluindoId} onExcluir={setJornadaExcluir} podeEscrever={podeEscrever} podeExcluir={podeExcluir} />
                          </div>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-outline-variant/20">
                {paginated.map(jornada => (
                  <div key={jornada.id} className={`p-4 ${!jornada.ativo ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      {podeEscrever ? (
                        <button
                          onClick={() => navigate(`/jornadas/${jornada.id}/editar`)}
                          className="text-body-md font-bold text-on-surface hover:text-primary transition-colors text-left min-w-0 truncate"
                        >
                          {jornada.titulo}
                        </button>
                      ) : (
                        <span className="text-body-md font-bold text-on-surface min-w-0 truncate">{jornada.titulo}</span>
                      )}
                    </div>
                    {jornada.descricao && (
                      <p className="text-label-sm text-on-surface-variant truncate mb-2">{jornada.descricao}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge ativo={jornada.ativo} />
                      </div>
                      <span className="text-label-sm text-on-surface-variant">
                        · {jornada._count?.etapas ?? 0} etapa(s)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-sm text-outline">Atualizado {formatDateTime(jornada.atualizado_em)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <JornadaActions jornada={jornada} navigate={navigate} excluindoId={excluindoId} onExcluir={setJornadaExcluir} podeEscrever={podeEscrever} podeExcluir={podeExcluir} size="lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
          </div>
        </div>
      </section>
      {jornadaExcluir && (
        <ConfirmDialog
          title={`Remover "${jornadaExcluir.titulo}"?`}
          description="Esta ação não poderá ser desfeita. A jornada e suas etapas serão removidas permanentemente."
          confirmLabel="Remover jornada"
          variant="danger"
          loading={excluindoId === jornadaExcluir.id}
          onConfirm={excluirJornada}
          onCancel={() => setJornadaExcluir(null)}
        />
      )}
    </div>
  )
}

function JornadaActions({ jornada, navigate, excluindoId, onExcluir, podeEscrever, podeExcluir, size = 'md' }: {
  jornada: Jornada
  navigate: (path: string) => void
  excluindoId: string | null
  onExcluir: (jornada: Jornada) => void
  podeEscrever: boolean
  podeExcluir: boolean
  size?: 'md' | 'lg'
}) {
  if (!podeEscrever && !podeExcluir) return null
  const btnPad = size === 'lg' ? 'p-2' : 'p-1.5'
  const btnCls = `${btnPad} rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors`
  return (
    <>
      {podeEscrever && (
        <button onClick={() => navigate(`/jornadas/${jornada.id}/editar`)} title="Editar" aria-label={`Editar ${jornada.titulo}`} className={btnCls}>
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      )}
      {podeExcluir && (
        <button
          onClick={() => onExcluir(jornada)}
          disabled={excluindoId === jornada.id}
          title="Remover"
          aria-label={`Remover ${jornada.titulo}`}
          className={`${btnPad} rounded-full text-error hover:bg-error-container transition-colors disabled:opacity-40`}
        >
          <span className={`material-symbols-outlined text-[18px] ${excluindoId === jornada.id ? 'animate-spin' : ''}`}>
            {excluindoId === jornada.id ? 'progress_activity' : 'delete'}
          </span>
        </button>
      )}
    </>
  )
}
