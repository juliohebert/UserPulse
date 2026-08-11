import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get, getBlob } from '../../services/api'
import type { DashboardData, EventoCampanha, Feedback } from '../../types'
import { formatDateTime, getStatus } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
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
}

const COLUNAS_FIXAS = [
  { id: 'data',         label: 'Data/Hora' },
  { id: 'nota',         label: 'Nota'      },
  { id: 'observacao',   label: 'Feedback'  },
  { id: 'usuario_nome', label: 'Usuário'   },
  { id: 'telefone',     label: 'Telefone'  },
  { id: 'unidade_nome', label: 'Unidade'   },
] as const

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

const LONG_TEXT_COLS = new Set([
  'cliente_id', 'cliente_nome', 'cliente_local_id',
  'unidade_id', 'unidade_nome', 'unidade_local_id',
  'organizacao_id', 'organizacao_nome', 'clinica_id', 'clinica_nome', 'usuario_email',
])

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
  return {
    inicio: p.customInicio ? new Date(p.customInicio + 'T00:00:00') : null,
    fim:    p.customFim    ? new Date(p.customFim    + 'T23:59:59') : null,
  }
}

function npsZona(score: number): { nome: string; bg: string; text: string; border: string } {
  if (score >= 91) return { nome: 'Zona de Encantamento',      bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    }
  if (score >= 76) return { nome: 'Zona de Excelência',        bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200'   }
  if (score >= 51) return { nome: 'Zona de Qualidade',         bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
  if (score >= 1)  return { nome: 'Zona de Aperfeiçoamento',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   }
  return                   { nome: 'Zona Crítica',              bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     }
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

function notaColor(n: number): string {
  if (n <= 3) return 'bg-error'
  if (n <= 6) return 'bg-yellow-400'
  return 'bg-tertiary'
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
    case 'cliente_id': {
      const nome = ctx.cliente_nome
      const cid = ctx.cliente_id
      if (!cid) return NI
      return nome ? `${nome} (${cid})` : cid
    }
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
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  // paginação respostas
  const [pagResp, setPagResp] = useState(1)
  const [tamPagResp, setTamPagResp] = useState(10)
  // paginação interações
  const [pagInter, setPagInter] = useState(1)
  const [tamPagInter, setTamPagInter] = useState(10)
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

  // reset respostas page when filters or period change
  useEffect(() => { setPagResp(1) }, [filtros, periodo])

  // reset interações page when filters change
  useEffect(() => { setPagInter(1) }, [filtroEvento, buscaEvento, periodo])

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

  // paginação respostas
  const feedbacksPaginados = useMemo(() => {
    const start = (pagResp - 1) * tamPagResp
    return feedbacksFiltrados.slice(start, start + tamPagResp)
  }, [feedbacksFiltrados, pagResp, tamPagResp])
  const totalPagResp = Math.ceil(feedbacksFiltrados.length / tamPagResp)

  const totalFiltrado = feedbacksFiltrados.length
  const mediaFiltrada = totalFiltrado > 0
    ? Math.round(feedbacksFiltrados.reduce((s, f) => s + f.nota, 0) / totalFiltrado * 10) / 10
    : null
  const detraComTel = feedbacksFiltrados.filter(f => npsLabel(f.nota) === 'Detrator' && !!f.telefone_contato?.trim()).length
  const detraSemTel = feedbacksFiltrados.filter(f => npsLabel(f.nota) === 'Detrator' && !f.telefone_contato?.trim()).length

  const temFiltrosAvancados = filtros.nps !== 'Todos' || filtros.nota !== '' || filtros.cliente !== '' ||
    filtros.unidade !== '' || filtros.perfil !== '' || filtros.estado !== '' || filtros.telefone !== 'Todos'
  const temFiltros = temFiltrosAvancados || filtros.busca !== ''

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

  // paginação interações
  const eventosPaginados = useMemo(() => {
    const start = (pagInter - 1) * tamPagInter
    return eventosFiltrados.slice(start, start + tamPagInter)
  }, [eventosFiltrados, pagInter, tamPagInter])
  const totalPagInter = Math.ceil(eventosFiltrados.length / tamPagInter)

  const temFiltroEvento = filtroEvento !== 'Todos' || buscaEvento !== ''

  // ── KPI metrics — período-aware ──────────────────────────────────────────
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
  const kpiRespondentesUnicos = periodoAtivo
    ? new Set(feedbacksPeriodo.filter(f => f.usuario_id).map(f => f.usuario_id)).size
    : (data?.respondentes_unicos ?? 0)
  // total real de interações no período (visualizações + cliques, contagens completas do backend)
  const totalEventosPeriodo = kpiVisualizacoes + kpiCliques

  const activeCols = COLUNAS.filter(c => visibleCols.has(c.id))
  const maxDist = Math.max(1, ...Object.values(kpiDistribuicao))

  const exportarCSV = async () => {
    if (!id) return
    setCsvLoading(true)
    setCsvError(null)
    try {
      const { inicio, fim } = periodoRange(periodo)
      const params = new URLSearchParams()
      if (inicio) params.set('data_inicio', inicio.toISOString().slice(0, 10))
      if (fim) params.set('data_fim', fim.toISOString().slice(0, 10))
      if (filtros.nota) params.set('nota', filtros.nota)
      if (filtros.estado) params.set('estado', filtros.estado)
      if (filtros.perfil) params.set('usuario_tipo', filtros.perfil)
      if (filtros.nps !== 'Todos') params.set('nps', filtros.nps)
      if (filtros.telefone !== 'Todos') params.set('tem_telefone', filtros.telefone === 'Informado' ? 'sim' : 'nao')
      if (filtros.cliente) params.set('cliente_nome', filtros.cliente)
      if (filtros.unidade) params.set('unidade_nome', filtros.unidade)
      if (filtros.busca.trim()) params.set('busca', filtros.busca.trim())
      const blob = await getBlob(`/campanhas/${id}/respostas.csv?${params}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `respostas-${id}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setCsvError('Não foi possível exportar. Tente novamente.')
    } finally {
      setCsvLoading(false)
    }
  }

  const promotores = (kpiDistribuicao['9'] ?? 0) + (kpiDistribuicao['10'] ?? 0)
  const neutros    = (kpiDistribuicao['7'] ?? 0) + (kpiDistribuicao['8'] ?? 0)
  const detratores = [0,1,2,3,4,5,6].reduce((s, n) => s + (kpiDistribuicao[String(n)] ?? 0), 0)
  const totalNps   = kpiTotal
  const pctProm    = totalNps > 0 ? Math.round((promotores / totalNps) * 100) : 0
  const pctNeut    = totalNps > 0 ? Math.round((neutros    / totalNps) * 100) : 0
  const pctDetr    = totalNps > 0 ? Math.round((detratores / totalNps) * 100) : 0
  const npsScore   = pctProm - pctDetr

  // % de visualizações que resultaram em resposta — usado no funil (Visualizações → Respostas)
  const taxaRespostaPorVisualizacao = kpiVisualizacoes > 0
    ? Math.round((kpiTotal / kpiVisualizacoes) * 1000) / 10
    : 0
  // baseado em usuários (card Respostas) — só faz sentido quando há usuários respondentes identificados
  const temRespondentes = kpiRespondentesUnicos > 0
  const mediaRespostasPorUsuario = kpiVisualizacoesUnicas > 0
    ? Math.round((kpiTotal / kpiVisualizacoesUnicas) * 10) / 10
    : null

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
    <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <nav className="flex gap-2 text-label-md text-outline mb-1">
            <button onClick={() => navigate('/campanhas')} className="hover:text-primary transition-colors">Campanhas</button>
            <span>/</span>
            <span className="text-on-surface">Dashboard</span>
          </nav>
          <h2 className="text-headline-lg font-bold text-on-surface leading-tight break-words">
            {data?.campanha.titulo ?? 'Dashboard da Campanha'}
          </h2>
          {data && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <TypeBadge tipo={data.campanha.tipo} />
              <StatusBadge status={getStatus(data.campanha)} />
              <span className="text-label-md text-outline">{data.campanha.sistema} · {data.campanha.tela}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
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
          {/* ── Filtro de período ──────────────────────────────────────────── */}
          <div className="w-full max-w-full flex flex-wrap items-center gap-1.5 sm:gap-2 mb-6 p-3.5 sm:p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm">
            <span className="material-symbols-outlined text-[16px] text-outline shrink-0">date_range</span>
            <span className="text-label-md text-on-surface-variant font-medium mr-1 shrink-0">Período:</span>
            {(['todo', 'hoje', '7d', '30d', 'mes', 'custom'] as PeriodoOpcao[]).map(op => (
              <button
                key={op}
                onClick={() => setPeriodo(p => ({ ...p, opcao: op }))}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-label-md font-semibold border whitespace-nowrap transition-all ${
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
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            <KpiCard
              icon="visibility" iconColor="text-primary" iconBg="bg-primary/10"
              label="Visualizações" value={kpiVisualizacoes.toLocaleString('pt-BR')}
              sub={`${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} usuários únicos`}
              subTooltip="Visualizações únicas representam a quantidade de usuários distintos que visualizaram a campanha no período selecionado."
            />
            <KpiCard
              icon="forum" iconColor="text-secondary" iconBg="bg-secondary/10"
              label="Respostas" value={kpiTotal.toLocaleString('pt-BR')}
              sub={
                temRespondentes && kpiVisualizacoesUnicas > 0
                  ? `${kpiRespondentesUnicos.toLocaleString('pt-BR')} de ${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} usuários responderam`
                  : mediaRespostasPorUsuario !== null
                  ? `Média: ${mediaRespostasPorUsuario.toLocaleString('pt-BR')} respostas/usuário`
                  : 'sem dados de usuário'
              }
              subTooltip={
                temRespondentes
                  ? "Taxa de resposta = usuários que responderam ÷ usuários únicos que visualizaram a campanha. O cálculo respeita o período selecionado."
                  : "Média de respostas por usuário único que visualizou a campanha (sem usuários respondentes identificados para calcular uma taxa). O cálculo respeita o período selecionado."
              }
            />
            <KpiCard
              icon="ads_click" iconColor="text-tertiary" iconBg="bg-tertiary/10"
              label="Cliques CTA" value={kpiCliques.toLocaleString('pt-BR')}
              sub={`${kpiCliquesUnicos.toLocaleString('pt-BR')} usuários únicos · ${kpiTaxaClique.toLocaleString('pt-BR')}% das visualizações`}
              subTooltip="Taxa de clique = cliques no CTA ÷ visualizações totais da campanha (não por usuários únicos). O cálculo respeita o período selecionado."
            />
            {kpiTotal > 0 ? (() => {
              const zona = npsZona(npsScore)
              return (
                <KpiCard
                  icon="star" iconColor="text-yellow-500" iconBg="bg-yellow-50"
                  label="Nota Média" value={kpiMedia !== null ? kpiMedia.toFixed(1) : '—'}
                  sub={`NPS: ${npsScore > 0 ? '+' : ''}${npsScore}`}
                  tooltip="Nota Média = soma das notas recebidas ÷ quantidade de respostas com nota. O cálculo respeita o período selecionado no dashboard."
                  subTooltip="NPS = % de promotores − % de detratores. Promotores: notas 9 e 10. Neutros: notas 7 e 8. Detratores: notas de 0 a 6. O resultado varia de -100 a 100."
                  subExtra={
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex w-fit text-[11px] font-semibold px-2 py-0.5 rounded-full border ${zona.bg} ${zona.text} ${zona.border}`}>
                        {zona.nome}
                      </span>
                      <span className="text-[11px] text-outline">
                        {pctProm}% promotores − {pctDetr}% detratores
                      </span>
                    </div>
                  }
                />
              )
            })() : (
              <KpiCard
                icon="star" iconColor="text-yellow-500" iconBg="bg-yellow-50"
                label="Nota Média" value="—"
                sub="sem respostas ainda"
                tooltip="Nota Média = soma das notas recebidas ÷ quantidade de respostas com nota. O cálculo respeita o período selecionado no dashboard."
              />
            )}
          </div>

          {/* ── Funil de engajamento ──────────────────────────────────────── */}
          <div className="w-full max-w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm mb-6 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[16px]">filter_alt</span>
              </span>
              <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider">
                Funil de engajamento
              </h3>
            </div>
            <div className="flex items-stretch gap-2 flex-col sm:flex-row">
              <FunnelStep
                icon="visibility" iconColor="text-primary" barColor="bg-primary"
                label="Visualizações" value={kpiVisualizacoes} pct={100}
                sub={`${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} únicos`}
              />
              <FunnelArrow label={`${taxaRespostaPorVisualizacao.toLocaleString('pt-BR')}% das visualizações geraram resposta`} />
              <FunnelStep
                icon="forum" iconColor="text-tertiary" barColor="bg-tertiary"
                label="Respostas" value={kpiTotal}
                pct={kpiVisualizacoes > 0 ? (kpiTotal / kpiVisualizacoes) * 100 : 0}
                sub={kpiMedia !== null ? `Média: ${kpiMedia.toFixed(1)}` : 'sem respostas'}
              />
            </div>
            <div className="mt-4 pt-4 border-t border-outline-variant/30">
              <p className="text-label-md text-outline mb-2">
                Cliques CTA — métrica paralela (resposta não depende de clicar no CTA)
              </p>
              <FunnelStep
                icon="ads_click" iconColor="text-secondary" barColor="bg-secondary"
                label="Cliques CTA" value={kpiCliques}
                pct={kpiVisualizacoes > 0 ? (kpiCliques / kpiVisualizacoes) * 100 : 0}
                sub={`${kpiCliquesUnicos.toLocaleString('pt-BR')} usuários únicos · ${kpiTaxaClique.toLocaleString('pt-BR')}% das visualizações`}
              />
            </div>
          </div>

          {/* ── Seção: Resumo ─────────────────────────────────────────────── */}
          <SectionTitle icon="summarize">Resumo</SectionTitle>

          {kpiTotal > 0 && (
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
              <KpiCard icon="sentiment_very_satisfied" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Promotores" value={`${promotores}`} sub={`${pctProm}% do total`} />
              <KpiCard icon="sentiment_neutral" iconColor="text-yellow-600" iconBg="bg-yellow-50"
                label="Neutros" value={`${neutros}`} sub={`${pctNeut}% do total`} />
              <KpiCard icon="sentiment_dissatisfied" iconColor="text-error" iconBg="bg-error/10"
                label="Detratores" value={`${detratores}`} sub={`${pctDetr}% do total`} />
              <div className="min-w-0 bg-surface-container-lowest p-3.5 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col items-center justify-center text-center gap-1">
                <p className="text-label-md text-outline flex items-center gap-1">
                  NPS
                  <span
                    className="material-symbols-outlined text-[13px] text-outline/50 cursor-help shrink-0"
                    title="NPS = % de promotores − % de detratores. Promotores: notas 9 e 10. Neutros: notas 7 e 8. Detratores: notas de 0 a 6. O resultado varia de -100 a 100."
                  >
                    info
                  </span>
                </p>
                <p className={`text-title-lg sm:text-display-sm font-bold leading-none ${npsScore > 0 ? 'text-tertiary' : npsScore < 0 ? 'text-error' : 'text-on-surface'}`}>
                  {npsScore > 0 ? '+' : ''}{npsScore}
                </p>
                <p className="text-label-md text-outline">%Prom − %Detr</p>
              </div>
            </div>
          )}

          {data.campanha.exige_confirmacao_leitura && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <KpiCard icon="verified" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Confirmações de leitura" value={data.total_confirmacoes.toLocaleString('pt-BR')}
                sub="usuários confirmaram" large />
              <KpiCard icon="percent" iconColor="text-primary" iconBg="bg-primary/10"
                label="Taxa de confirmação" value={`${data.percentual_confirmacao.toLocaleString('pt-BR')}%`}
                sub={data.visualizacoes > 0 ? `${data.total_confirmacoes} de ${data.visualizacoes}` : 'sem visualizações'} large />
            </div>
          )}

          {kpiTotal > 0 && (
            <div className="w-full max-w-full min-w-0 bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-sm mb-6">
              <h4 className="text-title-md font-bold text-on-surface mb-4 sm:mb-5">Distribuição de notas</h4>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1.5 sm:gap-2 h-28 sm:h-32 min-w-[380px] sm:min-w-0">
                  {Array.from({ length: 11 }, (_, i) => {
                    const count = kpiDistribuicao[String(i)] ?? 0
                    const height = Math.round((count / maxDist) * 100)
                    return (
                      <div key={i} className="flex-1 min-w-[28px] flex flex-col items-center gap-1">
                        <span className="text-[10px] text-outline font-bold">{count > 0 ? count : ''}</span>
                        <div className="w-full flex items-end justify-center bg-surface-container-low/70 rounded-t" style={{ height: '96px' }}>
                          <div className={`w-full rounded-t transition-all ${notaColor(i)}`}
                            style={{ height: `${Math.max(height, count > 0 ? 4 : 0)}%` }} />
                        </div>
                        <span className="text-[11px] text-outline font-bold">{i}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Seção: Respostas ──────────────────────────────────────────── */}
          <SectionTitle icon="forum">Respostas</SectionTitle>

          <div className="w-full max-w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden mb-6">

            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-title-md font-bold text-on-surface">
                  {kpiTotal.toLocaleString('pt-BR')}
                </span>
                <span className="text-label-md text-outline flex items-center gap-1">
                  {kpiTotal === 1 ? 'resposta no período' : 'respostas no período'}
                  {feedbacksPeriodo.length < kpiTotal && (
                    <span
                      className="material-symbols-outlined text-[13px] text-outline/50 cursor-help"
                      title={`A tabela e os filtros abaixo trabalham sobre as ${feedbacksPeriodo.length.toLocaleString('pt-BR')} respostas mais recentes carregadas.`}
                    >
                      info
                    </span>
                  )}
                </span>
                {temFiltros && (
                  <span className="text-label-md text-outline">
                    · {totalFiltrado.toLocaleString('pt-BR')} {totalFiltrado === 1 ? 'filtrada' : 'filtradas'} de {feedbacksPeriodo.length.toLocaleString('pt-BR')} carregadas
                  </span>
                )}
                {temFiltros && mediaFiltrada !== null && (
                  <span className="text-label-md text-outline">· Média {mediaFiltrada.toFixed(1)}</span>
                )}
                {detraComTel > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-error/10 text-error border border-error/20">
                    <span className="material-symbols-outlined text-[12px]">phone</span>
                    {detraComTel} detrator{detraComTel > 1 ? 'es' : ''} com telefone
                  </span>
                )}
                {detraSemTel > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    <span className="material-symbols-outlined text-[12px]">phone_disabled</span>
                    {detraSemTel} detrator{detraSemTel > 1 ? 'es' : ''} sem telefone
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {csvError && (
                  <span className="text-[12px] text-error flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">error</span>
                    {csvError}
                  </span>
                )}
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
                <button
                  onClick={exportarCSV}
                  disabled={csvLoading || data.feedbacks_recentes.length === 0}
                  title={temFiltros ? 'Exportar CSV com os filtros ativos' : 'Exportar respostas do período em CSV (abre no Excel)'}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  {csvLoading ? 'Exportando…' : 'CSV'}
                </button>
                <div className="relative" ref={colMenuRef}>
                  <button
                    onClick={() => setShowColMenu(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">view_column</span>
                    {visibleCols.size > 0 ? `Colunas extras (${visibleCols.size})` : 'Colunas extras'}
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
              <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/30 space-y-2">

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
                    <FiltroSelect
                      label="NPS"
                      value={filtros.nps}
                      options={[
                        { value: 'Todos', label: 'Todos' },
                        { value: 'Promotor', label: 'Promotor' },
                        { value: 'Neutro', label: 'Neutro' },
                        { value: 'Detrator', label: 'Detrator' },
                      ]}
                      onChange={v => setFiltros(f => ({ ...f, nps: v as NpsFiltro }))}
                    />
                    <FiltroSelect
                      label="Nota"
                      value={filtros.nota}
                      options={[
                        { value: '', label: 'Todas' },
                        ...Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) })),
                      ]}
                      onChange={v => setFiltros(f => ({ ...f, nota: v }))}
                    />
                    {opcoesCliente.length > 0 && (
                      <FiltroSelect
                        label="Cliente"
                        value={filtros.cliente}
                        options={[{ value: '', label: 'Todos' }, ...opcoesCliente.map(v => ({ value: v, label: v }))]}
                        onChange={v => setFiltros(f => ({ ...f, cliente: v }))}
                      />
                    )}
                    {opcoesUnidade.length > 0 && (
                      <FiltroSelect
                        label="Unidade"
                        value={filtros.unidade}
                        options={[{ value: '', label: 'Todas' }, ...opcoesUnidade.map(v => ({ value: v, label: v }))]}
                        onChange={v => setFiltros(f => ({ ...f, unidade: v }))}
                      />
                    )}
                    {opcoesPerfil.length > 0 && (
                      <FiltroSelect
                        label="Perfil"
                        value={filtros.perfil}
                        options={[{ value: '', label: 'Todos' }, ...opcoesPerfil.map(v => ({ value: v, label: v }))]}
                        onChange={v => setFiltros(f => ({ ...f, perfil: v }))}
                      />
                    )}
                    {opcoesEstado.length > 0 && (
                      <FiltroSelect
                        label="Estado"
                        value={filtros.estado}
                        options={[{ value: '', label: 'Todos' }, ...opcoesEstado.map(v => ({ value: v, label: v }))]}
                        onChange={v => setFiltros(f => ({ ...f, estado: v }))}
                      />
                    )}
                    <FiltroSelect
                      label="Telefone"
                      value={filtros.telefone}
                      options={[
                        { value: 'Todos', label: 'Todos' },
                        { value: 'Informado', label: 'Informado' },
                        { value: 'Não informado', label: 'Não informado' },
                      ]}
                      onChange={v => setFiltros(f => ({ ...f, telefone: v as TelefoneFiltro }))}
                    />
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
              <>
                {/* Desktop/tablet largo (>= md): tabela */}
                <div className="hidden md:block overflow-x-auto">
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
                      {feedbacksPaginados.map(f => (
                        <tr key={f.id} className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap align-middle">
                            <CellText value={getCellValue(f, 'data')} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle">
                            <div className="flex items-center gap-2">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-label-md font-bold text-white shrink-0 ${notaColor(f.nota)}`}>
                                {f.nota}
                              </span>
                              <NpsBadge nota={f.nota} />
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[220px] align-middle">
                            <ObservacaoCell value={getCellValue(f, 'observacao')} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle">
                            <UsuarioCellFeedback f={f} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle">
                            <CellText value={getCellValue(f, 'telefone')} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle">
                            <UnidadeCell f={f} />
                          </td>
                          {activeCols.map(col => {
                            const isLong = LONG_TEXT_COLS.has(col.id)
                            return (
                              <td key={col.id} className={`px-4 py-3 whitespace-nowrap align-middle ${isLong ? 'max-w-[180px]' : ''}`}>
                                {col.id === 'perfil_nps'
                                  ? <NpsBadge nota={f.nota} />
                                  : <CellText value={getCellValue(f, col.id)} truncate={isLong} />
                                }
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile (< md): cards */}
                <div className="md:hidden divide-y divide-outline-variant/20">
                  {feedbacksPaginados.map(f => (
                    <RespostaCard key={f.id} f={f} activeCols={activeCols} />
                  ))}
                </div>

                {totalPagResp > 1 && (
                  <Paginacao
                    total={feedbacksFiltrados.length}
                    pagina={pagResp}
                    tamPagina={tamPagResp}
                    onChange={setPagResp}
                    onChangeTam={t => { setTamPagResp(t); setPagResp(1) }}
                    unidade={temFiltros ? 'resposta filtrada' : 'resposta carregada'}
                    unidadePlural={temFiltros ? 'respostas filtradas' : 'respostas carregadas'}
                  />
                )}
              </>
            )}
          </div>

          {/* ── Seção: Interações ─────────────────────────────────────────── */}
          <SectionTitle icon="touch_app">Interações</SectionTitle>

          <div className="w-full max-w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-title-md font-bold text-on-surface">
                  {totalEventosPeriodo.toLocaleString('pt-BR')}
                </span>
                <span className="text-label-md text-outline flex items-center gap-1">
                  {totalEventosPeriodo === 1 ? 'interação no período' : 'interações no período'}
                  {eventosPeriodo.length < totalEventosPeriodo && (
                    <span
                      className="material-symbols-outlined text-[13px] text-outline/50 cursor-help"
                      title={`A tabela e os filtros abaixo trabalham sobre as ${eventosPeriodo.length.toLocaleString('pt-BR')} interações mais recentes carregadas.`}
                    >
                      info
                    </span>
                  )}
                </span>
                {temFiltroEvento && (
                  <span className="text-label-md text-outline">
                    · {eventosFiltrados.length.toLocaleString('pt-BR')} {eventosFiltrados.length === 1 ? 'filtrada' : 'filtradas'} de {eventosPeriodo.length.toLocaleString('pt-BR')} carregadas
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {temFiltroEvento && (
                  <button
                    onClick={() => { setFiltroEvento('Todos'); setBuscaEvento('') }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-label-md text-on-surface-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                    Limpar
                  </button>
                )}
                <FiltroSelect
                  label="Tipo"
                  value={filtroEvento}
                  options={[
                    { value: 'Todos', label: 'Todos' },
                    { value: 'Visualização', label: 'Visualização' },
                    { value: 'Clique', label: 'Clique CTA' },
                  ]}
                  onChange={v => setFiltroEvento(v as typeof filtroEvento)}
                />
              </div>
            </div>

            {/* Busca e indicadores */}
            <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/30 space-y-2">
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
              <>
                {/* Desktop/tablet largo (>= md): tabela */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low border-b border-outline-variant">
                      <tr>
                        {['Tipo', 'Data/Hora', 'Usuário', 'Perfil', 'Cliente', 'Unidade', 'Estado'].map(h => (
                          <th key={h} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {eventosPaginados.map(e => {
                        const c = (e.contexto ?? {}) as Record<string, string>
                        const nome = c.usuario_nome || e.usuario_id
                        const email = c.usuario_email
                        const unidade = c.unidade_nome || c.clinica_nome
                        return (
                          <tr key={e.id} className="hover:bg-surface-container-low/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              <EventoBadge tipo={e.tipo_evento} />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              <CellText value={formatDateTime(e.criado_em)} />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle max-w-[180px]">
                              <div className="flex flex-col gap-0.5">
                                <span className={`text-[13px] truncate ${nome ? 'text-on-surface' : 'text-outline italic'}`} title={nome ?? undefined}>
                                  {nome ?? NI}
                                </span>
                                {email && (
                                  <span className="text-[11px] text-outline truncate" title={email}>{email}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              <CellText value={c.usuario_tipo || NI} />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle max-w-[160px]">
                              <span className={`text-[13px] truncate block ${c.cliente_nome ? 'text-on-surface' : 'text-outline italic'}`} title={c.cliente_nome ?? undefined}>
                                {c.cliente_nome ?? NI}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle max-w-[160px]">
                              <span className={`text-[13px] truncate block ${unidade ? 'text-on-surface' : 'text-outline italic'}`} title={unidade ?? undefined}>
                                {unidade ?? NI}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              <CellText value={c.Estado || NI} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile (< md): cards */}
                <div className="md:hidden divide-y divide-outline-variant/20">
                  {eventosPaginados.map(e => (
                    <InteracaoCard key={e.id} e={e} />
                  ))}
                </div>

                {totalPagInter > 1 && (
                  <Paginacao
                    total={eventosFiltrados.length}
                    pagina={pagInter}
                    tamPagina={tamPagInter}
                    onChange={setPagInter}
                    onChangeTam={t => { setTamPagInter(t); setPagInter(1) }}
                    unidade={temFiltroEvento ? 'interação filtrada' : 'interação carregada'}
                    unidadePlural={temFiltroEvento ? 'interações filtradas' : 'interações carregadas'}
                  />
                )}
              </>
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

function Paginacao({ total, pagina, tamPagina, onChange, onChangeTam, unidade, unidadePlural }: {
  total: number
  pagina: number
  tamPagina: number
  onChange: (p: number) => void
  onChangeTam: (t: number) => void
  unidade: string
  unidadePlural: string
}) {
  const totalPaginas = Math.ceil(total / tamPagina)
  const inicio = Math.min((pagina - 1) * tamPagina + 1, total)
  const fim = Math.min(pagina * tamPagina, total)
  return (
    <div className="px-4 sm:px-5 py-3 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest">
      <span className="text-label-md text-outline">
        Exibindo {inicio}–{fim} de {total} {total === 1 ? unidade : unidadePlural}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-label-md text-outline mr-1">Por página:</span>
          {[10, 25, 50].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onChangeTam(t)}
              className={`px-2.5 py-1 rounded-lg text-label-md transition-colors ${
                tamPagina === t
                  ? 'bg-primary text-on-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(pagina - 1)}
            disabled={pagina <= 1}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <span className="text-label-md text-on-surface-variant px-1 min-w-[4rem] text-center">
            {pagina} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => onChange(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function FiltroSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const isActive = !!value  // non-empty value means filter is active

  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-[11px] text-outline whitespace-nowrap font-medium">{label}</span>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-0.5 pl-2.5 pr-1.5 py-1 rounded-xl border text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
            isActive
              ? 'border-primary/40 bg-primary/5 text-primary'
              : 'border-outline-variant bg-surface-bright text-on-surface hover:border-outline'
          }`}
        >
          <span className="max-w-[120px] truncate block">{selected?.label ?? '—'}</span>
          <span className={`material-symbols-outlined text-[14px] transition-transform duration-150 shrink-0 ${open ? 'rotate-180' : ''} ${isActive ? 'text-primary' : 'text-outline'}`}>
            expand_more
          </span>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-max rounded-xl border border-outline-variant bg-surface-bright shadow-lg overflow-hidden">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-4 px-3 py-2 text-[13px] text-left transition-colors whitespace-nowrap ${
                  value === o.value
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-on-surface hover:bg-surface-container-low'
                }`}
              >
                {o.label}
                {value === o.value && (
                  <span className="material-symbols-outlined text-[13px] shrink-0">check</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FunnelStep({ icon, iconColor, barColor, label, value, pct, sub }: {
  icon: string; iconColor: string; barColor: string
  label: string; value: number; pct: number; sub: string
}) {
  const barWidth = Math.min(Math.max(pct, value > 0 ? 4 : 0), 100)
  return (
    <div className="flex-1 min-w-0 bg-surface-container-low rounded-2xl p-3.5 sm:p-4 flex flex-col gap-1.5 sm:gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`material-symbols-outlined text-[16px] shrink-0 ${iconColor}`}>{icon}</span>
        <span className="text-label-md text-on-surface-variant font-semibold truncate">{label}</span>
      </div>
      <p className="text-title-lg sm:text-headline-lg font-bold text-on-surface leading-none">{value.toLocaleString('pt-BR')}</p>
      <div className="w-full h-1.5 bg-outline-variant/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
      </div>
      <p className="text-label-md text-outline truncate">{sub}</p>
    </div>
  )
}

function FunnelArrow({ label }: { label: string }) {
  return (
    <div className="flex sm:flex-col items-center justify-center gap-1 px-1 py-2 sm:py-0 shrink-0">
      <span className="text-[12px] text-outline font-bold text-center leading-snug max-w-[112px] hidden sm:block">{label}</span>
      <span className="material-symbols-outlined text-outline text-[18px] rotate-90 sm:rotate-0">arrow_forward</span>
      <span className="text-[12px] text-outline font-bold text-center leading-snug sm:hidden">{label}</span>
    </div>
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

// Card de resposta para telas mobile (< md) — substitui a linha da tabela,
// que fica ilegível e com muitas colunas espremidas em telas estreitas.
function RespostaCard({ f, activeCols }: { f: Feedback; activeCols: ColDef[] }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-label-md font-bold text-white shrink-0 ${notaColor(f.nota)}`}>
            {f.nota}
          </span>
          <NpsBadge nota={f.nota} />
        </div>
        <span className="text-[11px] text-outline shrink-0">{getCellValue(f, 'data')}</span>
      </div>

      <div className="mt-2.5">
        <ObservacaoCell value={getCellValue(f, 'observacao')} />
      </div>

      <div className="mt-3 pt-3 border-t border-outline-variant/20 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Usuário</p>
          <UsuarioCellFeedback f={f} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Telefone</p>
          <CellText value={getCellValue(f, 'telefone')} />
        </div>
        <div className="min-w-0 col-span-2">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Unidade</p>
          <UnidadeCell f={f} />
        </div>
        {activeCols.map(col => (
          <div key={col.id} className="min-w-0">
            <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5 truncate">{col.label}</p>
            {col.id === 'perfil_nps'
              ? <NpsBadge nota={f.nota} />
              : <CellText value={getCellValue(f, col.id)} />
            }
          </div>
        ))}
      </div>
    </div>
  )
}

// Card de interação para telas mobile (< md) — mesma lógica de substituição da tabela.
function InteracaoCard({ e }: { e: EventoCampanha }) {
  const c = (e.contexto ?? {}) as Record<string, string>
  const nome = c.usuario_nome || e.usuario_id
  const email = c.usuario_email
  const unidade = c.unidade_nome || c.clinica_nome
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <EventoBadge tipo={e.tipo_evento} />
        <span className="text-[11px] text-outline shrink-0">{formatDateTime(e.criado_em)}</span>
      </div>

      <div className="mt-3 pt-3 border-t border-outline-variant/20 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div className="min-w-0 col-span-2">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Usuário</p>
          <span className={`text-[13px] block truncate ${nome ? 'text-on-surface' : 'text-outline italic'}`} title={nome ?? undefined}>
            {nome ?? NI}
          </span>
          {email && (
            <span className="text-[11px] text-outline block truncate" title={email}>{email}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Perfil</p>
          <CellText value={c.usuario_tipo || NI} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Estado</p>
          <CellText value={c.Estado || NI} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Cliente</p>
          <span className={`text-[13px] block truncate ${c.cliente_nome ? 'text-on-surface' : 'text-outline italic'}`} title={c.cliente_nome ?? undefined}>
            {c.cliente_nome ?? NI}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Unidade</p>
          <span className={`text-[13px] block truncate ${unidade ? 'text-on-surface' : 'text-outline italic'}`} title={unidade ?? undefined}>
            {unidade ?? NI}
          </span>
        </div>
      </div>
    </div>
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

function CellText({ value, truncate }: { value: string; truncate?: boolean }) {
  const empty = value === NI
  return (
    <span
      className={`text-[13px] leading-snug ${empty ? 'text-outline italic' : 'text-on-surface'} ${truncate && !empty ? 'truncate block max-w-[160px]' : ''}`}
      title={!empty ? value : undefined}
    >
      {value}
    </span>
  )
}

interface KpiCardProps {
  icon: string; iconColor: string; iconBg: string
  label: string; value: string; sub: string; large?: boolean
  tooltip?: string; subTooltip?: string; subExtra?: React.ReactNode
}

function KpiCard({ icon, iconColor, iconBg, label, value, sub, large, tooltip, subTooltip, subExtra }: KpiCardProps) {
  return (
    <div className="min-w-0 bg-surface-container-lowest p-3.5 sm:p-5 rounded-2xl border border-outline-variant/30 shadow-sm hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          <span className={`material-symbols-outlined ${iconColor} text-[17px] sm:text-[19px]`}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-label-md font-medium text-outline flex items-center gap-1 truncate">
            {label}
            {tooltip && (
              <span className="material-symbols-outlined text-[13px] text-outline/50 cursor-help shrink-0" title={tooltip}>
                info
              </span>
            )}
          </p>
          <p className={`font-bold text-on-surface leading-none mt-1 truncate ${large ? 'text-title-lg sm:text-display-sm' : 'text-title-lg sm:text-headline-lg'}`}>
            {value}
          </p>
          <p className="text-label-md font-medium text-outline mt-1 flex items-center gap-1">
            {sub}
            {subTooltip && (
              <span className="material-symbols-outlined text-[13px] text-outline/50 cursor-help shrink-0" title={subTooltip}>
                info
              </span>
            )}
          </p>
          {subExtra && <div className="mt-1.5">{subExtra}</div>}
        </div>
      </div>
    </div>
  )
}
