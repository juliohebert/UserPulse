import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, del } from '../services/api'
import type { Campanha, TourGuiado } from '../types'
import { getStatus, formatDate } from '../utils/campanha'
import { StatusBadge } from '../components/ui/StatusBadge'
import { TypeBadge } from '../components/ui/TypeBadge'
import { LoadingSpinner, ErrorState } from '../components/ui/EmptyState'

function MetricCard({
  label, icon, iconColor, value, trend, trendColor,
}: {
  label: string
  icon: string
  iconColor: string
  value: string | number
  trend?: string
  trendColor?: string
}) {
  return (
    <div className="bg-surface-container-lowest p-stack-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between h-32 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <span className="text-label-md font-medium text-outline">{label}</span>
        <span className={`p-2 rounded-lg ${iconColor}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
      <div>
        <p className="text-headline-md font-bold text-on-surface">{value}</p>
        {trend && (
          <p className={`text-[12px] flex items-center gap-1 ${trendColor ?? 'text-outline'}`}>
            {trend}
          </p>
        )}
      </div>
    </div>
  )
}

function Atalho({
  icon, iconBg, iconColor, label, onClick,
}: {
  icon: string
  iconBg: string
  iconColor: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm hover:shadow-md hover:border-primary/40 transition-all text-left"
    >
      <span className={`p-2 rounded-lg shrink-0 ${iconBg} ${iconColor}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <span className="text-label-md font-bold text-on-surface leading-tight">{label}</span>
    </button>
  )
}

function TourStatusChip({ ativo }: { ativo: boolean }) {
  return (
    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
      ativo ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'
    }`}>
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

const BAR_HEIGHTS = [40, 60, 50, 80, 70, 100, 85]
const CATEGORIAS = ['Novidade', 'Melhoria', 'Treinamento', 'Pesquisa', 'Comunicado', 'Obrigatório']

// Feed combinado de campanhas + tours guiados — não existe endpoint de
// atividade unificado no backend, então a lista é montada no front a partir
// dos dois recursos já carregados para esta tela, ordenada por criado_em.
interface AtividadeItem {
  tipo: 'campanha' | 'tour'
  id: string
  titulo: string
  criado_em: string
  meta: string
}

export function Dashboard() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tours, setTours] = useState<TourGuiado[]>([])
  const [toursLoading, setToursLoading] = useState(true)
  const [toursError, setToursError] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    setLoading(true)
    setError(null)
    get<Campanha[]>('/campanhas')
      .then(setCampanhas)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const loadTours = () => {
    setToursLoading(true)
    setToursError(false)
    get<TourGuiado[]>('/tours')
      .then(setTours)
      .catch(() => setToursError(true))
      .finally(() => setToursLoading(false))
  }

  useEffect(() => { load(); loadTours() }, [])

  const total = campanhas.length
  const ativas = campanhas.filter(c => getStatus(c) === 'ativa').length
  const totalFeedbacks = campanhas.reduce((s, c) => s + (c._count?.feedbacks ?? 0), 0)
  const recentes = campanhas.slice(0, 5)
  const maxFeedbacks = Math.max(1, ...recentes.map(c => c._count?.feedbacks ?? 0))

  const porCategoria = CATEGORIAS
    .map(cat => ({ cat, count: campanhas.filter(c => c.categoria === cat).length }))
    .filter(x => x.count > 0)
  const semCategoria = campanhas.filter(c => !c.categoria).length

  const totalTours = tours.length
  const toursAtivos = tours.filter(t => t.ativo).length
  const toursInativos = totalTours - toursAtivos
  const toursRecentes = tours.slice(0, 3)

  const atividades: AtividadeItem[] = [
    ...campanhas.map(c => ({
      tipo: 'campanha' as const,
      id: c.id,
      titulo: c.titulo,
      criado_em: c.criado_em,
      meta: `${c._count?.feedbacks ?? 0} resposta${(c._count?.feedbacks ?? 0) === 1 ? '' : 's'}`,
    })),
    ...tours.map(t => ({
      tipo: 'tour' as const,
      id: t.id,
      titulo: t.titulo,
      criado_em: t.criado_em,
      meta: t.ativo ? 'Tour ativo' : 'Tour em rascunho',
    })),
  ]
    .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
    .slice(0, 5)

  const handleInativar = async (id: string) => {
    if (!window.confirm('Deseja inativar esta campanha? Ela deixará de ser exibida para os usuários, mas o histórico será preservado.')) return
    try {
      await del(`/campanhas/${id}`)
      setCampanhas(prev => prev.map(c => c.id === id ? { ...c, ativo: false } : c))
    } catch {
      alert('Erro ao inativar campanha.')
    }
  }

  return (
    <section className="px-4 lg:px-margin-desktop py-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <nav className="flex text-label-md text-outline mb-1 gap-2">
            <span>UserPulse</span><span>/</span>
            <span className="text-primary font-bold">Dashboard</span>
          </nav>
          <h2 className="text-headline-lg font-bold text-on-surface">Dashboard</h2>
        </div>
        <button
          onClick={() => navigate('/campanhas/nova')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-opacity active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nova Campanha
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-5">
            <MetricCard label="Total de Campanhas" icon="list_alt" iconColor="bg-primary/10 text-primary" value={total} />
            <MetricCard label="Campanhas Ativas" icon="play_circle" iconColor="bg-tertiary/10 text-tertiary" value={ativas} trend="Em andamento" />
            <MetricCard
              label="Feedbacks Coletados"
              icon="forum"
              iconColor="bg-secondary/10 text-secondary"
              value={totalFeedbacks.toLocaleString('pt-BR')}
              trend={totalFeedbacks > 0 ? `${totalFeedbacks} respostas` : 'Nenhuma resposta ainda'}
              trendColor="text-tertiary"
            />
            <MetricCard
              label="Tours Guiados"
              icon="map"
              iconColor="bg-primary/10 text-primary"
              value={toursLoading ? '—' : totalTours}
              trend={toursLoading ? undefined : `${toursAtivos} ativo${toursAtivos === 1 ? '' : 's'}`}
              trendColor="text-tertiary"
            />
            <MetricCard label="Média Geral" icon="star" iconColor="bg-yellow-500/10 text-yellow-600" value="—" trend="Ver por campanha" />
          </div>

          {/* Atalhos rápidos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            <Atalho icon="add_circle" iconBg="bg-primary/10" iconColor="text-primary" label="Nova Campanha" onClick={() => navigate('/campanhas/nova')} />
            <Atalho icon="map" iconBg="bg-secondary/10" iconColor="text-secondary" label="Novo Tour Guiado" onClick={() => navigate('/tours/novo')} />
            <Atalho icon="radio_button_checked" iconBg="bg-tertiary/10" iconColor="text-tertiary" label="Gravar Fluxo" onClick={() => navigate('/tours/gravador')} />
            <Atalho icon="integration_instructions" iconBg="bg-primary/10" iconColor="text-primary" label="Ver Integração" onClick={() => navigate('/integracao')} />
            <Atalho icon="grid_view" iconBg="bg-secondary/10" iconColor="text-secondary" label="Catálogo de Telas" onClick={() => navigate('/catalogo-telas')} />
          </div>

          {/* Campanhas por Categoria */}
          {(porCategoria.length > 0 || semCategoria > 0) && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-5 mb-5">
              <h3 className="text-title-lg font-bold text-on-surface mb-4">Campanhas por Categoria</h3>
              <div className="flex flex-wrap gap-3">
                {porCategoria.map(({ cat, count }) => (
                  <div key={cat} className="flex items-center gap-2 px-3 py-2 bg-secondary/10 rounded-xl border border-secondary/20">
                    <span className="text-label-md font-bold text-secondary">{cat}</span>
                    <span className="text-headline-sm font-bold text-on-surface">{count}</span>
                  </div>
                ))}
                {semCategoria > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-xl border border-outline-variant/30">
                    <span className="text-label-md font-bold text-on-surface-variant">Sem categoria</span>
                    <span className="text-headline-sm font-bold text-on-surface">{semCategoria}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Table + Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Recent Campaigns Table */}
            <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant/30 flex justify-between items-center">
                <h3 className="text-title-lg font-bold text-on-surface">Campanhas Recentes</h3>
                <button onClick={() => navigate('/campanhas')} className="text-primary text-label-md font-bold hover:underline">
                  Ver todas
                </button>
              </div>
              {recentes.length === 0 ? (
                <p className="text-body-md text-outline p-5">Nenhuma campanha criada ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low border-b border-outline-variant">
                      <tr>
                        <th className="px-5 py-3 text-label-md text-on-surface-variant uppercase tracking-wider">Título</th>
                        <th className="px-5 py-3 text-label-md text-on-surface-variant uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-label-md text-on-surface-variant uppercase tracking-wider">Tipo</th>
                        <th className="px-5 py-3 text-label-md text-on-surface-variant uppercase tracking-wider">Respostas</th>
                        <th className="px-5 py-3 text-label-md text-on-surface-variant uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {recentes.map(c => {
                        const pct = Math.round(((c._count?.feedbacks ?? 0) / maxFeedbacks) * 100)
                        return (
                          <tr key={c.id} className="hover:bg-surface-container-low/50 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex flex-col">
                                <span className="text-body-md font-bold text-on-surface">{c.titulo}</span>
                                <span className="text-[11px] text-on-surface-variant">{c.sistema} · {c.tela}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={getStatus(c)} />
                            </td>
                            <td className="px-5 py-4">
                              <TypeBadge tipo={c.tipo} />
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-surface-container rounded-full overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-label-md font-bold">{c._count?.feedbacks ?? 0}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => navigate(`/campanhas/${c.id}/editar`)} title="Editar" className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-fixed rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button onClick={() => navigate(`/campanhas/${c.id}/dashboard`)} title="Dashboard" className="p-2 text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-[20px]">query_stats</span>
                                </button>
                                <button onClick={() => handleInativar(c.id)} title="Inativar" className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-[20px]">block</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="lg:col-span-4 space-y-4">
              {/* Tours Guiados */}
              <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <span className="material-symbols-outlined text-[18px]">map</span>
                    </span>
                    <h3 className="text-title-lg font-bold text-on-surface">Tours Guiados</h3>
                  </div>
                  <button onClick={() => navigate('/tours')} className="text-primary text-label-md font-bold hover:underline shrink-0">
                    Ver todos
                  </button>
                </div>

                {toursLoading ? (
                  <p className="text-body-md text-on-surface-variant py-2">Carregando…</p>
                ) : toursError ? (
                  <p className="text-body-md text-on-surface-variant py-2">Não foi possível carregar os tours guiados agora.</p>
                ) : totalTours === 0 ? (
                  <p className="text-body-md text-on-surface-variant py-2">Nenhum tour guiado criado ainda.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-label-md font-bold text-tertiary">{toursAtivos} ativo{toursAtivos === 1 ? '' : 's'}</span>
                      <span className="text-label-md font-bold text-outline">{toursInativos} inativo{toursInativos === 1 ? '' : 's'}</span>
                    </div>
                    <div className="space-y-1 mb-2">
                      {toursRecentes.map(t => (
                        <button
                          key={t.id}
                          onClick={() => navigate(`/tours/${t.id}/editar`)}
                          className="w-full flex items-center justify-between gap-2 -mx-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-low/60 transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-body-md font-semibold text-on-surface truncate">{t.titulo}</p>
                            <p className="text-[11px] text-on-surface-variant">
                              {t._count?.passos ?? 0} passo{(t._count?.passos ?? 0) === 1 ? '' : 's'}
                            </p>
                          </div>
                          <TourStatusChip ativo={t.ativo} />
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <button
                  onClick={() => navigate('/tours/gravador')}
                  className="w-full mt-3 py-2.5 border border-outline-variant rounded-xl text-label-md font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">radio_button_checked</span>
                  Gravar novo fluxo
                </button>
              </div>

              {/* Volume card */}
              <div className="bg-primary p-4 rounded-xl shadow-lg text-on-primary relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="text-label-md font-bold opacity-80 uppercase tracking-widest mb-3">
                    Volume de Feedback
                  </h4>
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-display-lg font-bold leading-none">
                      {totalFeedbacks >= 1000
                        ? `${(totalFeedbacks / 1000).toFixed(1)}k`
                        : totalFeedbacks}
                    </span>
                    {totalFeedbacks > 0 && (
                      <span className="text-label-md bg-white/20 px-2 py-0.5 rounded-lg mb-1">
                        total
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {BAR_HEIGHTS.map((h, i) => (
                      <div
                        key={i}
                        className={`w-full rounded-t ${i === 5 ? 'bg-white' : 'bg-on-primary/30'}`}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
              </div>

              {/* Activity feed */}
              <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/30">
                <h3 className="text-title-lg font-bold text-on-surface mb-4">Atividade Recente</h3>
                <div className="space-y-4">
                  {atividades.length === 0 ? (
                    <p className="text-body-md text-on-surface-variant">Nenhuma atividade recente.</p>
                  ) : (
                    atividades.map(a => (
                      <button
                        key={`${a.tipo}-${a.id}`}
                        onClick={() => navigate(a.tipo === 'campanha' ? `/campanhas/${a.id}/dashboard` : `/tours/${a.id}/editar`)}
                        className="w-full flex gap-3 text-left -mx-1 px-1 py-1 rounded-lg hover:bg-surface-container-low/60 transition-colors"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          a.tipo === 'campanha' ? 'bg-primary-container' : 'bg-secondary/10'
                        }`}>
                          <span className={`material-symbols-outlined text-[18px] ${a.tipo === 'campanha' ? 'text-primary' : 'text-secondary'}`}>
                            {a.tipo === 'campanha' ? 'campaign' : 'map'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-body-md font-bold text-on-surface truncate">{a.titulo}</p>
                          <p className="text-label-md text-outline">{a.meta} · {formatDate(a.criado_em)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => navigate('/campanhas')}
                  className="w-full mt-4 py-2.5 border border-outline-variant rounded-xl text-label-md font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors"
                >
                  Ver todas as campanhas
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
