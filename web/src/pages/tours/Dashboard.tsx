import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { EventoTourDashboard, FunilPassoItem, ResumoFeedbackTour, TourDashboardData } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { Select } from '../../components/ui/Select'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'

const PER_PAGE = 10
const NI = 'Não informado'

const campo = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary'

interface FiltrosDashboard {
  data_inicio: string
  data_fim: string
  tipo_evento: string
  passo_ordem: string
  cliente: string
  usuario: string
  unidade: string
  busca: string
}

const FILTROS_AVANCADOS_INICIAIS = {
  data_inicio: '', data_fim: '', passo_ordem: '', cliente: '', usuario: '', unidade: '',
}

const FILTROS_INICIAIS: FiltrosDashboard = { ...FILTROS_AVANCADOS_INICIAIS, tipo_evento: '', busca: '' }

function formatarDataInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Sem nenhum filtro preenchido isso vira uma query string com só page/per_page
// — o dashboard chama a mesma consulta de sempre, preservando o
// comportamento atual quando nenhum filtro é aplicado.
function montarQuery(filtros: FiltrosDashboard, pagina: number): string {
  const params = new URLSearchParams()
  if (filtros.data_inicio) params.set('data_inicio', filtros.data_inicio)
  if (filtros.data_fim) params.set('data_fim', filtros.data_fim)
  if (filtros.tipo_evento) params.set('tipo_evento', filtros.tipo_evento)
  if (filtros.passo_ordem) params.set('passo_ordem', filtros.passo_ordem)
  if (filtros.cliente.trim()) params.set('cliente', filtros.cliente.trim())
  if (filtros.usuario.trim()) params.set('usuario', filtros.usuario.trim())
  if (filtros.unidade.trim()) params.set('unidade', filtros.unidade.trim())
  if (filtros.busca.trim()) params.set('busca', filtros.busca.trim())
  params.set('page', String(pagina))
  params.set('per_page', String(PER_PAGE))
  return `?${params.toString()}`
}

function temFiltroAtivo(filtros: FiltrosDashboard): boolean {
  return Object.values(filtros).some(v => v !== '')
}

function qtdFiltrosAvancados(filtros: FiltrosDashboard): number {
  return Object.entries(FILTROS_AVANCADOS_INICIAIS)
    .filter(([chave]) => filtros[chave as keyof typeof FILTROS_AVANCADOS_INICIAIS] !== '').length
}

// Segunda camada de proteção contra NaN na paginação, além do backend já
// sempre enviar page/per_page/total válidos — se a resposta vier incompleta
// (ex.: versão antiga da API em cache), a paginação nunca deve quebrar.
function paginaSegura(n: number | undefined, minimo: number): number {
  return Number.isFinite(n) ? Math.max(minimo, Math.trunc(n as number)) : minimo
}

function ehAtalhoPeriodo(filtros: FiltrosDashboard, diasAtras: number): boolean {
  if (!filtros.data_inicio || !filtros.data_fim) return false
  const hoje = new Date()
  const inicio = new Date(hoje)
  inicio.setDate(inicio.getDate() - diasAtras)
  return filtros.data_fim === formatarDataInput(hoje) && filtros.data_inicio === formatarDataInput(inicio)
}

// "Ver eventos deste passo" no Funil por passo chega aqui com
// ?passo_ordem=N na URL — reaproveita o filtro "Passo do tour" que os
// Filtros avançados já tinham antes desta feature (mesmo query param que
// montarQuery já monta), só lendo o valor inicial da URL em vez de sempre
// começar em FILTROS_INICIAIS. Sem parâmetro na URL, comportamento idêntico
// a antes.
function filtrosIniciaisDaUrl(): FiltrosDashboard {
  const passoOrdem = new URLSearchParams(window.location.search).get('passo_ordem')
  return passoOrdem ? { ...FILTROS_INICIAIS, passo_ordem: passoOrdem } : FILTROS_INICIAIS
}

export function TourDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<TourDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<FiltrosDashboard>(filtrosIniciaisDaUrl)
  const [filtrosCarregados, setFiltrosCarregados] = useState<FiltrosDashboard>(filtrosIniciaisDaUrl)
  const [showAvancados, setShowAvancados] = useState(() => filtrosIniciaisDaUrl().passo_ordem !== '')

  const load = (filtrosParaCarregar: FiltrosDashboard, pagina: number) => {
    if (!id) return
    setLoading(true)
    setError(null)
    get<TourDashboardData>(`/tours/${id}/dashboard${montarQuery(filtrosParaCarregar, pagina)}`)
      .then(d => { setData(d); setFiltrosCarregados(filtrosParaCarregar) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const iniciais = filtrosIniciaisDaUrl()
    setFiltros(iniciais)
    setShowAvancados(iniciais.passo_ordem !== '')
    load(iniciais, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // "Ver eventos deste passo" (Funil por passo) — mesmo filtro de sempre
  // (Passo do tour), só aplicado por um clique em vez do dropdown, e refletido
  // na URL (replace, não empilha histórico) pra ficar copiável/compartilhável.
  const filtrarPorPasso = (ordem: number) => {
    const novo = { ...filtros, passo_ordem: String(ordem) }
    setFiltros(novo)
    setShowAvancados(true)
    load(novo, 1)
    if (id) navigate(`/tours/${id}/dashboard?passo_ordem=${ordem}`, { replace: true })
  }

  const aplicarFiltro = (novosFiltros: FiltrosDashboard) => load(novosFiltros, 1)
  const limparFiltros = () => { setFiltros(FILTROS_INICIAIS); aplicarFiltro(FILTROS_INICIAIS) }
  const limparFiltrosAvancados = () => {
    const novo = { ...filtros, ...FILTROS_AVANCADOS_INICIAIS }
    setFiltros(novo)
    aplicarFiltro(novo)
  }

  const alternarTipoEvento = (valor: string) => {
    const novo = { ...filtros, tipo_evento: filtros.tipo_evento === valor ? '' : valor }
    setFiltros(novo)
    aplicarFiltro(novo)
  }

  const definirAtalhoPeriodo = (diasAtras: number) => {
    const hoje = new Date()
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - diasAtras)
    const novo = { ...filtros, data_inicio: formatarDataInput(inicio), data_fim: formatarDataInput(hoje) }
    setFiltros(novo)
    aplicarFiltro(novo)
  }

  const mudarPagina = (pagina: number) => load(filtrosCarregados, pagina)

  if (loading && !data) return <div className="px-4 lg:px-margin-desktop py-5"><LoadingSpinner /></div>
  if (error && !data) {
    return (
      <div className="px-4 lg:px-margin-desktop py-5">
        <ErrorState message={error} onRetry={() => load(filtrosCarregados, 1)} />
      </div>
    )
  }
  if (!data) return null

  const { tour } = data
  const totalEventos = paginaSegura(data.total, 0)
  const perPageEventos = paginaSegura(data.per_page, PER_PAGE)
  const paginaEventos = paginaSegura(data.page, 1)
  const temFiltro = temFiltroAtivo(filtrosCarregados)
  const opcoesPasso = [
    { value: '', label: 'Todos' },
    ...(tour.passos ?? []).map(p => ({ value: String(p.ordem), label: `Passo ${p.ordem + 1}${p.titulo ? ' — ' + p.titulo : ''}` })),
  ]

  const resumo = `Este tour teve ${data.iniciados} início${data.iniciados === 1 ? '' : 's'}, `
    + `${data.concluidos} conclus${data.concluidos === 1 ? 'ão' : 'ões'}, ${data.pulados} pulo${data.pulados === 1 ? '' : 's'} `
    + `e ${data.elementos_nao_encontrados} falha${data.elementos_nao_encontrados === 1 ? '' : 's'} de elemento `
    + `${filtrosCarregados.data_inicio || filtrosCarregados.data_fim ? 'no período selecionado' : 'até agora'}.`

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
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

      {/* Resumo interpretativo */}
      <p className="text-body-md text-on-surface-variant mb-6 flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">insights</span>
        {resumo}
      </p>

      {/* Funil por passo + resumo de feedback */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="xl:col-span-2">
          <FunilPorPassoSection funil={data.funil_por_passo} tourId={tour.id} onFiltrarPorPasso={filtrarPorPasso} />
        </div>
        <FeedbackResumoSection feedback={data.feedback} />
      </div>

      {/* Eventos do tour */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/30 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant">history</span>
              <div>
                <h3 className="text-title-lg font-bold text-on-surface">Eventos do tour</h3>
                <p className="text-label-md text-outline mt-0.5">
                  {totalEventos} evento{totalEventos === 1 ? '' : 's'}{temFiltro ? ' com os filtros aplicados' : ' registrados'}
                </p>
              </div>
            </div>
            {temFiltroAtivo(filtros) && (
              <button
                onClick={limparFiltros}
                className="flex items-center gap-1 text-label-md text-on-surface-variant hover:text-error transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                Limpar filtros
              </button>
            )}
          </div>

          {/* Busca geral */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline pointer-events-none">search</span>
            <input
              type="text"
              value={filtros.busca}
              onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') aplicarFiltro(filtros) }}
              placeholder="Buscar por usuário, cliente, unidade, passo ou evento..."
              className="w-full pl-9 pr-3 py-2.5 bg-surface-bright border border-outline-variant rounded-xl text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Chips de atalho + botão de filtros avançados */}
          <div className="flex flex-wrap items-center gap-1.5">
            <ChipFiltro label="Todos" active={!filtros.tipo_evento} onClick={() => alternarTipoEvento('')} />
            <ChipFiltro label="Iniciados" active={filtros.tipo_evento === 'inicio'} onClick={() => alternarTipoEvento('inicio')} />
            <ChipFiltro label="Concluídos" active={filtros.tipo_evento === 'concluido'} onClick={() => alternarTipoEvento('concluido')} />
            <ChipFiltro label="Pulados" active={filtros.tipo_evento === 'pulado'} onClick={() => alternarTipoEvento('pulado')} />
            <ChipFiltro label="Elemento não encontrado" active={filtros.tipo_evento === 'elemento_nao_encontrado'} onClick={() => alternarTipoEvento('elemento_nao_encontrado')} />
            <span className="w-px h-5 bg-outline-variant mx-0.5" />
            <ChipFiltro label="Últimos 7 dias" active={ehAtalhoPeriodo(filtros, 6)} onClick={() => definirAtalhoPeriodo(6)} />
            <ChipFiltro label="Últimos 30 dias" active={ehAtalhoPeriodo(filtros, 29)} onClick={() => definirAtalhoPeriodo(29)} />
            <button
              onClick={() => setShowAvancados(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                qtdFiltrosAvancados(filtros) > 0
                  ? 'bg-secondary/10 text-secondary border-secondary/30'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50 hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">tune</span>
              Filtros avançados
              {qtdFiltrosAvancados(filtros) > 0 && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-secondary text-on-secondary text-[10px] flex items-center justify-center">
                  {qtdFiltrosAvancados(filtros)}
                </span>
              )}
              <span className="material-symbols-outlined text-[13px]">{showAvancados ? 'expand_less' : 'expand_more'}</span>
            </button>
          </div>

          {/* Filtros avançados — colapsável */}
          {showAvancados && (
            <div className="pt-1 space-y-3 border-t border-outline-variant/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Data inicial</label>
                  <input
                    type="date"
                    value={filtros.data_inicio}
                    onChange={e => setFiltros(f => ({ ...f, data_inicio: e.target.value }))}
                    className={campo}
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Data final</label>
                  <input
                    type="date"
                    value={filtros.data_fim}
                    onChange={e => setFiltros(f => ({ ...f, data_fim: e.target.value }))}
                    className={campo}
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Passo do tour</label>
                  <Select
                    value={filtros.passo_ordem}
                    onChange={v => setFiltros(f => ({ ...f, passo_ordem: v }))}
                    options={opcoesPasso}
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Cliente</label>
                  <input
                    type="text"
                    value={filtros.cliente}
                    onChange={e => setFiltros(f => ({ ...f, cliente: e.target.value }))}
                    placeholder="Nome ou ID do cliente"
                    className={campo}
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Usuário</label>
                  <input
                    type="text"
                    value={filtros.usuario}
                    onChange={e => setFiltros(f => ({ ...f, usuario: e.target.value }))}
                    placeholder="Nome, e-mail ou ID"
                    className={campo}
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Unidade/Clínica</label>
                  <input
                    type="text"
                    value={filtros.unidade}
                    onChange={e => setFiltros(f => ({ ...f, unidade: e.target.value }))}
                    placeholder="Nome ou ID"
                    className={campo}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {qtdFiltrosAvancados(filtros) > 0 && (
                  <button
                    onClick={limparFiltrosAvancados}
                    className="px-4 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
                  >
                    Limpar
                  </button>
                )}
                <button
                  onClick={() => aplicarFiltro(filtros)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">filter_alt</span>
                  Aplicar filtros
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="px-5 py-3 text-label-md text-error flex items-center gap-1.5 border-b border-outline-variant/30">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
          </p>
        )}

        <div className={loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
          {data.eventos_recentes.length === 0 ? (
            <EmptyState
              icon={temFiltro ? 'filter_alt_off' : 'history'}
              title={temFiltro ? 'Nenhum evento encontrado' : 'Nenhum evento registrado ainda'}
              description={temFiltro
                ? 'Nenhum evento corresponde aos filtros aplicados. Tente ajustar o período ou limpar os filtros.'
                : 'Os eventos aparecem aqui assim que o tour for exibido para os usuários.'}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      {['Data/Hora', 'Tipo', 'Passo', 'Usuário', 'Cliente', 'Clínica/Unidade'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {data.eventos_recentes.map(ev => <EventoRow key={ev.id} evento={ev} />)}
                  </tbody>
                </table>
              </div>
              <Pagination page={paginaEventos} total={totalEventos} perPage={perPageEventos} onChange={mudarPagina} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function ChipFiltro({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border whitespace-nowrap ${
        active
          ? 'bg-primary text-on-primary border-primary'
          : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50 hover:text-primary'
      }`}
    >
      {label}
    </button>
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
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <CellText value={formatDateTime(evento.criado_em)} />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <EventoTourBadge tipo={evento.tipo_evento} />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle max-w-[220px]">
        {evento.passo_ordem != null ? (
          <span className="text-[13px] text-on-surface truncate block" title={evento.passo_titulo ?? undefined}>
            #{evento.passo_ordem + 1} {evento.passo_titulo ?? ''}
          </span>
        ) : (
          <CellText value={NI} />
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <PessoaCell {...resolverPessoa(evento)} />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <PessoaCell {...resolverCliente(evento)} />
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
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
  feedback_tour: { icon: 'sentiment_satisfied', label: 'Feedback', className: 'bg-tertiary/10 text-tertiary' },
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
    <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          <span className={`material-symbols-outlined ${iconColor} text-[19px]`}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-label-md font-medium text-outline">{label}</p>
          <p className="text-headline-lg font-bold text-on-surface leading-none mt-1">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </p>
          {sub && <p className="text-label-md font-medium text-outline mt-1">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

// "Sem eventos suficientes" quando nenhum passo tem visualização registrada
// ainda — nesse caso o funil inteiro seria só zeros, sem nenhuma informação
// útil (diferente de "tour sem passos", que também cai aqui pela mesma razão:
// funil.length === 0 já soma 0).
function funilTemDados(funil: FunilPassoItem[]): boolean {
  return funil.some(p => p.visualizacoes > 0)
}

// Só o passo com a MAIOR taxa_queda entre os que têm taxa calculável
// (visualizacoes > 0 — ver montarFunilPorPasso em tours.ts). Nunca recalcula
// nada, só percorre o funil já pronto pra achar o pior ponto de queda.
function passoComMaiorQueda(funil: FunilPassoItem[]): FunilPassoItem | null {
  let pior: FunilPassoItem | null = null
  for (const item of funil) {
    if (item.taxa_queda == null) continue
    if (!pior || item.taxa_queda > (pior.taxa_queda as number)) pior = item
  }
  return pior
}

// Regra do filtro rápido "Mostrar apenas passos com problema" — mesma
// taxa_queda/elemento_nao_encontrado já exibidos na tabela (moderado/forte em
// nivelQueda, ver abaixo), nenhum cálculo novo nem toque no payload.
function passoTemProblema(item: FunilPassoItem): boolean {
  return (item.taxa_queda != null && item.taxa_queda >= 15) || item.elemento_nao_encontrado > 0
}

function ResumoFunilLinha({ funil }: { funil: FunilPassoItem[] }) {
  const totalPassos = funil.length
  const totalElementoNaoEncontrado = funil.reduce((acc, p) => acc + p.elemento_nao_encontrado, 0)
  const pior = passoComMaiorQueda(funil)

  return (
    <p className="px-5 py-2 text-label-md text-on-surface-variant bg-surface-container-low/50 border-b border-outline-variant/30 flex flex-wrap items-center gap-x-1.5">
      <span>{totalPassos} passo{totalPassos === 1 ? '' : 's'}</span>
      {pior && (
        <>
          <span className="text-outline">•</span>
          <span>
            Maior queda: #{pior.passo_ordem + 1} {pior.passo_titulo} ({(pior.taxa_queda as number).toLocaleString('pt-BR')}%)
          </span>
        </>
      )}
      <span className="text-outline">•</span>
      <span>{totalElementoNaoEncontrado} falha{totalElementoNaoEncontrado === 1 ? '' : 's'} de elemento</span>
    </p>
  )
}

function FunilPorPassoSection({ funil, tourId, onFiltrarPorPasso }: {
  funil: FunilPassoItem[]
  tourId: string
  onFiltrarPorPasso: (ordem: number) => void
}) {
  // Só filtra a EXIBIÇÃO da tabela — ResumoFunilLinha abaixo sempre recebe o
  // `funil` completo (nunca `funilExibido`), pra "Total de passos"/"Maior
  // queda"/"Total de falhas" continuarem refletindo o funil inteiro,
  // independente do filtro estar ligado ou não.
  const [somenteProblemas, setSomenteProblemas] = useState(false)
  const funilExibido = somenteProblemas ? funil.filter(passoTemProblema) : funil

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3 shrink-0">
        <span className="material-symbols-outlined text-on-surface-variant">filter_alt</span>
        <div>
          <h3 className="text-title-lg font-bold text-on-surface">Funil por passo</h3>
          <p className="text-label-md text-outline mt-0.5">
            Acompanhe em quais passos os usuários continuam, abandonam ou encontram falhas no tour. A queda é
            estimada com base em quem viu um passo, mas não chegou ao próximo.
          </p>
        </div>
      </div>

      {!funilTemDados(funil) ? (
        <EmptyState
          icon="query_stats"
          title="Funil ainda sem dados"
          description="Ainda não há eventos suficientes para montar o funil."
        />
      ) : (
        <>
          <ResumoFunilLinha funil={funil} />

          <label className="px-5 py-2 border-b border-outline-variant/30 flex items-center gap-2.5 shrink-0 cursor-pointer select-none">
            <ToggleSwitch checked={somenteProblemas} onChange={setSomenteProblemas} />
            <span className="text-label-md text-on-surface-variant">
              Mostrar apenas passos com problema
            </span>
          </label>

          {funilExibido.length === 0 ? (
            <EmptyState
              icon="check_circle"
              title="Nenhum passo problemático encontrado."
              description="Não há passos com queda estimada acima de 15% ou falhas de elemento."
            />
          ) : (
            // max-h fixo + overflow-y aqui é o que evita a página inteira
            // alongar em Tours com muitos passos — o card continua com altura
            // previsível, só a tabela ganha um scroll próprio. overflow-x
            // continua no mesmo container (não quebra em telas menores).
            <div className="overflow-y-auto overflow-x-auto max-h-[420px]">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low">
                  <tr>
                    {['Passo', 'Visualizações', 'Próximo passo', 'Queda estimada', 'Elemento não encontrado', 'Ações'].map(h => (
                      <th
                        key={h}
                        className={`sticky top-0 z-10 bg-surface-container-low px-4 py-2.5 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap border-b border-outline-variant ${h === 'Ações' ? 'text-right' : ''}`}
                        title={h === 'Queda estimada'
                          ? 'Quantidade estimada de usuários que visualizaram este passo, mas não avançaram para o próximo. No último passo, considera quem não concluiu o tour.'
                          : undefined}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {funilExibido.map(item => (
                    <FunilPassoRow key={item.passo_ordem} item={item} tourId={tourId} onFiltrarPorPasso={onFiltrarPorPasso} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// 'forte'/'moderado' são só destaque visual de leitura — nunca mudam o
// número exibido (abandonos_estimados/taxa_queda seguem vindo direto do
// payload, sem nenhum recálculo aqui).
function nivelQueda(taxaQueda: number | null): 'forte' | 'moderado' | 'normal' {
  if (taxaQueda == null) return 'normal'
  if (taxaQueda >= 30) return 'forte'
  if (taxaQueda >= 15) return 'moderado'
  return 'normal'
}

const QUEDA_CLASSES: Record<'forte' | 'moderado' | 'normal', string> = {
  forte: 'inline-flex items-center px-2 py-0.5 rounded-full bg-error/10 text-error text-[13px] font-bold',
  moderado: 'text-[13px] text-error font-semibold',
  normal: 'text-[13px] text-on-surface',
}

function FunilPassoRow({ item, tourId, onFiltrarPorPasso }: {
  item: FunilPassoItem
  tourId: string
  onFiltrarPorPasso: (ordem: number) => void
}) {
  const navigate = useNavigate()
  const queda = nivelQueda(item.taxa_queda)
  return (
    <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="px-4 py-2.5 whitespace-nowrap align-middle max-w-[220px]">
        <span className="text-[13px] text-on-surface truncate block" title={item.passo_titulo}>
          #{item.passo_ordem + 1} {item.passo_titulo}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <span className="text-[13px] text-on-surface">{item.visualizacoes.toLocaleString('pt-BR')}</span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        {item.ultimo_passo ? (
          <span className="text-[12px] text-tertiary font-semibold">Concluído o tour</span>
        ) : (
          <span className="text-[13px] text-on-surface">
            {(item.proximo_passo_visualizacoes ?? 0).toLocaleString('pt-BR')}
            {item.taxa_continuidade != null && (
              <span className="text-[12px] text-outline ml-1">({item.taxa_continuidade}%)</span>
            )}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <span className={QUEDA_CLASSES[queda]}>
          {item.abandonos_estimados.toLocaleString('pt-BR')}
          {item.taxa_queda != null && (
            <span className={queda === 'forte' ? 'text-[12px] ml-1' : 'text-[12px] ml-1 opacity-80'}>
              ({item.taxa_queda.toLocaleString('pt-BR')}%)
            </span>
          )}
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        {item.elemento_nao_encontrado > 0 ? (
          <span className="text-[13px] text-error font-semibold">{item.elemento_nao_encontrado}</span>
        ) : (
          <span className="text-[13px] text-outline">0</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap align-middle">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => navigate(`/tours/${tourId}/editar?passo=${item.passo_ordem}`)}
            title="Editar passo"
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
            type="button"
            onClick={() => onFiltrarPorPasso(item.passo_ordem)}
            title="Ver eventos deste passo"
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">list_alt</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

const FEEDBACK_CATEGORIA_UI: Record<'positivos' | 'neutros' | 'negativos', { label: string; icon: string; color: string }> = {
  positivos: { label: 'Positivos', icon: 'sentiment_very_satisfied', color: 'text-tertiary' },
  neutros: { label: 'Neutros', icon: 'sentiment_neutral', color: 'text-secondary' },
  negativos: { label: 'Negativos', icon: 'sentiment_dissatisfied', color: 'text-error' },
}

function FeedbackResumoSection({ feedback }: { feedback: ResumoFeedbackTour }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3">
        <span className="material-symbols-outlined text-on-surface-variant">sentiment_satisfied</span>
        <div>
          <h3 className="text-title-lg font-bold text-on-surface">Feedback do tour</h3>
          <p className="text-label-md text-outline mt-0.5">
            {feedback.total} resposta{feedback.total === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {feedback.total === 0 ? (
        <EmptyState
          icon="chat_bubble"
          title="Sem feedback ainda"
          description="Ninguém avaliou a tela final deste tour ainda."
        />
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(['positivos', 'neutros', 'negativos'] as const).map(chave => {
              const cfg = FEEDBACK_CATEGORIA_UI[chave]
              return (
                <div key={chave} className="text-center">
                  <span className={`material-symbols-outlined ${cfg.color} text-[22px]`}>{cfg.icon}</span>
                  <p className="text-headline-lg font-bold text-on-surface leading-none mt-1">{feedback[chave]}</p>
                  <p className="text-label-sm text-outline mt-0.5">{cfg.label}</p>
                </div>
              )
            })}
          </div>
          {feedback.por_valor.length > 0 && (
            <ul className="space-y-1.5 pt-2 border-t border-outline-variant/30">
              {feedback.por_valor.map(item => (
                <li key={item.valor} className="flex items-center justify-between text-[13px] text-on-surface">
                  <span>{item.emoji} {item.label}</span>
                  <span className="font-semibold">{item.total.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
