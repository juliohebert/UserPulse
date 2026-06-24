import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { DashboardData } from '../../types'
import { formatDate } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'

export function CampanhaDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    get<DashboardData>(`/dashboard/campanhas/${id}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const maxDist = data ? Math.max(1, ...Object.values(data.distribuicao)) : 1

  const notaColor = (n: number) => {
    if (n <= 3) return 'bg-error'
    if (n <= 6) return 'bg-yellow-400'
    return 'bg-tertiary'
  }

  return (
    <section className="px-4 lg:px-margin-desktop py-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <nav className="flex gap-2 text-label-md text-outline mb-1">
            <button onClick={() => navigate('/campanhas')} className="hover:text-primary transition-colors">Campanhas</button>
            <span>/</span>
            <span className="text-on-surface">Dashboard</span>
          </nav>
          <h2 className="text-headline-lg font-bold text-on-surface">
            {data?.campanha.titulo ?? 'Dashboard da Campanha'}
          </h2>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => navigate(`/campanhas/${id}/preview`)}
            className="flex items-center gap-1.5 px-4 py-2 border border-primary text-primary rounded-xl text-label-md font-bold hover:bg-primary-fixed transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            Preview
          </button>
          <button
            onClick={() => navigate(`/campanhas/${id}/editar`)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Editar
          </button>
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && data && (
        <>
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <TypeBadge tipo={data.campanha.tipo} />
            <span className="text-label-md text-outline">{data.campanha.sistema} · {data.campanha.tela}</span>
            <span className="text-label-md text-outline">Criada em {formatDate(data.campanha.criado_em)}</span>
          </div>

          {/* Engajamento */}
          <div className="mb-2">
            <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-3">Engajamento</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard
                icon="visibility"
                iconColor="text-primary"
                iconBg="bg-primary/10"
                label="Visualizações"
                value={data.visualizacoes.toLocaleString('pt-BR')}
                sub="vezes exibida"
              />
              <KpiCard
                icon="ads_click"
                iconColor="text-secondary"
                iconBg="bg-secondary/10"
                label="Cliques no CTA"
                value={data.cliques_cta.toLocaleString('pt-BR')}
                sub="cliques registrados"
              />
              <KpiCard
                icon="percent"
                iconColor="text-tertiary"
                iconBg="bg-tertiary/10"
                label="Taxa de Clique"
                value={`${data.taxa_clique.toLocaleString('pt-BR')}%`}
                sub={
                  data.visualizacoes > 0
                    ? `${data.cliques_cta} de ${data.visualizacoes}`
                    : 'sem visualizações'
                }
              />
            </div>
          </div>

          {/* Confirmações de Leitura */}
          {data.campanha.exige_confirmacao_leitura && (
            <div className="mt-5 mb-5">
              <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-3">Confirmações de Leitura</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KpiCard
                  icon="verified"
                  iconColor="text-tertiary"
                  iconBg="bg-tertiary/10"
                  label="Total de Confirmações"
                  value={data.total_confirmacoes.toLocaleString('pt-BR')}
                  sub="usuários confirmaram"
                  large
                />
                <KpiCard
                  icon="percent"
                  iconColor="text-primary"
                  iconBg="bg-primary/10"
                  label="Taxa de Confirmação"
                  value={`${data.percentual_confirmacao.toLocaleString('pt-BR')}%`}
                  sub={data.visualizacoes > 0 ? `${data.total_confirmacoes} de ${data.visualizacoes}` : 'sem visualizações'}
                  large
                />
              </div>
            </div>
          )}

          {/* Feedback */}
          <div className="mt-5 mb-5">
            <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-3">Feedback</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard
                icon="star"
                iconColor="text-yellow-500"
                iconBg="bg-yellow-50"
                label="Média da Nota"
                value={data.media !== null ? data.media.toFixed(1) : '—'}
                sub="de 10"
                large
              />
              <KpiCard
                icon="forum"
                iconColor="text-tertiary"
                iconBg="bg-tertiary/10"
                label="Total de Respostas"
                value={data.total.toLocaleString('pt-BR')}
                sub="feedbacks"
                large
              />
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm">
                <p className="text-label-md text-outline mb-1">Pergunta configurada</p>
                <p className="text-body-md text-on-surface font-medium leading-snug mt-2">
                  {data.campanha.pergunta_feedback ?? data.campanha.descricao}
                </p>
              </div>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm mb-5">
            <h3 className="text-title-lg font-bold text-on-surface mb-6">Distribuição de Notas</h3>
            {data.total === 0 ? (
              <p className="text-body-md text-outline">Nenhuma resposta ainda.</p>
            ) : (
              <div className="flex items-end gap-2 h-32">
                {Array.from({ length: 11 }, (_, i) => {
                  const count = data.distribuicao[String(i)] ?? 0
                  const height = Math.round((count / maxDist) * 100)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-outline font-bold">{count > 0 ? count : ''}</span>
                      <div className="w-full rounded-t flex items-end justify-center" style={{ height: '96px' }}>
                        <div
                          className={`w-full rounded-t transition-all ${notaColor(i)}`}
                          style={{ height: `${Math.max(height, count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-outline font-bold">{i}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent feedbacks */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/30">
              <h3 className="text-title-lg font-bold text-on-surface">Feedbacks Recentes</h3>
            </div>
            {data.feedbacks_recentes.length === 0 ? (
              <p className="text-body-md text-outline p-5">Nenhum feedback registrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      {['Nota', 'Observação', 'Usuário', 'Sistema', 'Tela', 'Data'].map(h => (
                        <th key={h} className="px-6 py-3 text-label-md text-on-surface-variant uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {data.feedbacks_recentes.map(f => (
                      <tr key={f.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-label-md font-bold text-white ${notaColor(f.nota)}`}>
                            {f.nota}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-body-md text-on-surface max-w-[240px]">
                          {f.observacao ?? <span className="text-outline italic">—</span>}
                        </td>
                        <td className="px-6 py-4 text-body-md">
                          {f.usuario_nome ?? f.usuario_email ?? <span className="text-outline italic">Anônimo</span>}
                        </td>
                        <td className="px-6 py-4 text-body-md text-on-surface-variant">{f.sistema ?? '—'}</td>
                        <td className="px-6 py-4 text-body-md text-on-surface-variant">{f.tela ?? '—'}</td>
                        <td className="px-6 py-4 text-label-md text-outline whitespace-nowrap">{formatDate(f.criado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

interface KpiCardProps {
  icon: string
  iconColor: string
  iconBg: string
  label: string
  value: string
  sub: string
  large?: boolean
}

function KpiCard({ icon, iconColor, iconBg, label, value, sub, large }: KpiCardProps) {
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          <span className={`material-symbols-outlined ${iconColor} text-[22px]`}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-label-md text-outline">{label}</p>
          <p className={`font-bold text-on-surface leading-none mt-1 ${large ? 'text-display-sm' : 'text-headline-lg'}`}>
            {value}
          </p>
          <p className="text-label-md text-outline mt-1">{sub}</p>
        </div>
      </div>
    </div>
  )
}
