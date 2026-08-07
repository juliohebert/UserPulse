import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, del, put } from '../../services/api'
import type { Jornada } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConteudo, podeExcluirOuImportarConteudo } from '../../utils/permissions'

const PER_PAGE = 10

// Mesmo padrão visual dos KPIs de /campanhas e /tours (ícone + número grande + rótulo).
function KpiCard({
  label, icon, iconBg, iconColor, value,
}: {
  label: string
  icon: string
  iconBg: string
  iconColor: string
  value: string | number
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow p-5 flex items-center gap-4">
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-headline-md font-bold text-on-surface leading-none">{value}</p>
        <p className="text-label-md font-semibold text-on-surface-variant mt-1.5 truncate">{label}</p>
      </div>
    </div>
  )
}

// Ponto + texto em vez de pill preenchida — mesmo padrão leve usado em /tours e /campanhas.
function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${
      ativo ? 'text-tertiary' : 'text-outline'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ativo ? 'bg-tertiary' : 'bg-outline'}`} />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
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
  const [busca, setBusca] = useState('')
  const [filterAtivo, setFilterAtivo] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
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

  const q = busca.trim().toLowerCase()
  const filtered = jornadas.filter(j => {
    if (filterAtivo === 'ativos' && !j.ativo) return false
    if (filterAtivo === 'inativos' && j.ativo) return false
    if (q && !`${j.titulo} ${j.slug}`.toLowerCase().includes(q)) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const ativas = jornadas.filter(j => j.ativo).length
  const inativas = jornadas.length - ativas
  const totalEtapas = jornadas.reduce((s, j) => s + (j._count?.etapas ?? 0), 0)

  const clearFilters = () => {
    setBusca('')
    setFilterAtivo('todos')
    setPage(1)
  }
  const hasFilters = Boolean(busca || filterAtivo !== 'todos')

  const STATUS_TABS = [
    { key: 'todos' as const, label: 'Todas', icon: 'apps', count: jornadas.length },
    { key: 'ativos' as const, label: 'Ativas', icon: 'play_circle', count: ativas },
    { key: 'inativos' as const, label: 'Inativas', icon: 'pause_circle', count: inativas },
  ]

  const toggleAtivo = async (jornada: Jornada) => {
    setJornadas(prev => prev.map(j => (j.id === jornada.id ? { ...j, ativo: !j.ativo } : j)))
    try {
      await put(`/jornadas/${jornada.id}`, { ativo: !jornada.ativo })
    } catch {
      setJornadas(prev => prev.map(j => (j.id === jornada.id ? { ...j, ativo: jornada.ativo } : j)))
    }
  }

  const excluirJornada = async (jornada: Jornada) => {
    if (!window.confirm('Remover este item? Esta ação não poderá ser desfeita.')) return
    setExcluindoId(jornada.id)
    setMensagem(null)
    try {
      await del(`/jornadas/${jornada.id}`)
      setJornadas(prev => prev.filter(j => j.id !== jornada.id))
      setMensagem({ tipo: 'sucesso', texto: 'Jornada removida com sucesso.' })
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível remover a jornada. Tente novamente.' })
    } finally {
      setExcluindoId(null)
    }
  }

  return (
    <div>
      <section className="px-4 lg:px-margin-desktop py-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <nav className="flex text-label-md text-outline mb-1 gap-2">
              <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">UserPulse</button>
              <span>/</span>
              <span className="font-bold text-on-surface">Jornadas</span>
            </nav>
            <h2 className="text-headline-lg font-bold text-on-surface">Jornadas</h2>
            {!loading && !error && (
              <p className="text-body-md text-on-surface-variant mt-0.5">
                {jornadas.length} {jornadas.length === 1 ? 'jornada' : 'jornadas'} no total
              </p>
            )}
          </div>
          {podeEscrever && (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => navigate('/jornadas/novo')}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-opacity active:scale-95 w-full sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Nova Jornada
              </button>
            </div>
          )}
        </div>

        {/* KPIs */}
        {!loading && !error && jornadas.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <KpiCard label="Total de Jornadas" icon="route" iconBg="bg-primary/10" iconColor="text-primary" value={jornadas.length} />
            <KpiCard label="Jornadas Ativas" icon="play_circle" iconBg="bg-tertiary/10" iconColor="text-tertiary" value={ativas} />
            <KpiCard label="Jornadas Inativas" icon="pause_circle" iconBg="bg-outline-variant/40" iconColor="text-on-surface-variant" value={inativas} />
            <KpiCard label="Total de Etapas" icon="checklist" iconBg="bg-secondary/10" iconColor="text-secondary" value={totalEtapas} />
          </div>
        )}

        {mensagem && (
          <div className={`mb-4 p-3 rounded-xl text-body-md flex items-center gap-2 ${
            mensagem.tipo === 'sucesso' ? 'bg-tertiary/10 text-tertiary' : 'bg-error-container text-on-error-container'
          }`}>
            <span className="material-symbols-outlined text-[18px]">{mensagem.tipo === 'sucesso' ? 'check_circle' : 'error'}</span>
            {mensagem.texto}
          </div>
        )}

        {/* Filters */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant mb-5 shadow-sm space-y-2.5">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px] pointer-events-none">search</span>
            <input
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1) }}
              placeholder="Buscar jornada por título ou slug..."
              className="w-full h-11 pl-9 pr-3 bg-surface-bright border border-outline-variant rounded-xl text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Status tabs + limpar filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 p-1 bg-surface-container rounded-xl w-full sm:w-fit">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setFilterAtivo(tab.key); setPage(1) }}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-label-md font-bold transition-all ${
                    filterAtivo === tab.key
                      ? 'bg-surface-bright text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${
                    filterAtivo === tab.key
                      ? tab.key === 'ativos' ? 'text-tertiary' : tab.key === 'inativos' ? 'text-outline' : 'text-primary'
                      : ''
                  }`}>
                    {tab.icon}
                  </span>
                  {tab.label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    filterAtivo === tab.key ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 sm:ml-auto text-label-md text-on-surface-variant hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/30">
            <h3 className="text-title-lg font-bold text-on-surface">Jornadas</h3>
            <p className="text-label-md text-on-surface-variant mt-0.5">
              {loading
                ? 'Carregando jornadas…'
                : `Mostrando ${filtered.length} ${filtered.length === 1 ? 'jornada' : 'jornadas'} conforme os filtros aplicados`}
            </p>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="route"
              title={jornadas.length === 0 ? 'Nenhuma jornada criada ainda' : 'Nenhuma jornada encontrada'}
              description={jornadas.length === 0 ? 'Crie a primeira jornada para guiar o onboarding dos seus usuários.' : 'Ajuste os filtros para ver outras jornadas.'}
              action={
                jornadas.length === 0 && podeEscrever ? (
                  <button
                    onClick={() => navigate('/jornadas/novo')}
                    className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-md"
                  >
                    Nova Jornada
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto hidden xl:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-outline-variant/40 text-left">
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant">Título</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Status</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Etapas</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Atualizado em</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(jornada => (
                      <tr key={jornada.id} className="group border-b border-outline-variant/20 last:border-0 hover:bg-surface-container-low/60 transition-colors">
                        <td className="px-5 py-3.5 align-middle">
                          {podeEscrever ? (
                            <button
                              onClick={() => navigate(`/jornadas/${jornada.id}/editar`)}
                              className="text-body-md font-semibold text-on-surface hover:text-primary transition-colors text-left"
                            >
                              {jornada.titulo}
                            </button>
                          ) : (
                            <span className="text-body-md font-semibold text-on-surface">{jornada.titulo}</span>
                          )}
                          {jornada.descricao && (
                            <p className="text-label-sm text-on-surface-variant truncate max-w-xs">{jornada.descricao}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            {podeEscrever && <ToggleSwitch checked={jornada.ativo} onChange={() => toggleAtivo(jornada)} />}
                            <StatusBadge ativo={jornada.ativo} />
                          </div>
                        </td>
                        <td className="px-5 py-3.5 align-middle text-body-md text-on-surface-variant whitespace-nowrap">
                          {jornada._count?.etapas ?? 0} etapa(s)
                        </td>
                        <td className="px-5 py-3.5 align-middle text-body-md text-on-surface-variant whitespace-nowrap">{formatDateTime(jornada.atualizado_em)}</td>
                        <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            <JornadaActions jornada={jornada} navigate={navigate} excluindoId={excluindoId} onExcluir={excluirJornada} podeEscrever={podeEscrever} podeExcluir={podeExcluir} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="xl:hidden divide-y divide-outline-variant/50">
                {paginated.map(jornada => (
                  <div key={jornada.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      {podeEscrever ? (
                        <button
                          onClick={() => navigate(`/jornadas/${jornada.id}/editar`)}
                          className="text-body-md font-semibold text-on-surface hover:text-primary transition-colors text-left min-w-0 truncate"
                        >
                          {jornada.titulo}
                        </button>
                      ) : (
                        <span className="text-body-md font-semibold text-on-surface min-w-0 truncate">{jornada.titulo}</span>
                      )}
                    </div>
                    {jornada.descricao && (
                      <p className="text-label-sm text-on-surface-variant truncate mb-2">{jornada.descricao}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        {podeEscrever && <ToggleSwitch checked={jornada.ativo} onChange={() => toggleAtivo(jornada)} />}
                        <StatusBadge ativo={jornada.ativo} />
                      </div>
                      <span className="text-label-sm text-on-surface-variant">
                        · {jornada._count?.etapas ?? 0} etapa(s)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-sm text-outline">Atualizado {formatDateTime(jornada.atualizado_em)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <JornadaActions jornada={jornada} navigate={navigate} excluindoId={excluindoId} onExcluir={excluirJornada} podeEscrever={podeEscrever} podeExcluir={podeExcluir} size="lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
        </div>
      </section>
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
  const btnCls = `${btnPad} rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors`
  return (
    <>
      {podeEscrever && (
        <button onClick={() => navigate(`/jornadas/${jornada.id}/editar`)} title="Editar" className={btnCls}>
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      )}
      {podeExcluir && (
        <button
          onClick={() => onExcluir(jornada)}
          disabled={excluindoId === jornada.id}
          title="Remover"
          className={`${btnPad} rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-40`}
        >
          <span className={`material-symbols-outlined text-[18px] ${excluindoId === jornada.id ? 'animate-spin' : ''}`}>
            {excluindoId === jornada.id ? 'progress_activity' : 'delete'}
          </span>
        </button>
      )}
    </>
  )
}
