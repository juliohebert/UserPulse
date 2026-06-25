import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { DashboardData, Feedback } from '../../types'
import { formatDate } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'

// ─── column definitions ───────────────────────────────────────────────────────

interface ColDef {
  id: string
  label: string
  defaultOn: boolean
  wrap?: boolean
}

const COLUNAS: ColDef[] = [
  { id: 'data',             label: 'Data',             defaultOn: true  },
  { id: 'nota',             label: 'Nota',             defaultOn: true  },
  { id: 'observacao',       label: 'Feedback',         defaultOn: true,  wrap: true },
  { id: 'telefone',         label: 'Telefone',         defaultOn: false },
  { id: 'usuario_id',       label: 'Usuário ID',       defaultOn: false },
  { id: 'usuario_nome',     label: 'Usuário Nome',     defaultOn: true  },
  { id: 'usuario_email',    label: 'Usuário E-mail',   defaultOn: false },
  { id: 'usuario_tipo',     label: 'Usuário Tipo',     defaultOn: false },
  { id: 'cliente_id',       label: 'Cliente ID',       defaultOn: false },
  { id: 'cliente_nome',     label: 'Cliente Nome',     defaultOn: false },
  { id: 'cliente_local_id', label: 'Cliente Local ID', defaultOn: false },
  { id: 'unidade_id',       label: 'Unidade ID',       defaultOn: false },
  { id: 'unidade_nome',     label: 'Unidade Nome',     defaultOn: false },
  { id: 'unidade_local_id', label: 'Unidade Local ID', defaultOn: false },
  { id: 'organizacao_id',   label: 'Organização ID',   defaultOn: false },
  { id: 'organizacao_nome', label: 'Organização Nome', defaultOn: false },
  { id: 'clinica_id',       label: 'Clínica ID',       defaultOn: false },
  { id: 'clinica_nome',     label: 'Clínica Nome',     defaultOn: false },
  { id: 'estado',           label: 'Estado',           defaultOn: false },
  { id: 'perfil',           label: 'Perfil',           defaultOn: false },
]

const DEFAULT_COLS = new Set(COLUNAS.filter(c => c.defaultOn).map(c => c.id))
const NI = 'Não informado'

function getCellValue(f: Feedback, colId: string): string {
  const ctx = (f.contexto ?? {}) as Record<string, string>
  switch (colId) {
    case 'data':             return formatDate(f.criado_em)
    case 'nota':             return String(f.nota)
    case 'observacao':       return f.observacao?.trim() || NI
    case 'telefone':         return f.telefone_contato?.trim() || NI
    case 'usuario_id':       return f.usuario_id || NI
    case 'usuario_nome':     return f.usuario_nome || ctx.usuario_nome || NI
    case 'usuario_email':    return f.usuario_email || ctx.usuario_email || NI
    case 'usuario_tipo':     return ctx.usuario_tipo || NI
    case 'cliente_id':       return ctx.cliente_id || NI
    case 'cliente_nome':     return ctx.cliente_nome || NI
    case 'cliente_local_id': return ctx.cliente_local_id || NI
    case 'unidade_id':       return ctx.unidade_id || NI
    case 'unidade_nome':     return ctx.unidade_nome || NI
    case 'unidade_local_id': return ctx.unidade_local_id || NI
    case 'organizacao_id':   return ctx.organizacao_id || NI
    case 'organizacao_nome': return ctx.organizacao_nome || NI
    case 'clinica_id':       return ctx.clinica_id || NI
    case 'clinica_nome':     return ctx.clinica_nome || NI
    case 'estado':           return ctx.Estado || NI
    case 'perfil':           return ctx.Perfil || NI
    default:                 return NI
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export function CampanhaDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => new Set(DEFAULT_COLS))
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    get<DashboardData>(`/dashboard/campanhas/${id}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (!showColMenu) return
    function handleClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColMenu])

  const toggleCol = (colId: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      next.has(colId) ? next.delete(colId) : next.add(colId)
      return next
    })
  }

  const activeCols = COLUNAS.filter(c => visibleCols.has(c.id))
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
              <KpiCard icon="visibility" iconColor="text-primary" iconBg="bg-primary/10"
                label="Visualizações" value={data.visualizacoes.toLocaleString('pt-BR')} sub="vezes exibida" />
              <KpiCard icon="ads_click" iconColor="text-secondary" iconBg="bg-secondary/10"
                label="Cliques no CTA" value={data.cliques_cta.toLocaleString('pt-BR')} sub="cliques registrados" />
              <KpiCard icon="percent" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Taxa de Clique" value={`${data.taxa_clique.toLocaleString('pt-BR')}%`}
                sub={data.visualizacoes > 0 ? `${data.cliques_cta} de ${data.visualizacoes}` : 'sem visualizações'} />
            </div>
          </div>

          {/* Confirmações de Leitura */}
          {data.campanha.exige_confirmacao_leitura && (
            <div className="mt-5 mb-5">
              <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-3">Confirmações de Leitura</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KpiCard icon="verified" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                  label="Total de Confirmações" value={data.total_confirmacoes.toLocaleString('pt-BR')} sub="usuários confirmaram" large />
                <KpiCard icon="percent" iconColor="text-primary" iconBg="bg-primary/10"
                  label="Taxa de Confirmação" value={`${data.percentual_confirmacao.toLocaleString('pt-BR')}%`}
                  sub={data.visualizacoes > 0 ? `${data.total_confirmacoes} de ${data.visualizacoes}` : 'sem visualizações'} large />
              </div>
            </div>
          )}

          {/* Feedback KPIs */}
          <div className="mt-5 mb-5">
            <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-3">Feedback</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard icon="star" iconColor="text-yellow-500" iconBg="bg-yellow-50"
                label="Média da Nota" value={data.media !== null ? data.media.toFixed(1) : '—'} sub="de 10" large />
              <KpiCard icon="forum" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Total de Respostas" value={data.total.toLocaleString('pt-BR')} sub="feedbacks" large />
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

          {/* Respostas com seletor de colunas */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-title-lg font-bold text-on-surface">
                Respostas
                <span className="ml-2 text-label-md font-normal text-outline">({data.feedbacks_recentes.length})</span>
              </h3>

              <div className="relative" ref={colMenuRef}>
                <button
                  onClick={() => setShowColMenu(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">view_column</span>
                  Colunas ({visibleCols.size})
                </button>

                {showColMenu && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-2 w-52 max-h-80 overflow-y-auto">
                    {COLUNAS.map(col => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-container-low cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={visibleCols.has(col.id)}
                          onChange={() => toggleCol(col.id)}
                          className="accent-primary w-4 h-4 shrink-0"
                        />
                        <span className="text-body-sm text-on-surface">{col.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tabela */}
            {data.feedbacks_recentes.length === 0 ? (
              <p className="text-body-md text-outline p-5">Nenhum feedback registrado.</p>
            ) : activeCols.length === 0 ? (
              <p className="text-body-md text-outline p-5">Selecione ao menos uma coluna para exibir.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      {activeCols.map(col => (
                        <th
                          key={col.id}
                          className="px-5 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {data.feedbacks_recentes.map(f => (
                      <tr key={f.id} className="hover:bg-surface-container-low/50 transition-colors">
                        {activeCols.map(col => (
                          <td
                            key={col.id}
                            className={`px-5 py-3 ${col.wrap ? 'max-w-[280px]' : 'whitespace-nowrap'}`}
                          >
                            {col.id === 'nota' ? (
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-label-md font-bold text-white ${notaColor(f.nota)}`}>
                                {f.nota}
                              </span>
                            ) : (
                              <CellText value={getCellValue(f, col.id)} />
                            )}
                          </td>
                        ))}
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function CellText({ value }: { value: string }) {
  const empty = value === NI
  return (
    <span className={`text-[13px] leading-snug ${empty ? 'text-outline italic' : 'text-on-surface'}`}>
      {value}
    </span>
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
