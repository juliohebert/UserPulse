import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, type NavigateFunction } from 'react-router-dom'
import { del, get, post } from '../../services/api'
import type { TourExportEnvelope, TourGuiado, TourGuiadoListaPaginada } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { downloadJson } from '../../utils/tour'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConteudo, podeExcluirOuImportarConteudo } from '../../utils/permissions'
import { limiteTrial } from '../../utils/limiteTrial'

const PAGE_SIZE = 10
// Só a busca dispara a cada tecla (status/sistema são clique único, sem
// motivo pra atraso) — debounce simples evita 1 request por caractere digitado.
const BUSCA_DEBOUNCE_MS = 300

type StatusFiltro = 'todos' | 'ativos' | 'inativos'
type SortKey = 'tour' | 'sistema' | 'status' | 'passos' | 'atualizado'
type SortDirection = 'asc' | 'desc'
type ColumnKey = SortKey | 'acoes'
type FiltroPassos = 'todos' | 'com' | 'sem'

const TABLE_COLUMNS: Array<{ label: string; key: ColumnKey; sortKey: SortKey | null }> = [
  { label: 'Tour', key: 'tour', sortKey: 'tour' },
  { label: 'Sistema', key: 'sistema', sortKey: 'sistema' },
  { label: 'Status', key: 'status', sortKey: 'status' },
  { label: 'Passos', key: 'passos', sortKey: 'passos' },
  { label: 'Atualizado em', key: 'atualizado', sortKey: 'atualizado' },
  { label: 'Ações', key: 'acoes', sortKey: null },
]

const COLUNAS_INICIAIS: Record<ColumnKey, boolean> = {
  tour: true,
  sistema: true,
  status: true,
  passos: true,
  atualizado: true,
  acoes: true,
}

const STATUS_FILTRO: Array<{ value: StatusFiltro; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativos', label: 'Ativos' },
  { value: 'inativos', label: 'Inativos' },
]

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

// Sem nenhum filtro preenchido isso vira uma query string só com page/pageSize
// — a listagem chama a mesma consulta de sempre, preservando o comportamento
// atual quando nenhum filtro é aplicado (mesmo padrão de montarQuery em
// web/src/pages/tours/Dashboard.tsx).
function montarQueryTours(busca: string, sistema: string, status: StatusFiltro, passos: FiltroPassos, pagina: number, sort: { key: SortKey; direction: SortDirection } | null): string {
  const params = new URLSearchParams()
  params.set('page', String(pagina))
  params.set('pageSize', String(PAGE_SIZE))
  if (busca.trim()) params.set('busca', busca.trim())
  if (sistema) params.set('sistema', sistema)
  if (status !== 'todos') params.set('status', status)
  if (passos !== 'todos') params.set('passos', passos)
  if (sort) {
    params.set('sortKey', sort.key)
    params.set('sortDirection', sort.direction)
  }
  return `?${params.toString()}`
}

export function ToursIndex() {
  const { user } = useAuth()
  // RBAC real (ver server/src/middleware/requireEscritaTenant.ts) — VIEWER
  // só lê; esconder os botões aqui é só UX, o backend já bloqueia 403.
  const podeEscrever = podeEscreverConteudo(user?.role)
  // Excluir (hard delete) e importar tour — mais restrito que criar/editar:
  // só ADMIN/SUPER_ADMIN, EDITOR não (ver comentário em utils/permissions.ts).
  const podeExcluirOuImportar = podeExcluirOuImportarConteudo(user?.role)
  const [data, setData] = useState<TourGuiadoListaPaginada | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [busca, setBusca] = useState(() => searchParams.get('busca') ?? '')
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [colunasAberto, setColunasAberto] = useState(false)
  const [filtrosAberto, setFiltrosAberto] = useState(false)
  const [colunasVisiveis, setColunasVisiveis] = useState(COLUNAS_INICIAIS)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
  const [filterSistema, setFilterSistema] = useState('')
  const [filterAtivo, setFilterAtivo] = useState<StatusFiltro>('todos')
  const [filterPassos, setFilterPassos] = useState<FiltroPassos>('todos')
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)
  const [exportandoId, setExportandoId] = useState<string | null>(null)
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [tourRemover, setTourRemover] = useState<TourGuiado | null>(null)
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [importarViaGravador, setImportarViaGravador] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const navigate = useNavigate()
  const redirectTimer = useRef<number | null>(null)
  const colunasRef = useRef<HTMLDivElement | null>(null)
  const filtrosRef = useRef<HTMLDivElement | null>(null)
  // Ignora o primeiro disparo do efeito de debounce da busca — a carga
  // inicial (mount) já é feita à parte, logo abaixo.
  const primeiraRenderRef = useRef(true)

  useEffect(() => () => {
    if (redirectTimer.current) window.clearTimeout(redirectTimer.current)
  }, [])

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

  // Vindo do Gravador de Fluxo ("Copiar e abrir importação" no widget): o JSON
  // já foi copiado pra área de transferência lá — aqui só abre o modal
  // sozinho, pra o usuário colar. O parâmetro nunca carrega o JSON em si (só
  // um sinal de "abra o modal"), e é removido da URL logo em seguida via
  // replaceState pra não reabrir o modal num refresh ou ao voltar a página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('importarJson') !== '1') return
    setModalImportarAberto(true)
    setImportarViaGravador(true)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  // page é sempre o pedido explicitamente por quem chama load() — nunca lido
  // de volta de `data` no meio do caminho, pra não haver corrida entre um
  // clique de página e um filtro mudando ao mesmo tempo.
  const load = (buscaAtual: string, sistemaAtual: string, statusAtual: StatusFiltro, pagina: number, sortAtual = sort, passosAtual = filterPassos) => {
    setLoading(true)
    setError(null)
    get<TourGuiadoListaPaginada>(`/tours${montarQueryTours(buscaAtual, sistemaAtual, statusAtual, passosAtual, pagina, sortAtual)}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(busca, '', 'todos', 1, null, 'todos') }, [])

  // Debounce só da busca — status/sistema mudam por clique único (sem
  // motivo pra atrasar) e já chamam load() direto nos próprios handlers.
  useEffect(() => {
    if (primeiraRenderRef.current) { primeiraRenderRef.current = false; return }
    const t = window.setTimeout(() => load(busca, filterSistema, filterAtivo, 1), BUSCA_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const sistemas = data?.sistemas ?? []
  const items = data?.items ?? []
  const resumo = data?.resumo ?? { total: 0, ativos: 0, inativos: 0, total_passos: 0 }
  // Fase 6E — resumo.total já é o TOTAL cadastrado do tenant, sem depender
  // de filtro/busca (ver server/src/controllers/tours.ts listar()) —
  // reaproveitado direto, sem endpoint novo.
  const limiteTours = limiteTrial(user?.tenant.plano, user?.tenant.plano?.limite_tours_ativos, resumo.total, 'tour')
  const totalFiltrado = data?.total ?? 0
  const paginaAtual = data?.page ?? 1
  const perPageAtual = data?.per_page ?? PAGE_SIZE

  const clearFilters = () => {
    setBusca('')
    setFilterSistema('')
    setFilterAtivo('todos')
    setFilterPassos('todos')
    load('', '', 'todos', 1, sort, 'todos')
  }
  const totalFiltrosAtivos = [Boolean(filterSistema), filterAtivo !== 'todos', filterPassos !== 'todos'].filter(Boolean).length
  const hasFilters = Boolean(busca || totalFiltrosAtivos > 0)
  const totalColunasSelecionadas = TABLE_COLUMNS.filter(col => colunasVisiveis[col.key]).length

  const mudarSistema = (v: string) => { setFilterSistema(v); load(busca, v, filterAtivo, 1) }
  const mudarStatus = (v: StatusFiltro) => { setFilterAtivo(v); load(busca, filterSistema, v, 1) }
  const mudarPagina = (p: number) => load(busca, filterSistema, filterAtivo, p)
  const limparBusca = () => { setBusca(''); setBuscaAberta(false); load('', filterSistema, filterAtivo, 1) }
  const alternarColuna = (key: ColumnKey) => {
    if (key === 'tour') return
    setColunasVisiveis(prev => ({ ...prev, [key]: !prev[key] }))
  }
  const mudarPassos = (v: FiltroPassos) => { setFilterPassos(v); load(busca, filterSistema, filterAtivo, 1, sort, v) }
  const ordenarPor = (key: SortKey) => {
    const next = sort?.key === key ? { key, direction: sort.direction === 'asc' ? 'desc' as const : 'asc' as const } : { key, direction: 'asc' as const }
    setSort(next)
    load(busca, filterSistema, filterAtivo, 1, next)
  }

  const duplicarTour = async (tour: TourGuiado) => {
    setDuplicandoId(tour.id)
    setMensagem(null)
    try {
      const copia = await post<TourGuiado>(`/tours/${tour.id}/duplicar`, {})
      setMensagem({ tipo: 'sucesso', texto: `Tour duplicado com sucesso: "${copia.titulo}".` })
      // Mostra o feedback antes de sair da listagem, para não perdê-lo no redirecionamento.
      redirectTimer.current = window.setTimeout(() => navigate(`/tours/${copia.id}/editar`), 900)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível duplicar o tour. Tente novamente.' })
    } finally {
      setDuplicandoId(null)
    }
  }

  const removerTour = async () => {
    if (!tourRemover) return
    const tour = tourRemover
    setRemovendoId(tour.id)
    setMensagem(null)
    try {
      await del(`/tours/${tour.id}`)
      setMensagem({ tipo: 'sucesso', texto: 'Tour removido com sucesso.' })
      setTourRemover(null)
      // Recarrega a página atual — remover muda o total/paginação (não dá pra
      // só tirar o item da lista local sem também reconferir total/resumo).
      load(busca, filterSistema, filterAtivo, paginaAtual)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível remover o tour. Tente novamente.' })
    } finally {
      setRemovendoId(null)
    }
  }

  const exportarTour = async (tour: TourGuiado) => {
    setExportandoId(tour.id)
    setMensagem(null)
    try {
      const envelope = await get<TourExportEnvelope>(`/tours/${tour.id}/exportar`)
      downloadJson(`${tour.slug}.json`, envelope)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível exportar o tour. Tente novamente.' })
    } finally {
      setExportandoId(null)
    }
  }

  const tourImportado = (tour: TourGuiado) => {
    setModalImportarAberto(false)
    setImportarViaGravador(false)
    setMensagem({ tipo: 'sucesso', texto: 'Tour importado como rascunho.' })
    // Mostra o feedback antes de sair da listagem, para não perdê-lo no redirecionamento.
    redirectTimer.current = window.setTimeout(() => navigate(`/tours/${tour.id}/editar`), 900)
  }

  // Mesmo padrão de web/src/pages/tours/Dashboard.tsx: spinner de tela cheia
  // só na carga inicial; erro de tela cheia só se ainda não houver dado
  // nenhum pra mostrar. Trocas de página/filtro depois disso mantêm a
  // listagem atual visível (esmaecida) enquanto a próxima página carrega —
  // ver o wrapper com opacity-50 mais abaixo.
  if (loading && !data) return <div className="px-4 lg:px-margin-desktop py-5"><LoadingSpinner /></div>
  if (error && !data) {
    return (
      <div className="px-4 lg:px-margin-desktop py-5">
        <ErrorState message={error} onRetry={() => load(busca, filterSistema, filterAtivo, 1)} />
      </div>
    )
  }
  if (!data) return null

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
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Tours Guiados</h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto shrink-0">
              <Button
                variant="ghost"
                onClick={() => navigate('/tours/guia')}
                fullWidthMobile
                iconLeft={<span className="material-symbols-outlined text-[18px]">menu_book</span>}
              >
                Guia de Uso
              </Button>
              {podeExcluirOuImportar && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    // Fase 6E — trial no limite: importar também cria um tour
                    // novo (mesmo bloqueio do backend em tours.ts importar()),
                    // então nem abre o modal, só avisa.
                    if (limiteTours.atingido) { setMensagem({ tipo: 'erro', texto: limiteTours.mensagem! }); return }
                    setImportarViaGravador(false)
                    setModalImportarAberto(true)
                  }}
                  fullWidthMobile
                  iconLeft={<span className="material-symbols-outlined text-[18px]">upload_file</span>}
                >
                  Importar JSON
                </Button>
              )}
              {podeEscrever && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // Fase 6E — o gravador termina criando um tour novo, então
                      // recebe o mesmo bloqueio de "Novo Tour Guiado" abaixo.
                      if (limiteTours.atingido) { setMensagem({ tipo: 'erro', texto: limiteTours.mensagem! }); return }
                      navigate('/tours/gravador')
                    }}
                    fullWidthMobile
                    iconLeft={<span className="material-symbols-outlined text-[18px]">radio_button_checked</span>}
                  >
                    Gravar fluxo
                  </Button>
                  <Button
                    onClick={() => {
                      // Fase 6E — trial no limite: nem navega pro formulário,
                      // só avisa (mesma mensagem do backend). Continua
                      // permitido editar/desativar/excluir tours existentes.
                      if (limiteTours.atingido) { setMensagem({ tipo: 'erro', texto: limiteTours.mensagem! }); return }
                      navigate('/tours/novo')
                    }}
                    variant="gradient"
                    size="lg"
                    fullWidthMobile
                    iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
                  >
                    Novo Tour Guiado
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-5 border-b border-outline-variant/30 bg-surface-container-low/30">
            <MetricCard label="Total de tours" value={resumo.total.toLocaleString('pt-BR')} icon="map" />
            <MetricCard label="Tours ativos" value={resumo.ativos.toLocaleString('pt-BR')} icon="play_circle" />
            <MetricCard label="Tours inativos" value={resumo.inativos.toLocaleString('pt-BR')} icon="pause_circle" />
            <MetricCard label="Total de passos" value={resumo.total_passos.toLocaleString('pt-BR')} icon="format_list_numbered" />
          </div>

          <div className="flex flex-col gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface-container-lowest xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-label-md font-bold uppercase tracking-wide text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary">list_alt</span>
                Localizados
              </p>
              <p className="text-label-md text-outline">
                {totalFiltrado.toLocaleString('pt-BR')} de {resumo.total.toLocaleString('pt-BR')} tour{resumo.total === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex items-center gap-2 xl:justify-end">
              {buscaAberta ? (
                <div className="relative w-full min-w-[220px] xl:w-80">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
                  <input
                    autoFocus
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Filtrar por título ou sistema..."
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
                  aria-label="Buscar tour"
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
                    <div className="border-b border-outline-variant/30 px-4 py-3"><p className="text-label-md font-bold text-on-surface">Colunas visíveis</p></div>
                    <div className="p-2">
                      <button type="button" onClick={() => setColunasVisiveis(COLUNAS_INICIAIS)} className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-body-md font-bold text-primary transition-colors hover:bg-primary-fixed">
                        Mostrar todas
                        <span className="material-symbols-outlined text-[16px]">select_all</span>
                      </button>
                      {TABLE_COLUMNS.map(col => (
                        <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-body-md text-on-surface transition-colors hover:bg-surface-container-low">
                          <input type="checkbox" checked={colunasVisiveis[col.key]} disabled={col.key === 'tour'} onChange={() => alternarColuna(col.key)} className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary" />
                          <span className={col.key === 'tour' ? 'text-on-surface-variant' : ''}>{col.label}</span>
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
                  <div className="absolute right-0 z-[80] mt-2 max-h-[min(32rem,calc(100vh-8rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-3">
                      <p className="text-label-md font-bold text-on-surface">Filtrar tours</p>
                      {totalFiltrosAtivos > 0 && <button type="button" onClick={clearFilters} className="text-label-md font-bold text-primary hover:underline">Limpar</button>}
                    </div>
                    <div className="grid grid-cols-1 gap-3 p-4">
                      <FilterSelect label="Status" value={filterAtivo} options={STATUS_FILTRO} onChange={value => mudarStatus(value as StatusFiltro)} />
                      <FilterSelect
                        label="Sistema"
                        value={filterSistema}
                        options={[{ value: '', label: 'Todos os sistemas' }, ...sistemas.map(s => ({ value: s, label: s }))]}
                        onChange={mudarSistema}
                      />
                      <FilterSelect
                        label="Passos"
                        value={filterPassos}
                        options={[
                          { value: 'todos', label: 'Todos' },
                          { value: 'com', label: 'Com passos' },
                          { value: 'sem', label: 'Sem passos' },
                        ]}
                        onChange={value => mudarPassos(value as FiltroPassos)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-outline-variant/30 bg-surface-container-low/30">
              {busca && <FilterChip label={busca} onRemove={() => { setBusca(''); load('', filterSistema, filterAtivo, 1) }} />}
              {filterSistema && <FilterChip label={filterSistema} onRemove={() => mudarSistema('')} />}
              {filterAtivo !== 'todos' && (
                <FilterChip label={filterAtivo === 'ativos' ? 'Ativos' : 'Inativos'} onRemove={() => mudarStatus('todos')} />
              )}
              {filterPassos !== 'todos' && (
                <FilterChip label={filterPassos === 'com' ? 'Com passos' : 'Sem passos'} onRemove={() => mudarPassos('todos')} />
              )}
              <button type="button" onClick={clearFilters} className="ml-auto text-label-md font-bold text-on-surface-variant transition-colors hover:text-error">
                Limpar filtros
              </button>
            </div>
          )}

          {error && (
            <p className="px-5 py-3 text-label-md text-error flex items-center gap-1.5 border-b border-outline-variant/30">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </p>
          )}

          <div className={loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
          {items.length === 0 ? (
            <EmptyState
              icon="map"
              title={resumo.total === 0 ? 'Nenhum tour guiado criado ainda' : 'Nenhum tour encontrado'}
              description={resumo.total === 0 ? 'Crie o primeiro tour para guiar seus usuários pela aplicação.' : 'Ajuste os filtros para ver outros tours.'}
              action={
                resumo.total === 0 && podeEscrever ? (
                  <button
                    onClick={() => navigate('/tours/novo')}
                    className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-md"
                  >
                    Novo Tour Guiado
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop (>= xl): tabela. Com a sidebar aberta (248px), lg (1024px) só
                  sobra ~776px de conteúdo — estreito demais para 6 colunas + ações,
                  cortando a coluna de Ações. xl (1280px) garante ~1032px de conteúdo,
                  e overflow-x-auto é a rede de segurança para telas ainda mais
                  apertadas (não deixa as ações serem cortadas, rola em vez disso). */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/50 border-b border-outline-variant/40">
                      {TABLE_COLUMNS.filter(col => colunasVisiveis[col.key]).map(col => {
                        const active = sort?.key === col.sortKey
                        const align = col.key === 'acoes' ? ' text-right' : col.key === 'status' || col.key === 'passos' ? ' text-center' : ''
                        return (
                          <th key={col.key} className={`px-4 py-3 text-[11px] text-on-surface-variant font-bold uppercase tracking-wide whitespace-nowrap${align}`}>
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
                    {items.map(tour => (
                      <tr key={tour.id} className={`group transition-colors ${!tour.ativo ? 'opacity-60' : ''} hover:bg-surface-container-low/60`}>
                        {colunasVisiveis.tour && <td className="px-4 py-4 align-middle max-w-[360px]">
                          {podeEscrever ? (
                            <button
                              onClick={() => navigate(`/tours/${tour.id}/editar`)}
                              className="text-body-md font-bold text-on-surface hover:text-primary transition-colors text-left"
                            >
                              {tour.titulo}
                            </button>
                          ) : (
                            <span className="text-body-md font-bold text-on-surface">{tour.titulo}</span>
                          )}
                          {tour.descricao && (
                            <p className="text-label-sm text-on-surface-variant truncate max-w-xs">{tour.descricao}</p>
                          )}
                        </td>}
                        {colunasVisiveis.sistema && <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant whitespace-nowrap">{tour.sistema}</td>}
                        {colunasVisiveis.status && <td className="px-4 py-4 align-middle text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2.5">
                            <StatusBadge ativo={tour.ativo} />
                          </div>
                        </td>}
                        {colunasVisiveis.passos && <td className="px-4 py-4 align-middle text-body-md font-bold text-center text-on-surface whitespace-nowrap">
                          {tour._count?.passos ?? tour.passos?.length ?? 0} passo(s)
                        </td>}
                        {colunasVisiveis.atualizado && <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant whitespace-nowrap">{formatDateTime(tour.atualizado_em)}</td>}
                        {colunasVisiveis.acoes && <td className="px-4 py-4 align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end opacity-70 group-hover:opacity-100 transition-opacity">
                            <TourActions
                              tour={tour}
                              navigate={navigate}
                              duplicandoId={duplicandoId}
                              onDuplicar={duplicarTour}
                              exportandoId={exportandoId}
                              onExportar={exportarTour}
                              removendoId={removendoId}
                              onRemover={setTourRemover}
                              podeEscrever={podeEscrever}
                              podeExcluir={podeExcluirOuImportar}
                            />
                          </div>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Abaixo de xl (mobile, tablet e telas menores com sidebar aberta): cards */}
              <div className="xl:hidden divide-y divide-outline-variant/20">
                {items.map(tour => (
                  <div key={tour.id} className={`p-4 ${!tour.ativo ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      {podeEscrever ? (
                        <button
                          onClick={() => navigate(`/tours/${tour.id}/editar`)}
                          className="text-body-md font-bold text-on-surface hover:text-primary transition-colors text-left min-w-0 truncate"
                        >
                          {tour.titulo}
                        </button>
                      ) : (
                        <span className="text-body-md font-bold text-on-surface min-w-0 truncate">{tour.titulo}</span>
                      )}
                    </div>
                    {tour.descricao && (
                      <p className="text-label-sm text-on-surface-variant truncate mb-2">{tour.descricao}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge ativo={tour.ativo} />
                      </div>
                      <span className="text-label-sm text-on-surface-variant">{tour.sistema}</span>
                      <span className="text-label-sm text-on-surface-variant">
                        · {tour._count?.passos ?? tour.passos?.length ?? 0} passo(s)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-sm text-outline">Atualizado {formatDateTime(tour.atualizado_em)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <TourActions
                          tour={tour}
                          navigate={navigate}
                          duplicandoId={duplicandoId}
                          onDuplicar={duplicarTour}
                          exportandoId={exportandoId}
                          onExportar={exportarTour}
                          removendoId={removendoId}
                          onRemover={setTourRemover}
                          podeEscrever={podeEscrever}
                          podeExcluir={podeExcluirOuImportar}
                          size="lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={paginaAtual} total={totalFiltrado} perPage={perPageAtual} onChange={mudarPagina} />
            </>
          )}
          </div>
        </div>
      </section>

      {modalImportarAberto && (
        <ImportarTourModal
          onClose={() => { setModalImportarAberto(false); setImportarViaGravador(false) }}
          onImported={tourImportado}
          avisoColar={importarViaGravador}
        />
      )}

      {tourRemover && (
        <ConfirmDialog
          title={`Remover "${tourRemover.titulo}"?`}
          description="Esta ação não poderá ser desfeita. O tour e seus passos serão removidos permanentemente."
          confirmLabel="Remover tour"
          variant="danger"
          loading={removendoId === tourRemover.id}
          onConfirm={removerTour}
          onCancel={() => setTourRemover(null)}
        />
      )}
    </div>
  )
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-label-md font-bold ${ativo ? 'text-tertiary' : 'text-error'}`}>
      <span className={`h-2 w-2 rounded-full ${ativo ? 'bg-tertiary' : 'bg-error'}`} />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function TourActions({
  tour, navigate, duplicandoId, onDuplicar, exportandoId, onExportar, removendoId, onRemover, podeEscrever, podeExcluir, size = 'md',
}: {
  tour: TourGuiado
  navigate: NavigateFunction
  duplicandoId: string | null
  onDuplicar: (tour: TourGuiado) => void
  exportandoId: string | null
  onExportar: (tour: TourGuiado) => void
  removendoId: string | null
  onRemover: (tour: TourGuiado) => void
  podeEscrever: boolean
  podeExcluir: boolean
  size?: 'md' | 'lg'
}) {
  const btnPad = size === 'lg' ? 'p-2' : 'p-1.5'
  const btnCls = `${btnPad} rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors`
  return (
    <>
      <button onClick={() => navigate(`/tours/${tour.id}/preview`)} title="Preview" aria-label={`Abrir preview de ${tour.titulo}`} className={`${btnPad} rounded-full text-on-surface-variant hover:text-primary hover:bg-primary-fixed transition-colors`}>
        <span className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
      <button onClick={() => navigate(`/tours/${tour.id}/dashboard`)} title="Ver dashboard" aria-label={`Abrir dashboard de ${tour.titulo}`} className={`${btnPad} rounded-full text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed transition-colors`}>
        <span className="material-symbols-outlined text-[18px]">query_stats</span>
      </button>
      {podeEscrever && (
        <button onClick={() => navigate(`/tours/${tour.id}/editar`)} title="Editar" aria-label={`Editar ${tour.titulo}`} className={btnCls}>
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      )}
      {podeEscrever && (
        <button onClick={() => onDuplicar(tour)} disabled={duplicandoId === tour.id} title="Duplicar" aria-label={`Duplicar ${tour.titulo}`} className={`${btnCls} disabled:opacity-40`}>
          <span className={`material-symbols-outlined text-[18px] ${duplicandoId === tour.id ? 'animate-spin' : ''}`}>
            {duplicandoId === tour.id ? 'progress_activity' : 'content_copy'}
          </span>
        </button>
      )}
      <button onClick={() => onExportar(tour)} disabled={exportandoId === tour.id} title="Exportar JSON" aria-label={`Exportar JSON de ${tour.titulo}`} className={`${btnCls} disabled:opacity-40`}>
        <span className={`material-symbols-outlined text-[18px] ${exportandoId === tour.id ? 'animate-spin' : ''}`}>
          {exportandoId === tour.id ? 'progress_activity' : 'download'}
        </span>
      </button>
      {podeExcluir && (
        <button
          onClick={() => onRemover(tour)}
          disabled={removendoId === tour.id}
          title="Remover"
          aria-label={`Remover ${tour.titulo}`}
          className={`${btnPad} rounded-full text-error hover:bg-error-container transition-colors disabled:opacity-40`}
        >
          <span className={`material-symbols-outlined text-[18px] ${removendoId === tour.id ? 'animate-spin' : ''}`}>
            {removendoId === tour.id ? 'progress_activity' : 'delete'}
          </span>
        </button>
      )}
    </>
  )
}

function ImportarTourModal({ onClose, onImported, avisoColar = false }: {
  onClose: () => void
  onImported: (tour: TourGuiado) => void
  // true quando aberto via /tours?importarJson=1 (botão "Copiar e abrir
  // importação" do Gravador de Fluxo) — o JSON já foi copiado lá, então só
  // orienta o usuário a colar e foca o campo de texto pra facilitar.
  avisoColar?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [colarAviso, setColarAviso] = useState<string | null>(null)
  const [colarStatus, setColarStatus] = useState<'idle' | 'colado'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const colarTimer = useRef<number | null>(null)

  useEffect(() => {
    if (avisoColar) textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (colarTimer.current) window.clearTimeout(colarTimer.current)
  }, [])

  // "Colar JSON": só lê a área de transferência e preenche o textarea — nunca
  // importa sozinho (o botão "Importar" continua exigindo clique manual, com
  // a mesma validação de sempre). Nada é salvo em localStorage/sessionStorage
  // nem enviado a lugar nenhum além do próprio campo de texto local.
  const colarJson = async () => {
    setColarAviso(null)
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setColarAviso('Não foi possível acessar a área de transferência. Use Ctrl+V para colar manualmente.')
      return
    }
    try {
      const conteudo = await navigator.clipboard.readText()
      if (!conteudo.trim()) {
        setColarAviso('A área de transferência está vazia.')
        return
      }
      setTexto(conteudo)
      setErro(null)
      textareaRef.current?.focus()
      setColarStatus('colado')
      if (colarTimer.current) window.clearTimeout(colarTimer.current)
      colarTimer.current = window.setTimeout(() => setColarStatus('idle'), 1600)
    } catch {
      setColarAviso('Não foi possível acessar a área de transferência. Use Ctrl+V para colar manualmente.')
    }
  }

  // Validação básica no cliente antes de gastar uma chamada de API — o
  // backend revalida tudo de novo (mesma validarPassos usada em criar/editar).
  const validarFormatoBasico = (json: unknown): string | null => {
    if (!json || typeof json !== 'object') return 'JSON inválido.'
    const obj = json as Record<string, unknown>
    const tour = (obj.tour && typeof obj.tour === 'object') ? (obj.tour as Record<string, unknown>) : obj
    if (!tour.titulo || typeof tour.titulo !== 'string') return 'Campo "titulo" ausente ou inválido.'
    if (!tour.sistema || typeof tour.sistema !== 'string') return 'Campo "sistema" ausente ou inválido.'
    if (!Array.isArray(tour.passos) || tour.passos.length === 0) return 'O tour precisa ter ao menos um passo em "passos".'
    return null
  }

  const importar = async () => {
    setErro(null)
    let json: unknown
    try {
      json = JSON.parse(texto)
    } catch {
      setErro('JSON malformado. Confira se colou o conteúdo completo.')
      return
    }
    const erroFormato = validarFormatoBasico(json)
    if (erroFormato) {
      setErro(erroFormato)
      return
    }
    setEnviando(true)
    try {
      const tour = await post<TourGuiado>('/tours/importar', json)
      onImported(tour)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível importar o tour. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30 shrink-0">
          <h3 className="text-title-lg font-bold text-on-surface">Importar tour (JSON)</h3>
          <button onClick={onClose} title="Fechar" aria-label="Fechar" className="p-1 text-outline hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {avisoColar && (
            <div className="p-2.5 bg-tertiary/10 text-tertiary rounded-lg text-label-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">content_paste</span>
                JSON copiado. Cole o conteúdo abaixo para importar o tour gravado.
              </span>
              <button
                type="button"
                onClick={colarJson}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-surface-bright border border-tertiary/30 text-tertiary rounded-lg text-label-sm font-bold hover:bg-tertiary/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">{colarStatus === 'colado' ? 'check' : 'content_paste_go'}</span>
                {colarStatus === 'colado' ? 'Colado!' : 'Colar JSON'}
              </button>
            </div>
          )}
          {colarAviso && (
            <div className="p-2.5 bg-surface-container-low text-on-surface-variant rounded-lg text-label-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">info</span>
              {colarAviso}
            </div>
          )}
          <p className="text-label-md text-on-surface-variant">
            Cole o JSON exportado de outro tour. O tour será criado como rascunho — id, slug e status de ativação do
            JSON são ignorados.
          </p>
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={10}
            placeholder={'{\n  "formato": "userpulse.tour.v1",\n  "tour": { "titulo": "...", "sistema": "...", "passos": [...] }\n}'}
            className="w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          {erro && (
            <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {erro}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={importar}
            disabled={!texto.trim() || enviando}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-50"
          >
            {enviando ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  )
}
