import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, del, put } from '../../services/api'
import type { Campanha } from '../../types'
import { getStatus, formatDate, gerarEmbed } from '../../utils/campanha'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { CampanhaQuickView } from './CampanhaQuickView'

const PER_PAGE = 10
const TIPOS = ['comunicado', 'melhoria', 'pesquisa']
const STATUS_OPTIONS = ['ativa', 'inativa', 'agendada', 'encerrada']
const CATEGORIAS = ['Novidade', 'Melhoria', 'Treinamento', 'Pesquisa', 'Comunicado', 'Obrigatório']

const selectCls =
  'w-full rounded-xl border border-outline-variant py-2.5 px-3 text-body-md bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary'

export function CampanhasIndex() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [filterBusca, setFilterBusca] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterSistema, setFilterSistema] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [quickView, setQuickView] = useState<Campanha | null>(null)

  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    setError(null)
    get<Campanha[]>('/campanhas')
      .then(setCampanhas)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const sistemas = [...new Set(campanhas.map(c => c.sistema).filter(Boolean))]

  const busca = filterBusca.trim().toLowerCase()
  const filtered = campanhas.filter(c => {
    if (busca) {
      const matchTitulo = c.titulo.toLowerCase().includes(busca)
      const matchSubtitulo = (c.subtitulo ?? '').toLowerCase().includes(busca)
      if (!matchTitulo && !matchSubtitulo) return false
    }
    if (filterTipo && c.tipo !== filterTipo) return false
    if (filterSistema && c.sistema !== filterSistema) return false
    if (filterStatus && getStatus(c) !== filterStatus) return false
    if (filterCategoria && c.categoria !== filterCategoria) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const clearFilters = () => {
    setFilterBusca('')
    setFilterTipo('')
    setFilterSistema('')
    setFilterStatus('')
    setFilterCategoria('')
    setPage(1)
  }

  const hasFilters = Boolean(filterBusca || filterTipo || filterSistema || filterStatus || filterCategoria)

  const handleToggle = async (c: Campanha) => {
    try {
      const updated = await put<Campanha>(`/campanhas/${c.id}`, { ativo: !c.ativo })
      setCampanhas(prev => prev.map(x => (x.id === c.id ? updated : x)))
      if (quickView?.id === c.id) setQuickView(updated)
    } catch {
      alert('Erro ao atualizar status da campanha.')
    }
  }

  const handleCopyEmbed = (c: Campanha) => {
    navigator.clipboard.writeText(gerarEmbed(c)).catch(() => {})
    setCopiedId(c.id)
    setTimeout(() => setCopiedId(prev => (prev === c.id ? null : prev)), 2000)
  }

  const handleInativar = async (id: string) => {
    if (!window.confirm('Deseja inativar esta campanha? Ela deixará de ser exibida para os usuários, mas o histórico será preservado.')) return
    try {
      await del(`/campanhas/${id}`)
      setCampanhas(prev => prev.map(c => c.id === id ? { ...c, ativo: false } : c))
      if (quickView?.id === id) setQuickView(prev => prev ? { ...prev, ativo: false } : null)
    } catch {
      alert('Erro ao inativar campanha.')
    }
  }

  const totalFeedbacks = campanhas.reduce((s, c) => s + (c._count?.feedbacks ?? 0), 0)
  const ativas = campanhas.filter(c => getStatus(c) === 'ativa').length

  return (
    <section className="px-4 lg:px-margin-desktop py-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <nav className="flex text-label-md text-outline mb-1 gap-2">
            <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">UserPulse</button>
            <span>/</span>
            <span className="font-bold text-on-surface">Campanhas</span>
          </nav>
          <h2 className="text-headline-lg font-bold text-on-surface">Biblioteca de Campanhas</h2>
          {!loading && !error && (
            <p className="text-body-md text-on-surface-variant mt-0.5">
              {campanhas.length} {campanhas.length === 1 ? 'campanha' : 'campanhas'} no total
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/campanhas/nova')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-opacity active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nova Campanha
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant mb-5 shadow-sm space-y-3">
        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={filterBusca}
            onChange={e => { setFilterBusca(e.target.value); setPage(1) }}
            placeholder="Buscar por título ou subtítulo…"
            className="w-full rounded-xl border border-outline-variant py-2.5 pl-10 pr-4 text-body-md bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {filterBusca && (
            <button
              onClick={() => { setFilterBusca(''); setPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Row filters */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-label-md text-on-surface-variant px-1 block">Tipo</label>
            <select value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(1) }} className={selectCls}>
              <option value="">Todos os tipos</option>
              {TIPOS.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-md text-on-surface-variant px-1 block">Categoria</label>
            <select value={filterCategoria} onChange={e => { setFilterCategoria(e.target.value); setPage(1) }} className={selectCls}>
              <option value="">Todas as categorias</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-md text-on-surface-variant px-1 block">Sistema</label>
            <select value={filterSistema} onChange={e => { setFilterSistema(e.target.value); setPage(1) }} className={selectCls}>
              <option value="">Todos os sistemas</option>
              {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-label-md text-on-surface-variant px-1 block">Status</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} className={selectCls}>
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              disabled={!hasFilters}
              className="w-full py-2.5 border border-primary text-primary font-bold rounded-xl hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 pt-1">
            {filterBusca && (
              <FilterChip label={`"${filterBusca}"`} onRemove={() => { setFilterBusca(''); setPage(1) }} />
            )}
            {filterTipo && (
              <FilterChip label={filterTipo.charAt(0).toUpperCase() + filterTipo.slice(1)} onRemove={() => { setFilterTipo(''); setPage(1) }} />
            )}
            {filterCategoria && (
              <FilterChip label={filterCategoria} onRemove={() => { setFilterCategoria(''); setPage(1) }} />
            )}
            {filterSistema && (
              <FilterChip label={filterSistema} onRemove={() => { setFilterSistema(''); setPage(1) }} />
            )}
            {filterStatus && (
              <FilterChip label={filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} onRemove={() => { setFilterStatus(''); setPage(1) }} />
            )}
            <span className="text-label-md text-on-surface-variant self-center">
              — {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        {loading && <LoadingSpinner />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    {['Campanha', 'Tipo', 'Sistema / Tela', 'Status', 'Respostas', 'Ações'].map(h => (
                      <th key={h} className="px-5 py-4 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon="campaign"
                          title={hasFilters ? 'Nenhum resultado' : 'Nenhuma campanha ainda'}
                          description={
                            hasFilters
                              ? 'Ajuste os filtros ou a busca para ver mais resultados.'
                              : 'Crie sua primeira campanha para começar.'
                          }
                          action={
                            !hasFilters ? (
                              <button
                                onClick={() => navigate('/campanhas/nova')}
                                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-md"
                              >
                                Nova Campanha
                              </button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    paginated.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => setQuickView(c)}
                        className={`cursor-pointer transition-colors ${
                          quickView?.id === c.id
                            ? 'bg-primary-fixed/60'
                            : 'hover:bg-surface-container-low/60'
                        }`}
                      >
                        {/* Campanha */}
                        <td className="px-5 py-4 max-w-[280px]">
                          <p className="text-body-md font-bold text-on-surface truncate">{c.titulo}</p>
                          {c.subtitulo && (
                            <p className="text-[12px] text-primary truncate mt-0.5">{c.subtitulo}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {c.categoria && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-secondary/10 text-secondary">
                                {c.categoria}
                              </span>
                            )}
                            <span className="text-[11px] text-on-surface-variant">{formatDate(c.criado_em)}</span>
                          </div>
                        </td>

                        {/* Tipo */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <TypeBadge tipo={c.tipo} />
                        </td>

                        {/* Sistema / Tela */}
                        <td className="px-5 py-4">
                          <p className="text-body-md text-on-surface">{c.sistema}</p>
                          <p className="text-[12px] text-on-surface-variant">{c.tela}</p>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div onClick={e => e.stopPropagation()}>
                              <ToggleSwitch checked={c.ativo} onChange={() => handleToggle(c)} />
                            </div>
                            <StatusBadge status={getStatus(c)} />
                          </div>
                        </td>

                        {/* Respostas */}
                        <td className="px-5 py-4 text-body-md font-bold text-center">
                          {(c._count?.feedbacks ?? 0).toLocaleString('pt-BR')}
                        </td>

                        {/* Ações */}
                        <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/campanhas/${c.id}/preview`)}
                            title="Preview"
                            className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-fixed rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                          </button>
                          <button
                            onClick={() => handleCopyEmbed(c)}
                            title="Copiar embed"
                            className={`p-2 rounded-lg transition-all ${
                              copiedId === c.id
                                ? 'text-tertiary bg-tertiary/10'
                                : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {copiedId === c.id ? 'check' : 'integration_instructions'}
                            </span>
                          </button>
                          <button
                            onClick={() => navigate(`/campanhas/${c.id}/editar`)}
                            title="Editar"
                            className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            onClick={() => navigate(`/campanhas/${c.id}/dashboard`)}
                            title="Ver Dashboard"
                            className="p-2 text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-[20px]">query_stats</span>
                          </button>
                          <button
                            onClick={() => handleInativar(c.id)}
                            title="Inativar"
                            className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-all"
                          >
                            <span className="material-symbols-outlined text-[20px]">block</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </div>

      {/* Quick Stats */}
      {!loading && !error && campanhas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          {[
            { icon: 'trending_up', color: 'primary', label: 'Total de Campanhas', value: `${campanhas.length}` },
            { icon: 'star', color: 'secondary', label: 'Campanhas Ativas', value: `${ativas}` },
            { icon: 'forum', color: 'tertiary', label: 'Total de Feedbacks', value: totalFeedbacks.toLocaleString('pt-BR') },
          ].map(item => (
            <div
              key={item.label}
              className={`bg-surface-container p-5 rounded-xl border border-outline-variant flex items-center gap-4 group hover:border-${item.color} transition-colors shadow-sm`}
            >
              <div className={`w-12 h-12 rounded-xl bg-${item.color}/10 flex items-center justify-center text-${item.color} group-hover:scale-110 transition-transform`}>
                <span className="material-symbols-outlined text-[28px] ms-fill">{item.icon}</span>
              </div>
              <div>
                <p className="text-label-md text-on-surface-variant">{item.label}</p>
                <p className="text-headline-md font-bold text-on-surface">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick View Drawer */}
      {quickView && (
        <CampanhaQuickView
          campanha={quickView}
          onClose={() => setQuickView(null)}
        />
      )}
    </section>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-label-md border border-primary/20">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-error transition-colors">
        <span className="material-symbols-outlined text-[14px] leading-none">close</span>
      </button>
    </span>
  )
}
