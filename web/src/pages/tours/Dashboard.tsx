import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { EventoTourDashboard, TourDashboardData } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'

const PER_PAGE = 10
const NI = 'Não informado'

type FiltroTipoEvento = 'todos' | 'inicio' | 'concluido' | 'pulado' | 'elemento_nao_encontrado'

const FILTROS_TIPO_EVENTO: { value: FiltroTipoEvento; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'inicio', label: 'Início' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'pulado', label: 'Pulado' },
  { value: 'elemento_nao_encontrado', label: 'Elemento não encontrado' },
]

export function TourDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<TourDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoEvento>('todos')

  const load = () => {
    if (!id) return
    setLoading(true)
    setError(null)
    get<TourDashboardData>(`/tours/${id}/dashboard`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  if (loading) return <div className="px-4 lg:px-margin-desktop py-5"><LoadingSpinner /></div>
  if (error || !data) {
    return (
      <div className="px-4 lg:px-margin-desktop py-5">
        <ErrorState message={error ?? 'Tour guiado não encontrado.'} onRetry={load} />
      </div>
    )
  }

  const { tour, eventos_recentes } = data
  const eventosFiltrados = filtroTipo === 'todos'
    ? eventos_recentes
    : eventos_recentes.filter(e => e.tipo_evento === filtroTipo)
  const paginados = eventosFiltrados.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const temFiltro = filtroTipo !== 'todos'

  return (
    <section className="px-4 lg:px-margin-desktop py-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <nav className="flex gap-2 text-label-md text-outline mb-1">
            <button onClick={() => navigate('/tours')} className="hover:text-primary transition-colors">Tours Guiados</button>
            <span>/</span>
            <span className="text-on-surface">Dashboard</span>
          </nav>
          <h2 className="text-headline-lg font-bold text-on-surface">{tour.titulo}</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            {tour.sistema}
            {tour.tela ? ` · ${tour.tela}` : ''}
            {' — '}
            <span className={tour.ativo ? 'text-tertiary font-semibold' : 'text-outline font-semibold'}>
              {tour.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => navigate(`/tours/${tour.id}/preview`)}
            className="flex items-center gap-1.5 px-4 py-2 border border-primary text-primary rounded-xl text-label-md font-bold hover:bg-primary-fixed transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">play_circle</span>
            Testar tour
          </button>
          <button
            onClick={() => navigate(`/tours/${tour.id}/editar`)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Editar
          </button>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard icon="play_circle" iconColor="text-primary" iconBg="bg-primary/10"
          label="Iniciados" value={data.iniciados} />
        <KpiCard icon="check_circle" iconColor="text-tertiary" iconBg="bg-tertiary/10"
          label="Concluídos" value={data.concluidos} />
        <KpiCard icon="skip_next" iconColor="text-secondary" iconBg="bg-secondary/10"
          label="Pulados" value={data.pulados} />
        <KpiCard icon="search_off" iconColor="text-error" iconBg="bg-error/10"
          label="Elementos não encontrados" value={data.elementos_nao_encontrados} />
        <KpiCard icon="percent" iconColor="text-primary" iconBg="bg-primary/10"
          label="Taxa de conclusão" value={`${data.taxa_conclusao.toLocaleString('pt-BR')}%`}
          sub={`${data.concluidos} de ${data.iniciados}`} />
      </div>

      {/* Eventos recentes */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant">history</span>
            <div>
              <h3 className="text-title-lg font-bold text-on-surface">Eventos recentes</h3>
              <p className="text-label-md text-outline mt-0.5">
                {temFiltro
                  ? `${eventosFiltrados.length} de ${eventos_recentes.length} eventos`
                  : `Últimos ${eventos_recentes.length} eventos registrados para este tour.`}
              </p>
            </div>
          </div>
          {eventos_recentes.length > 0 && (
            <div className="flex gap-1 p-1 bg-surface-container rounded-xl w-fit flex-wrap">
              {FILTROS_TIPO_EVENTO.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setFiltroTipo(opt.value); setPage(1) }}
                  className={`px-3.5 py-2 rounded-lg text-label-md font-bold transition-all whitespace-nowrap ${
                    filtroTipo === opt.value ? 'bg-surface-bright text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {eventos_recentes.length === 0 ? (
          <EmptyState
            icon="history"
            title="Nenhum evento registrado ainda"
            description="Os eventos aparecem aqui assim que o tour for exibido para os usuários."
          />
        ) : eventosFiltrados.length === 0 ? (
          <EmptyState
            icon="filter_alt_off"
            title="Nenhum evento encontrado"
            description="Nenhum evento corresponde ao filtro selecionado. Tente escolher outro tipo."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    {['Data/Hora', 'Tipo', 'Passo', 'Usuário', 'Cliente', 'Clínica/Unidade'].map(h => (
                      <th key={h} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {paginados.map(ev => <EventoRow key={ev.id} evento={ev} />)}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={eventosFiltrados.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </div>
    </section>
  )
}

// Prioriza nome sobre e-mail/ID. Quando só sobra o ID como identificador,
// ele é exibido — mas marcado como "fallback" para render discreto na tabela.
function resolverPessoa(evento: EventoTourDashboard): { texto: string; isFallbackId: boolean } {
  if (evento.usuario_nome) return { texto: evento.usuario_nome, isFallbackId: false }
  if (evento.usuario_email) return { texto: evento.usuario_email, isFallbackId: false }
  if (evento.usuario_id) return { texto: evento.usuario_id, isFallbackId: true }
  return { texto: '—', isFallbackId: false }
}

function resolverCliente(evento: EventoTourDashboard): { texto: string; isFallbackId: boolean } {
  if (evento.cliente_nome) return { texto: evento.cliente_nome, isFallbackId: false }
  if (evento.cliente_id) return { texto: evento.cliente_id, isFallbackId: true }
  return { texto: '—', isFallbackId: false }
}

function resolverUnidade(evento: EventoTourDashboard): { texto: string; isFallbackId: boolean } {
  if (evento.unidade_nome) return { texto: evento.unidade_nome, isFallbackId: false }
  if (evento.unidade_id) return { texto: evento.unidade_id, isFallbackId: true }
  return { texto: '—', isFallbackId: false }
}

function EventoRow({ evento }: { evento: EventoTourDashboard }) {
  return (
    <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap align-middle">
        <CellText value={formatDateTime(evento.criado_em)} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-middle">
        <EventoTourBadge tipo={evento.tipo_evento} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-middle max-w-[220px]">
        {evento.passo_ordem != null ? (
          <span className="text-[13px] text-on-surface truncate block" title={evento.passo_titulo ?? undefined}>
            #{evento.passo_ordem + 1} {evento.passo_titulo ?? ''}
          </span>
        ) : (
          <CellText value={NI} />
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-middle">
        <PessoaCell {...resolverPessoa(evento)} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-middle">
        <PessoaCell {...resolverCliente(evento)} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-middle">
        <PessoaCell {...resolverUnidade(evento)} />
      </td>
    </tr>
  )
}

function PessoaCell({ texto, isFallbackId }: { texto: string; isFallbackId: boolean }) {
  if (texto === '—') {
    return <span className="text-[13px] text-outline italic">—</span>
  }
  return (
    <span
      className={isFallbackId ? 'text-[12px] text-on-surface-variant font-mono' : 'text-[13px] text-on-surface'}
      title={isFallbackId ? 'ID — nome não informado' : undefined}
    >
      {texto}
    </span>
  )
}

function CellText({ value }: { value: string }) {
  const empty = value === NI
  return (
    <span className={`text-[13px] leading-snug ${empty ? 'text-outline italic' : 'text-on-surface'}`}>
      {value}
    </span>
  )
}

const EVENTO_TOUR_BADGES: Record<string, { icon: string; label: string; className: string }> = {
  inicio: { icon: 'play_circle', label: 'Início', className: 'bg-primary/10 text-primary' },
  passo_visualizado: { icon: 'visibility', label: 'Passo visualizado', className: 'bg-secondary/10 text-secondary' },
  elemento_nao_encontrado: { icon: 'search_off', label: 'Elemento não encontrado', className: 'bg-error/10 text-error' },
  pulado: { icon: 'skip_next', label: 'Pulado', className: 'bg-yellow-100 text-yellow-700' },
  concluido: { icon: 'check_circle', label: 'Concluído', className: 'bg-tertiary/10 text-tertiary' },
}

function EventoTourBadge({ tipo }: { tipo: string }) {
  const cfg = EVENTO_TOUR_BADGES[tipo] ?? { icon: 'radio_button_checked', label: tipo, className: 'bg-surface-container text-on-surface-variant' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${cfg.className}`}>
      <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

function KpiCard({ icon, iconColor, iconBg, label, value, sub }: {
  icon: string; iconColor: string; iconBg: string; label: string; value: string | number; sub?: string
}) {
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          <span className={`material-symbols-outlined ${iconColor} text-[22px]`}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-label-md text-outline">{label}</p>
          <p className="text-headline-lg font-bold text-on-surface leading-none mt-1">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </p>
          {sub && <p className="text-label-md text-outline mt-1">{sub}</p>}
        </div>
      </div>
    </div>
  )
}
