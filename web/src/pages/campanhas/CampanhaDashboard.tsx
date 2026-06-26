import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { DashboardData, Feedback } from '../../types'
import { formatDate, formatDateTime } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'

// ─── filter types ─────────────────────────────────────────────────────────────

type NpsFiltro = 'Todos' | 'Promotor' | 'Neutro' | 'Detrator'
type TelefoneFiltro = 'Todos' | 'Informado' | 'Não informado'

interface Filtros {
  nps: NpsFiltro
  nota: string
  cliente: string
  unidade: string
  perfil: string
  estado: string
  telefone: TelefoneFiltro
  busca: string
}

const FILTROS_INICIAIS: Filtros = {
  nps: 'Todos', nota: '', cliente: '', unidade: '',
  perfil: '', estado: '', telefone: 'Todos', busca: '',
}

// ─── column definitions ───────────────────────────────────────────────────────

interface ColDef {
  id: string
  label: string
  defaultOn: boolean
  wrap?: boolean
}

// Colunas sempre visíveis — não aparecem no seletor "Colunas"
const COLUNAS_FIXAS = [
  { id: 'data',         label: 'Data/Hora' },
  { id: 'nota',         label: 'Nota'      },
  { id: 'observacao',   label: 'Feedback'  },
  { id: 'usuario_nome', label: 'Usuário'   },
  { id: 'telefone',     label: 'Telefone'  },
  { id: 'unidade_nome', label: 'Unidade'   },
] as const

// Colunas opcionais — controladas pelo seletor "Colunas"
const COLUNAS: ColDef[] = [
  { id: 'usuario_id',       label: 'Usuário ID',       defaultOn: false },
  { id: 'usuario_email',    label: 'Usuário E-mail',   defaultOn: false },
  { id: 'usuario_tipo',     label: 'Usuário Tipo',     defaultOn: false },
  { id: 'cliente_id',       label: 'Cliente ID',       defaultOn: false },
  { id: 'cliente_nome',     label: 'Cliente Nome',     defaultOn: false },
  { id: 'cliente_local_id', label: 'Cliente Local ID', defaultOn: false },
  { id: 'unidade_id',       label: 'Unidade ID',       defaultOn: false },
  { id: 'unidade_local_id', label: 'Unidade Local ID', defaultOn: false },
  { id: 'organizacao_id',   label: 'Organização ID',   defaultOn: false },
  { id: 'organizacao_nome', label: 'Organização Nome', defaultOn: false },
  { id: 'clinica_id',       label: 'Clínica ID',       defaultOn: false },
  { id: 'clinica_nome',     label: 'Clínica Nome',     defaultOn: false },
  { id: 'estado',           label: 'Estado',           defaultOn: false },
  { id: 'perfil',           label: 'Perfil',           defaultOn: false },
  { id: 'perfil_nps',       label: 'Perfil NPS',       defaultOn: false },
]

const DEFAULT_COLS = new Set(COLUNAS.filter(c => c.defaultOn).map(c => c.id))
const NI = 'Não informado'

// ─── period filter ─────────────────────────────────────────────────────────────

type PeriodoOpcao = 'todo' | 'hoje' | '7d' | '30d' | 'mes' | 'custom'

interface Periodo {
  opcao: PeriodoOpcao
  customInicio: string
  customFim: string
}

const PERIODO_INICIAL: Periodo = { opcao: 'todo', customInicio: '', customFim: '' }

const PERIODO_LABELS: Record<PeriodoOpcao, string> = {
  todo: 'Todo período', hoje: 'Hoje', '7d': '7 dias', '30d': '30 dias', mes: 'Este mês', custom: 'Personalizado',
}

function periodoRange(p: Periodo): { inicio: Date | null; fim: Date | null } {
  if (p.opcao === 'todo') return { inicio: null, fim: null }
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  if (p.opcao === 'hoje') {
    return { inicio: hoje, fim: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999) }
  }
  if (p.opcao === '7d') {
    const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 6)
    return { inicio, fim: new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999) }
  }
  if (p.opcao === '30d') {
    const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 29)
    return { inicio, fim: new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999) }
  }
  if (p.opcao === 'mes') {
    return {
      inicio: new Date(agora.getFullYear(), agora.getMonth(), 1),
      fim: new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }
  // custom
  return {
    inicio: p.customInicio ? new Date(p.customInicio + 'T00:00:00') : null,
    fim:    p.customFim    ? new Date(p.customFim    + 'T23:59:59') : null,
  }
}

function inPeriodo(criado_em: string, inicio: Date | null, fim: Date | null): boolean {
  if (!inicio && !fim) return true
  const d = new Date(criado_em)
  if (inicio && d < inicio) return false
  if (fim    && d > fim)    return false
  return true
}

function npsLabel(nota: number): 'Promotor' | 'Neutro' | 'Detrator' {
  if (nota >= 9) return 'Promotor'
  if (nota >= 7) return 'Neutro'
  return 'Detrator'
}

function getCellValue(f: Feedback, colId: string): string {
  const ctx = (f.contexto ?? {}) as Record<string, string>
  switch (colId) {
    case 'data':             return formatDateTime(f.criado_em)
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
    case 'perfil_nps':       return npsLabel(f.nota)
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
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS)
  const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false)
  const [filtroEvento, setFiltroEvento] = useState<'Todos' | 'Visualização' | 'Clique'>('Todos')
  const [buscaEvento, setBuscaEvento] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_INICIAL)
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

  const ctx = (f: { contexto: Record<string, string> | null }) =>
    (f.contexto ?? {}) as Record<string, string>

  const opcoesCliente = useMemo(() =>
    [...new Set((data?.feedbacks_recentes ?? []).map(f => ctx(f).cliente_nome || NI))].filter(v => v !== NI).sort()
  , [data])

  const opcoesUnidade = useMemo(() =>
    [...new Set((data?.feedbacks_recentes ?? []).map(f => {
      const c = ctx(f); return c.unidade_nome || c.clinica_nome || NI
    }))].filter(v => v !== NI).sort()
  , [data])

  const opcoesPerfil = useMemo(() =>
    [...new Set((data?.feedbacks_recentes ?? []).map(f => ctx(f).usuario_tipo || NI))].filter(v => v !== NI).sort()
  , [data])

  const opcoesEstado = useMemo(() =>
    [...new Set((data?.feedbacks_recentes ?? []).map(f => ctx(f).Estado || NI))].filter(v => v !== NI).sort()
  , [data])

  // ── período ───────────────────────────────────────────────────────────────
  const periodoRangeValue = useMemo(() => periodoRange(periodo), [periodo])
  const periodoAtivo = periodoRangeValue.inicio !== null || periodoRangeValue.fim !== null

  const feedbacksPeriodo = useMemo(() => {
    const { inicio, fim } = periodoRangeValue
    if (!inicio && !fim) return data?.feedbacks_recentes ?? []
    return (data?.feedbacks_recentes ?? []).filter(f => inPeriodo(f.criado_em, inicio, fim))
  }, [data, periodoRangeValue])

  const eventosPeriodo = useMemo(() => {
    const { inicio, fim } = periodoRangeValue
    if (!inicio && !fim) return data?.eventos_recentes ?? []
    return (data?.eventos_recentes ?? []).filter(e => inPeriodo(e.criado_em, inicio, fim))
  }, [data, periodoRangeValue])

  const feedbacksFiltrados = useMemo(() => {
    return feedbacksPeriodo.filter(f => {
      const c = ctx(f)
      if (filtros.nps !== 'Todos' && npsLabel(f.nota) !== filtros.nps) return false
      if (filtros.nota !== '' && f.nota !== Number(filtros.nota)) return false
      if (filtros.cliente !== '' && (c.cliente_nome || NI) !== filtros.cliente) return false
      if (filtros.unidade !== '' && (c.unidade_nome || c.clinica_nome || NI) !== filtros.unidade) return false
      if (filtros.perfil !== '' && (c.usuario_tipo || NI) !== filtros.perfil) return false
      if (filtros.estado !== '' && (c.Estado || NI) !== filtros.estado) return false
      if (filtros.telefone === 'Informado' && !f.telefone_contato?.trim()) return false
      if (filtros.telefone === 'Não informado' && !!f.telefone_contato?.trim()) return false
      if (filtros.busca) {
        const q = filtros.busca.toLowerCase()
        const hay = [
          f.usuario_nome, f.usuario_email, c.usuario_nome, c.usuario_email,
          f.observacao, f.telefone_contato,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [feedbacksPeriodo, filtros])

  const totalFiltrado = feedbacksFiltrados.length
  const mediaFiltrada = totalFiltrado > 0
    ? Math.round(feedbacksFiltrados.reduce((s, f) => s + f.nota, 0) / totalFiltrado * 10) / 10
    : null
  const detraComTel = feedbacksFiltrados.filter(f => npsLabel(f.nota) === 'Detrator' && !!f.telefone_contato?.trim()).length
  const detraSemTel = feedbacksFiltrados.filter(f => npsLabel(f.nota) === 'Detrator' && !f.telefone_contato?.trim()).length

  const temFiltrosAvancados = filtros.nps !== 'Todos' || filtros.nota !== '' || filtros.cliente !== '' ||
    filtros.unidade !== '' || filtros.perfil !== '' || filtros.estado !== '' || filtros.telefone !== 'Todos'
  const temFiltros = temFiltrosAvancados || filtros.busca !== ''

  // how many advanced filter dimensions are active
  const qtdFiltrosAvancados = [
    filtros.nps !== 'Todos', filtros.nota !== '', filtros.cliente !== '',
    filtros.unidade !== '', filtros.perfil !== '', filtros.estado !== '', filtros.telefone !== 'Todos',
  ].filter(Boolean).length

  const eventosFiltrados = useMemo(() => {
    let list = eventosPeriodo
    if (filtroEvento !== 'Todos') {
      const tipo = filtroEvento === 'Visualização' ? 'visualizacao' : 'clique_cta'
      list = list.filter(e => e.tipo_evento === tipo)
    }
    if (buscaEvento.trim()) {
      const q = buscaEvento.toLowerCase()
      list = list.filter(e => {
        const c = (e.contexto ?? {}) as Record<string, string>
        return [
          e.usuario_id, c.usuario_nome, c.usuario_email,
          c.usuario_tipo, c.cliente_nome, c.unidade_nome, c.clinica_nome, e.tipo_evento,
        ].filter(Boolean).join(' ').toLowerCase().includes(q)
      })
    }
    return list
  }, [eventosPeriodo, filtroEvento, buscaEvento])

  const temFiltroEvento = filtroEvento !== 'Todos' || buscaEvento !== ''

  // ── KPI metrics — período-aware ──────────────────────────────────────────
  // "Todo período" → usa dados agregados do backend (mais precisos)
  // Qualquer outro período → recomputa dos arrays filtrados
  const kpiVisualizacoes = periodoAtivo
    ? eventosPeriodo.filter(e => e.tipo_evento === 'visualizacao').length
    : (data?.visualizacoes ?? 0)
  const kpiVisualizacoesUnicas = periodoAtivo
    ? new Set(eventosPeriodo.filter(e => e.tipo_evento === 'visualizacao' && e.usuario_id).map(e => e.usuario_id)).size
    : (data?.visualizacoes_unicas ?? 0)
  const kpiCliques = periodoAtivo
    ? eventosPeriodo.filter(e => e.tipo_evento === 'clique_cta').length
    : (data?.cliques_cta ?? 0)
  const kpiCliquesUnicos = periodoAtivo
    ? new Set(eventosPeriodo.filter(e => e.tipo_evento === 'clique_cta' && e.usuario_id).map(e => e.usuario_id)).size
    : (data?.cliques_unicos ?? 0)
  const kpiTotal = periodoAtivo ? feedbacksPeriodo.length : (data?.total ?? 0)
  const kpiMedia: number | null = periodoAtivo
    ? (feedbacksPeriodo.length > 0 ? feedbacksPeriodo.reduce((s, f) => s + f.nota, 0) / feedbacksPeriodo.length : null)
    : (data?.media ?? null)
  const kpiDistribuicao: Record<string, number> = periodoAtivo
    ? feedbacksPeriodo.reduce<Record<string, number>>((acc, f) => {
        const k = String(f.nota); acc[k] = (acc[k] ?? 0) + 1; return acc
      }, {})
    : (data?.distribuicao ?? {})
  const kpiTaxaClique = kpiVisualizacoes > 0 ? Math.round((kpiCliques / kpiVisualizacoes) * 1000) / 10 : 0

  const activeCols = COLUNAS.filter(c => visibleCols.has(c.id))
  const maxDist = Math.max(1, ...Object.values(kpiDistribuicao))

  const promotores = (kpiDistribuicao['9'] ?? 0) + (kpiDistribuicao['10'] ?? 0)
  const neutros    = (kpiDistribuicao['7'] ?? 0) + (kpiDistribuicao['8'] ?? 0)
  const detratores = [0,1,2,3,4,5,6].reduce((s, n) => s + (kpiDistribuicao[String(n)] ?? 0), 0)
  const totalNps   = kpiTotal
  const pctProm    = totalNps > 0 ? Math.round((promotores / totalNps) * 100) : 0
  const pctNeut    = totalNps > 0 ? Math.round((neutros    / totalNps) * 100) : 0
  const pctDetr    = totalNps > 0 ? Math.round((detratores / totalNps) * 100) : 0
  const npsScore   = pctProm - pctDetr

  const taxaResposta = kpiVisualizacoesUnicas > 0
    ? Math.round((kpiTotal / kpiVisualizacoesUnicas) * 1000) / 10
    : 0

  const notaColor = (n: number) => {
    if (n <= 3) return 'bg-error'
    if (n <= 6) return 'bg-yellow-400'
    return 'bg-tertiary'
  }

  // quick-filter chips for respostas
  const atalhos = [
    {
      label: 'Todos',
      active: !temFiltrosAvancados,
      onClick: () => setFiltros(f => ({ ...FILTROS_INICIAIS, busca: f.busca })),
    },
    {
      label: 'Detratores',
      active: filtros.nps === 'Detrator',
      onClick: () => setFiltros(f => ({ ...f, nps: f.nps === 'Detrator' ? 'Todos' : 'Detrator' })),
    },
    {
      label: 'Promotores',
      active: filtros.nps === 'Promotor',
      onClick: () => setFiltros(f => ({ ...f, nps: f.nps === 'Promotor' ? 'Todos' : 'Promotor' })),
    },
    {
      label: 'Com telefone',
      active: filtros.telefone === 'Informado',
      onClick: () => setFiltros(f => ({ ...f, telefone: f.telefone === 'Informado' ? 'Todos' : 'Informado' })),
    },
    {
      label: 'Sem telefone',
      active: filtros.telefone === 'Não informado',
      onClick: () => setFiltros(f => ({ ...f, telefone: f.telefone === 'Não informado' ? 'Todos' : 'Não informado' })),
    },
  ]

  return (
    <section className="px-4 lg:px-margin-desktop py-5">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
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
          {/* ── Meta da campanha ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <TypeBadge tipo={data.campanha.tipo} />
            {data.campanha.ativo
              ? <span className="text-[12px] font-semibold text-tertiary bg-tertiary/10 px-2.5 py-0.5 rounded-full">Ativa</span>
              : <span className="text-[12px] font-semibold text-outline bg-surface-container px-2.5 py-0.5 rounded-full">Inativa</span>
            }
            <span className="text-label-md text-outline">{data.campanha.sistema} · {data.campanha.tela}</span>
            <span className="text-label-md text-outline">Criada em {formatDate(data.campanha.criado_em)}</span>
          </div>

          {/* ── Filtro de período ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-6 p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/50">
            <span className="material-symbols-outlined text-[16px] text-outline">date_range</span>
            <span className="text-label-md text-on-surface-variant font-medium mr-1">Período:</span>
            {(['todo', 'hoje', '7d', '30d', 'mes', 'custom'] as PeriodoOpcao[]).map(op => (
              <button
                key={op}
                onClick={() => setPeriodo(p => ({ ...p, opcao: op }))}
                className={`px-3 py-1.5 rounded-xl text-label-md font-semibold border transition-all ${
                  periodo.opcao === op
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50 hover:text-primary'
                }`}
              >
                {PERIODO_LABELS[op]}
              </button>
            ))}
            {periodo.opcao === 'custom' && (
              <>
                <input
                  type="date"
                  value={periodo.customInicio}
                  onChange={e => setPeriodo(p => ({ ...p, customInicio: e.target.value }))}
                  className="px-3 py-1.5 border border-outline-variant rounded-xl text-label-md bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-label-md text-outline">até</span>
                <input
                  type="date"
                  value={periodo.customFim}
                  onChange={e => setPeriodo(p => ({ ...p, customFim: e.target.value }))}
                  className="px-3 py-1.5 border border-outline-variant rounded-xl text-label-md bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </>
            )}
            {periodoAtivo && (
              <button
                onClick={() => setPeriodo(PERIODO_INICIAL)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-label-md text-on-surface-variant hover:text-error transition-colors ml-auto"
                title="Restaurar todo período"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Restaurar
              </button>
            )}
          </div>

          {/* ── Cards de métricas principais ──────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KpiCard
              icon="visibility" iconColor="text-primary" iconBg="bg-primary/10"
              label="Visualizações" value={kpiVisualizacoes.toLocaleString('pt-BR')}
              sub={`${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} usuários únicos`}
            />
            <KpiCard
              icon="forum" iconColor="text-secondary" iconBg="bg-secondary/10"
              label="Respostas" value={kpiTotal.toLocaleString('pt-BR')}
              sub={`Taxa: ${taxaResposta.toLocaleString('pt-BR')}%`}
            />
            <KpiCard
              icon="ads_click" iconColor="text-tertiary" iconBg="bg-tertiary/10"
              label="Cliques CTA" value={kpiCliques.toLocaleString('pt-BR')}
              sub={`Taxa: ${kpiTaxaClique.toLocaleString('pt-BR')}%`}
            />
            {kpiTotal > 0 ? (
              <KpiCard
                icon="star" iconColor="text-yellow-500" iconBg="bg-yellow-50"
                label="Nota Média" value={kpiMedia !== null ? kpiMedia.toFixed(1) : '—'}
                sub={`NPS: ${npsScore > 0 ? '+' : ''}${npsScore}`}
              />
            ) : (
              <KpiCard
                icon="star" iconColor="text-yellow-500" iconBg="bg-yellow-50"
                label="Nota Média" value="—"
                sub="sem respostas ainda"
              />
            )}
          </div>

          {/* ── Funil de engajamento ──────────────────────────────────────── */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm mb-6 p-5">
            <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider mb-4">
              Funil de engajamento
            </h3>
            <div className="flex items-stretch gap-2 flex-col sm:flex-row">
              <FunnelStep
                icon="visibility" iconColor="text-primary" barColor="bg-primary"
                label="Visualizações" value={kpiVisualizacoes} pct={100}
                sub={`${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} únicos`}
              />
              <FunnelArrow label={`${kpiTaxaClique.toLocaleString('pt-BR')}% clicaram`} />
              <FunnelStep
                icon="ads_click" iconColor="text-secondary" barColor="bg-secondary"
                label="Cliques CTA" value={kpiCliques}
                pct={kpiVisualizacoes > 0 ? (kpiCliques / kpiVisualizacoes) * 100 : 0}
                sub={`${kpiCliquesUnicos.toLocaleString('pt-BR')} únicos`}
              />
              <FunnelArrow label={`${taxaResposta.toLocaleString('pt-BR')}% responderam`} />
              <FunnelStep
                icon="forum" iconColor="text-tertiary" barColor="bg-tertiary"
                label="Respostas" value={kpiTotal}
                pct={kpiVisualizacoes > 0 ? (kpiTotal / kpiVisualizacoes) * 100 : 0}
                sub={kpiMedia !== null ? `Média: ${kpiMedia.toFixed(1)}` : 'sem respostas'}
              />
            </div>
          </div>

          {/* ── Seção: Resumo ─────────────────────────────────────────────── */}
          <SectionTitle icon="summarize">Resumo</SectionTitle>

          {kpiTotal > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KpiCard icon="sentiment_very_satisfied" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Promotores" value={`${promotores}`} sub={`${pctProm}% do total`} />
              <KpiCard icon="sentiment_neutral" iconColor="text-yellow-600" iconBg="bg-yellow-50"
                label="Neutros" value={`${neutros}`} sub={`${pctNeut}% do total`} />
              <KpiCard icon="sentiment_dissatisfied" iconColor="text-error" iconBg="bg-error/10"
                label="Detratores" value={`${detratores}`} sub={`${pctDetr}% do total`} />
              <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm flex flex-col items-center justify-center text-center gap-1">
                <p className="text-label-md text-outline">NPS</p>
                <p className={`text-display-sm font-bold leading-none ${npsScore > 0 ? 'text-tertiary' : npsScore < 0 ? 'text-error' : 'text-on-surface'}`}>
                  {npsScore > 0 ? '+' : ''}{npsScore}
                </p>
                <p className="text-label-md text-outline">%Prom − %Detr</p>
              </div>
            </div>
          )}

          {data.campanha.exige_confirmacao_leitura && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <KpiCard icon="verified" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Confirmações de leitura" value={data.total_confirmacoes.toLocaleString('pt-BR')}
                sub="usuários confirmaram" large />
              <KpiCard icon="percent" iconColor="text-primary" iconBg="bg-primary/10"
                label="Taxa de confirmação" value={`${data.percentual_confirmacao.toLocaleString('pt-BR')}%`}
                sub={data.visualizacoes > 0 ? `${data.total_confirmacoes} de ${data.visualizacoes}` : 'sem visualizações'} large />
            </div>
          )}

          {kpiTotal > 0 && (
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm mb-6">
              <h4 className="text-title-md font-bold text-on-surface mb-5">Distribuição de notas</h4>
              <div className="flex items-end gap-2 h-32">
                {Array.from({ length: 11 }, (_, i) => {
                  const count = kpiDistribuicao[String(i)] ?? 0
                  const height = Math.round((count / maxDist) * 100)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-outline font-bold">{count > 0 ? count : ''}</span>
                      <div className="w-full flex items-end justify-center" style={{ height: '96px' }}>
                        <div className={`w-full rounded-t transition-all ${notaColor(i)}`}
                          style={{ height: `${Math.max(height, count > 0 ? 4 : 0)}%` }} />
                      </div>
                      <span className="text-[11px] text-outline font-bold">{i}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Seção: Respostas ──────────────────────────────────────────── */}
          <SectionTitle icon="forum">Respostas</SectionTitle>

          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden mb-6">

            {/* Header */}
            <div className="px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-title-md font-bold text-on-surface">
                  {temFiltros ? `${totalFiltrado} de ${feedbacksPeriodo.length}` : feedbacksPeriodo.length}
                </span>
                <span className="text-label-md text-outline">
                  {feedbacksPeriodo.length === 1 ? 'resposta' : 'respostas'}
                  {temFiltros && ' filtradas'}
                </span>
                {temFiltros && mediaFiltrada !== null && (
                  <span className="text-label-md text-outline">· Média {mediaFiltrada.toFixed(1)}</span>
                )}
                {detraComTel > 0 && (
                  <span className="text-label-md text-error font-semibold">
                    · {detraComTel} detrator{detraComTel > 1 ? 'es' : ''} c/ tel
                  </span>
                )}
                {detraSemTel > 0 && (
                  <span className="text-label-md text-yellow-700 font-semibold">
                    · {detraSemTel} s/ tel
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {temFiltros && (
                  <button
                    onClick={() => setFiltros(FILTROS_INICIAIS)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-label-md text-on-surface-variant hover:text-error transition-colors"
                    title="Limpar todos os filtros"
                  >
                    <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                    Limpar
                  </button>
                )}
                <div className="relative" ref={colMenuRef}>
                  <button
                    onClick={() => setShowColMenu(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">view_column</span>
                    Colunas ({visibleCols.size})
                  </button>
                  {showColMenu && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-2 w-52 max-h-80 overflow-y-auto">
                      {COLUNAS.map(col => (
                        <label key={col.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-container-low cursor-pointer">
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
            </div>

            {/* Filtros — visíveis quando há feedbacks */}
            {data.feedbacks_recentes.length > 0 && (
              <div className="px-5 py-3 border-b border-outline-variant/30 space-y-2">

                {/* Busca */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-outline pointer-events-none">search</span>
                  <input
                    type="text"
                    value={filtros.busca}
                    onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
                    placeholder="Buscar por nome, e-mail, feedback ou telefone…"
                    className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-xl text-body-sm bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Chips de atalho + botão filtros avançados */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {atalhos.map(a => (
                    <button
                      key={a.label}
                      onClick={a.onClick}
                      className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-all border ${
                        a.active
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50 hover:text-primary'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowFiltrosAvancados(v => !v)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold border transition-all ${
                      temFiltrosAvancados
                        ? 'bg-secondary/10 text-secondary border-secondary/30'
                        : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50 hover:text-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">tune</span>
                    Filtros avançados
                    {qtdFiltrosAvancados > 0 && (
                      <span className="ml-0.5 w-4 h-4 rounded-full bg-secondary text-on-secondary text-[10px] flex items-center justify-center">
                        {qtdFiltrosAvancados}
                      </span>
                    )}
                    <span className="material-symbols-outlined text-[13px]">{showFiltrosAvancados ? 'expand_less' : 'expand_more'}</span>
                  </button>
                </div>

                {/* Filtros avançados — colapsável */}
                {showFiltrosAvancados && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <FiltroSelect label="NPS" value={filtros.nps} onChange={v => setFiltros(f => ({ ...f, nps: v as NpsFiltro }))}>
                      <option value="Todos">Todos</option>
                      <option value="Promotor">Promotor</option>
                      <option value="Neutro">Neutro</option>
                      <option value="Detrator">Detrator</option>
                    </FiltroSelect>
                    <FiltroSelect label="Nota" value={filtros.nota} onChange={v => setFiltros(f => ({ ...f, nota: v }))}>
                      <option value="">Todas</option>
                      {Array.from({ length: 11 }, (_, i) => <option key={i} value={String(i)}>{i}</option>)}
                    </FiltroSelect>
                    {opcoesCliente.length > 0 && (
                      <FiltroSelect label="Cliente" value={filtros.cliente} onChange={v => setFiltros(f => ({ ...f, cliente: v }))}>
                        <option value="">Todos</option>
                        {opcoesCliente.map(v => <option key={v} value={v}>{v}</option>)}
                      </FiltroSelect>
                    )}
                    {opcoesUnidade.length > 0 && (
                      <FiltroSelect label="Unidade" value={filtros.unidade} onChange={v => setFiltros(f => ({ ...f, unidade: v }))}>
                        <option value="">Todas</option>
                        {opcoesUnidade.map(v => <option key={v} value={v}>{v}</option>)}
                      </FiltroSelect>
                    )}
                    {opcoesPerfil.length > 0 && (
                      <FiltroSelect label="Perfil" value={filtros.perfil} onChange={v => setFiltros(f => ({ ...f, perfil: v }))}>
                        <option value="">Todos</option>
                        {opcoesPerfil.map(v => <option key={v} value={v}>{v}</option>)}
                      </FiltroSelect>
                    )}
                    {opcoesEstado.length > 0 && (
                      <FiltroSelect label="Estado" value={filtros.estado} onChange={v => setFiltros(f => ({ ...f, estado: v }))}>
                        <option value="">Todos</option>
                        {opcoesEstado.map(v => <option key={v} value={v}>{v}</option>)}
                      </FiltroSelect>
                    )}
                    <FiltroSelect label="Telefone" value={filtros.telefone} onChange={v => setFiltros(f => ({ ...f, telefone: v as TelefoneFiltro }))}>
                      <option value="Todos">Todos</option>
                      <option value="Informado">Informado</option>
                      <option value="Não informado">Não informado</option>
                    </FiltroSelect>
                  </div>
                )}
              </div>
            )}

            {/* Tabela ou estado vazio */}
            {data.feedbacks_recentes.length === 0 ? (
              <EmptySection
                icon="forum"
                title="Nenhuma resposta ainda"
                message="As respostas aparecerão aqui assim que os usuários interagirem com a campanha."
              />
            ) : feedbacksPeriodo.length === 0 ? (
              <EmptySection
                icon="event_busy"
                title="Nenhuma resposta neste período"
                message="Não há respostas no intervalo selecionado. Tente ampliar o período ou escolher 'Todo período'."
              />
            ) : feedbacksFiltrados.length === 0 ? (
              <EmptySection
                icon="search_off"
                title="Nenhuma resposta encontrada"
                message="Nenhuma resposta corresponde aos filtros selecionados. Tente ajustar ou limpar os filtros."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      {COLUNAS_FIXAS.map(col => (
                        <th key={col.id} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      {activeCols.map(col => (
                        <th key={col.id} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {feedbacksFiltrados.map(f => (
                      <tr key={f.id} className="hover:bg-surface-container-low/50 transition-colors">
                        {/* Colunas fixas — sempre visíveis */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <CellText value={getCellValue(f, 'data')} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-label-md font-bold text-white shrink-0 ${notaColor(f.nota)}`}>
                              {f.nota}
                            </span>
                            <NpsBadge nota={f.nota} />
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <ObservacaoCell value={getCellValue(f, 'observacao')} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <UsuarioCellFeedback f={f} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <CellText value={getCellValue(f, 'telefone')} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <UnidadeCell f={f} />
                        </td>
                        {/* Colunas opcionais — controladas pelo seletor */}
                        {activeCols.map(col => (
                          <td key={col.id} className="px-4 py-3 whitespace-nowrap">
                            {col.id === 'perfil_nps'
                              ? <NpsBadge nota={f.nota} />
                              : <CellText value={getCellValue(f, col.id)} />
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Seção: Interações ─────────────────────────────────────────── */}
          <SectionTitle icon="touch_app">Interações</SectionTitle>

          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-2">
                <span className="text-title-md font-bold text-on-surface">
                  {temFiltroEvento ? `${eventosFiltrados.length} de ${eventosPeriodo.length}` : eventosPeriodo.length}
                </span>
                <span className="text-label-md text-outline">
                  {eventosPeriodo.length === 1 ? 'interação' : 'interações'}
                  {temFiltroEvento && ' filtradas'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {temFiltroEvento && (
                  <button
                    onClick={() => { setFiltroEvento('Todos'); setBuscaEvento('') }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-label-md text-on-surface-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                    Limpar
                  </button>
                )}
                <FiltroSelect label="Tipo" value={filtroEvento} onChange={v => setFiltroEvento(v as typeof filtroEvento)}>
                  <option value="Todos">Todos</option>
                  <option value="Visualização">Visualização</option>
                  <option value="Clique">Clique CTA</option>
                </FiltroSelect>
              </div>
            </div>

            {/* Busca e indicadores */}
            <div className="px-5 py-3 border-b border-outline-variant/30 space-y-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-outline pointer-events-none">search</span>
                <input
                  type="text"
                  value={buscaEvento}
                  onChange={e => setBuscaEvento(e.target.value)}
                  placeholder="Buscar por usuário, e-mail, perfil, cliente ou tipo…"
                  className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-xl text-body-sm bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <IndicadorFiltro label="Visualizações" value={kpiVisualizacoes.toLocaleString('pt-BR')} />
                <IndicadorFiltro label="Únicos" value={kpiVisualizacoesUnicas.toLocaleString('pt-BR')} />
                <IndicadorFiltro label="Cliques CTA" value={kpiCliques.toLocaleString('pt-BR')} />
                <IndicadorFiltro label="Clicadores únicos" value={kpiCliquesUnicos.toLocaleString('pt-BR')} />
                <IndicadorFiltro label="Taxa de clique" value={`${kpiTaxaClique.toLocaleString('pt-BR')}%`} />
              </div>
            </div>

            {/* Tabela ou estado vazio */}
            {data.eventos_recentes.length === 0 ? (
              <EmptySection
                icon="touch_app"
                title="Nenhuma interação ainda"
                message="As visualizações e cliques aparecerão aqui assim que a campanha for exibida para os usuários."
              />
            ) : eventosPeriodo.length === 0 ? (
              <EmptySection
                icon="event_busy"
                title="Nenhuma interação neste período"
                message="Não há interações no intervalo selecionado. Tente ampliar o período ou escolher 'Todo período'."
              />
            ) : eventosFiltrados.length === 0 ? (
              <EmptySection
                icon="search_off"
                title="Nenhuma interação encontrada"
                message="Nenhuma interação corresponde aos filtros selecionados. Tente ajustar o tipo ou a busca."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      {['Tipo', 'Data/Hora', 'Usuário', 'Perfil', 'Cliente', 'Unidade', 'Estado'].map(h => (
                        <th key={h} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {eventosFiltrados.map(e => {
                      const c = (e.contexto ?? {}) as Record<string, string>
                      const nome = c.usuario_nome || e.usuario_id
                      const email = c.usuario_email
                      const unidade = c.unidade_nome || c.clinica_nome
                      return (
                        <tr key={e.id} className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <EventoBadge tipo={e.tipo_evento} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <CellText value={formatDateTime(e.criado_em)} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap max-w-[180px]">
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[13px] truncate ${nome ? 'text-on-surface' : 'text-outline italic'}`} title={nome ?? undefined}>
                                {nome ?? NI}
                              </span>
                              {email && (
                                <span className="text-[11px] text-outline truncate" title={email}>{email}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <CellText value={c.usuario_tipo || NI} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap max-w-[160px]">
                            <span className={`text-[13px] truncate block ${c.cliente_nome ? 'text-on-surface' : 'text-outline italic'}`} title={c.cliente_nome ?? undefined}>
                              {c.cliente_nome ?? NI}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap max-w-[160px]">
                            <span className={`text-[13px] truncate block ${unidade ? 'text-on-surface' : 'text-outline italic'}`} title={unidade ?? undefined}>
                              {unidade ?? NI}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <CellText value={c.Estado || NI} />
                          </td>
                        </tr>
                      )
                    })}
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

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-2">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{icon}</span>
      <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider">{children}</h3>
    </div>
  )
}

function EmptySection({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 px-5 text-center">
      <span className="material-symbols-outlined text-[36px] text-outline/50">{icon}</span>
      <p className="text-body-md font-semibold text-on-surface-variant">{title}</p>
      <p className="text-body-sm text-outline max-w-sm">{message}</p>
    </div>
  )
}

function FunnelStep({ icon, iconColor, barColor, label, value, pct, sub }: {
  icon: string; iconColor: string; barColor: string
  label: string; value: number; pct: number; sub: string
}) {
  const barWidth = Math.min(Math.max(pct, value > 0 ? 4 : 0), 100)
  return (
    <div className="flex-1 min-w-0 bg-surface-container-low rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-[16px] ${iconColor}`}>{icon}</span>
        <span className="text-label-md text-on-surface-variant font-semibold">{label}</span>
      </div>
      <p className="text-headline-lg font-bold text-on-surface leading-none">{value.toLocaleString('pt-BR')}</p>
      <div className="w-full h-1.5 bg-outline-variant/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
      </div>
      <p className="text-label-md text-outline">{sub}</p>
    </div>
  )
}

function FunnelArrow({ label }: { label: string }) {
  return (
    <div className="flex sm:flex-col items-center justify-center gap-1 px-1 py-2 sm:py-0 shrink-0">
      <span className="text-[10px] text-outline font-semibold text-center leading-tight max-w-[64px] hidden sm:block">{label}</span>
      <span className="material-symbols-outlined text-outline text-[18px] rotate-90 sm:rotate-0">arrow_forward</span>
      <span className="text-[10px] text-outline font-semibold text-center leading-tight sm:hidden">{label}</span>
    </div>
  )
}

function FiltroSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <label className="flex items-center gap-1.5 shrink-0">
      <span className="text-label-md text-outline whitespace-nowrap">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-outline-variant rounded-xl px-2.5 py-1.5 text-body-sm bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
      >
        {children}
      </select>
    </label>
  )
}

function IndicadorFiltro({ label, value, color = 'text-on-surface' }: {
  label: string; value: string; color?: string
}) {
  return (
    <div className="flex items-baseline gap-1.5 bg-surface-container-low rounded-xl px-3 py-1.5">
      <span className={`text-[15px] font-bold leading-none ${color}`}>{value}</span>
      <span className="text-label-md text-outline">{label}</span>
    </div>
  )
}

function UsuarioCellFeedback({ f }: { f: Feedback }) {
  const c = (f.contexto ?? {}) as Record<string, string>
  const nome = f.usuario_nome || c.usuario_nome
  const email = f.usuario_email || c.usuario_email
  const tipo = c.usuario_tipo
  if (!nome) return <CellText value={NI} />
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-on-surface leading-snug font-medium">{nome}</span>
      {email
        ? <span className="text-[11px] text-outline leading-tight">{email}</span>
        : tipo
        ? <span className="text-[11px] text-outline leading-tight">{tipo}</span>
        : null
      }
    </div>
  )
}

function UnidadeCell({ f }: { f: Feedback }) {
  const c = (f.contexto ?? {}) as Record<string, string>
  const unidade = c.unidade_nome || c.clinica_nome
  return (
    <span
      className={`text-[13px] truncate block max-w-[160px] ${unidade ? 'text-on-surface' : 'text-outline italic'}`}
      title={unidade ?? undefined}
    >
      {unidade ?? NI}
    </span>
  )
}

function ObservacaoCell({ value }: { value: string }) {
  const empty = value === NI
  return (
    <span
      className={`text-[13px] leading-snug ${empty ? 'text-outline italic' : 'text-on-surface'}`}
      style={!empty ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties : undefined}
      title={!empty ? value : undefined}
    >
      {value}
    </span>
  )
}

function NpsBadge({ nota }: { nota: number }) {
  const label = npsLabel(nota)
  const cls = label === 'Promotor'
    ? 'bg-tertiary/10 text-tertiary'
    : label === 'Neutro'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-error/10 text-error'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function EventoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'visualizacao') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-[12px]">visibility</span>
        Visualização
      </span>
    )
  }
  if (tipo === 'clique_cta') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-secondary/10 text-secondary">
        <span className="material-symbols-outlined text-[12px]">ads_click</span>
        Clique CTA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-surface-container text-on-surface-variant">
      <span className="material-symbols-outlined text-[12px]">radio_button_checked</span>
      {tipo}
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

interface KpiCardProps {
  icon: string; iconColor: string; iconBg: string
  label: string; value: string; sub: string; large?: boolean
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
