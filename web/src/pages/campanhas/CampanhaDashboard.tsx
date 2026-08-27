import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { get, getBlob } from '../../services/api'
import type { AvaliacaoDestaqueItem, DashboardData, DesempenhoConteudoItem, DesempenhoDestaqueItem, EventoCampanha, Feedback } from '../../types'
import { formatDateTime, getStatus, rotaEditarCampanha } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { TooltipIconButton } from '../../components/ui/TooltipIconButton'
import { blocosDashboardVisiveis, diasCivisNoIntervalo, variacaoPercentual, type IndicadorResumoDef } from './dashboardBlocos'

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

// ─── ajuda contextual — "Desempenho dos destaques" ──────────────────────────
// Só o tooltip do título da seção (nenhum ícone por coluna) — \n + a classe
// whitespace-pre-line no balão (ver uso abaixo) fazem cada métrica ficar em
// linha própria, sem precisar de markup/ReactNode no componente compartilhado.
const TOOLTIP_DESEMPENHO_DESTAQUES = [
  'Visualizações: vezes que o destaque apareceu para os usuários.',
  'Únicos: quantidade de usuários diferentes em cada métrica.',
  'Interações: cliques no badge para abrir ou fechar os detalhes da novidade.',
  'Cliques CTA: cliques no botão de ação configurado no destaque.',
  'Dispensaram: usuários que fecharam o destaque explicitamente.',
  'Avaliações: quantidade de respostas atuais de utilidade do destaque.',
  'Sim e Não: quantas dessas respostas disseram que a melhoria foi útil.',
  '% útil: percentual de respostas Sim em relação ao total de avaliações.',
].join('\n')

// ─── ajuda contextual — "Avaliações dos destaques" ──────────────────────────
const TOOLTIP_AVALIACOES_DESTAQUES = [
  'Lista as respostas de "Essa melhoria foi útil?" de cada destaque.',
  'Sim ou Não é a avaliação do usuário; o comentário é opcional.',
  'Independente do feedback geral da campanha (NPS ou CSAT).',
].join('\n')

// ─── ajuda contextual — "Cliques CTA por conteúdo" ─────────────────────────
const TOOLTIP_CLIQUES_POR_CONTEUDO =
  'Mostra os cliques nos CTAs de cada conteúdo. Esta métrica não representa visualizações individuais dos conteúdos.'

// ─── period filter ─────────────────────────────────────────────────────────────

type PeriodoOpcao = 'todo' | 'hoje' | '7d' | '30d' | 'mes' | 'custom'

interface Periodo {
  opcao: PeriodoOpcao
  customInicio: string
  customFim: string
}

const PERIODO_INICIAL: Periodo = { opcao: '30d', customInicio: '', customFim: '' }

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


function npsLabel(nota: number): 'Promotor' | 'Neutro' | 'Detrator' {
  if (nota >= 9) return 'Promotor'
  if (nota >= 7) return 'Neutro'
  return 'Detrator'
}

function notaColor(n: number): string {
  if (n <= 6) return 'bg-error'
  if (n <= 8) return 'bg-amber-400'
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
  const [colMenuPos, setColMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS)
  const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false)
  const [filtroEvento, setFiltroEvento] = useState<'Todos' | 'Visualização' | 'Clique' | 'Interação' | 'Dispensa'>('Todos')
  const [buscaEvento, setBuscaEvento] = useState('')
  // Só usado/exibido pra campanhas destaque_elemento (ver blocos.filtroDestaque
  // abaixo) — '' significa "todos os destaques".
  const [filtroDestaque, setFiltroDestaque] = useState('')
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_INICIAL)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  // paginação respostas
  const [pagResp, setPagResp] = useState(1)
  const [tamPagResp, setTamPagResp] = useState(10)
  // paginação interações
  const [pagInter, setPagInter] = useState(1)
  const [tamPagInter, setTamPagInter] = useState(10)
  // Filtros/paginação da seção "Avaliações dos destaques" — independentes
  // dos filtros de Interações acima (seções diferentes, cada uma com seu
  // próprio estado), só usados/exibidos pra campanhas destaque_elemento.
  const [filtroDestaqueAvaliacao, setFiltroDestaqueAvaliacao] = useState('')
  const [filtroUtilAvaliacao, setFiltroUtilAvaliacao] = useState<'Todos' | 'Sim' | 'Não'>('Todos')
  const [buscaAvaliacao, setBuscaAvaliacao] = useState('')
  const [pagAvaliacao, setPagAvaliacao] = useState(1)
  const [tamPagAvaliacao, setTamPagAvaliacao] = useState(10)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const colMenuPopoverRef = useRef<HTMLDivElement>(null)

  const load = (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    const { inicio, fim } = periodoRange(periodo)
    if (inicio) params.set('data_inicio', inicio.toISOString())
    if (fim) params.set('data_fim', fim.toISOString())
    params.set('res_page', String(pagResp)); params.set('res_per_page', String(tamPagResp))
    params.set('event_page', String(pagInter)); params.set('event_per_page', String(tamPagInter))
    params.set('avaliacao_page', String(pagAvaliacao)); params.set('avaliacao_per_page', String(tamPagAvaliacao))
    if (filtros.nps !== 'Todos') params.set('nps', filtros.nps)
    if (filtros.nota) params.set('nota', filtros.nota)
    if (filtros.cliente) params.set('cliente_nome', filtros.cliente)
    if (filtros.unidade) params.set('unidade_nome', filtros.unidade)
    if (filtros.perfil) params.set('usuario_tipo', filtros.perfil)
    if (filtros.estado) params.set('estado', filtros.estado)
    if (filtros.telefone !== 'Todos') params.set('tem_telefone', filtros.telefone === 'Informado' ? 'sim' : 'nao')
    if (filtros.busca.trim()) params.set('busca', filtros.busca.trim())
    if (filtroEvento !== 'Todos') params.set('tipo', filtroEvento)
    if (filtroDestaque) params.set('destaque_id', filtroDestaque)
    if (buscaEvento.trim()) params.set('busca_evento', buscaEvento.trim())
    if (filtroDestaqueAvaliacao) params.set('avaliacao_destaque_id', filtroDestaqueAvaliacao)
    if (filtroUtilAvaliacao !== 'Todos') params.set('avaliacao_util', filtroUtilAvaliacao === 'Sim' ? 'sim' : 'nao')
    if (buscaAvaliacao.trim()) params.set('busca_avaliacao', buscaAvaliacao.trim())
    get<DashboardData>(`/dashboard/campanhas/${id}?${params}`, { signal })
      .then(setData)
      .catch(e => {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message)
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [id, periodo, filtros, pagResp, tamPagResp, pagInter, tamPagInter, pagAvaliacao, tamPagAvaliacao, filtroEvento, filtroDestaque, buscaEvento, filtroDestaqueAvaliacao, filtroUtilAvaliacao, buscaAvaliacao])

  useEffect(() => {
    if (!showColMenu) return
    // Popover é portalado pra <body> (ver render) pra escapar do
    // overflow-hidden do card — por isso o clique-fora precisa checar os
    // DOIS refs (botão + popover), já que o popover não é mais descendente
    // do botão no DOM.
    const atualizarPosicao = () => {
      const rect = colMenuRef.current?.getBoundingClientRect()
      if (!rect) return
      setColMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    atualizarPosicao()
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (colMenuRef.current?.contains(target) || colMenuPopoverRef.current?.contains(target)) return
      setShowColMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', atualizarPosicao, true)
    window.addEventListener('resize', atualizarPosicao)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', atualizarPosicao, true)
      window.removeEventListener('resize', atualizarPosicao)
    }
  }, [showColMenu])

  // reset respostas page when filters or period change
  useEffect(() => { setPagResp(1) }, [filtros])

  // reset interações page when filters change
  useEffect(() => { setPagInter(1) }, [filtroEvento, filtroDestaque, buscaEvento])

  // reset avaliações dos destaques page when filters change
  useEffect(() => { setPagAvaliacao(1) }, [filtroDestaqueAvaliacao, filtroUtilAvaliacao, buscaAvaliacao])

  const alterarPeriodo = (atualizar: Periodo | ((atual: Periodo) => Periodo)) => {
    setPagResp(1)
    setPagInter(1)
    setPagAvaliacao(1)
    setPeriodo(atualizar)
  }

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
    return data?.feedbacks_recentes ?? []
  }, [data])
  // A lista já vem filtrada e paginada pelo servidor; nunca aplicar uma
  // segunda filtragem local sobre uma página parcial.
  const feedbacksFiltrados = feedbacksPeriodo

  const eventosPeriodo = useMemo(() => {
    return data?.eventos_recentes ?? []
  }, [data])

  // paginação respostas
  const feedbacksPaginados = useMemo(() => {
    return feedbacksPeriodo
  }, [feedbacksPeriodo])
  const totalPagResp = Math.ceil((data?.total ?? 0) / tamPagResp)



  const temFiltrosAvancados = filtros.nps !== 'Todos' || filtros.nota !== '' || filtros.cliente !== '' ||
    filtros.unidade !== '' || filtros.perfil !== '' || filtros.estado !== '' || filtros.telefone !== 'Todos'
  const temFiltros = temFiltrosAvancados || filtros.busca !== ''

  const qtdFiltrosAvancados = [
    filtros.nps !== 'Todos', filtros.nota !== '', filtros.cliente !== '',
    filtros.unidade !== '', filtros.perfil !== '', filtros.estado !== '', filtros.telefone !== 'Todos',
  ].filter(Boolean).length


  const eventosFiltrados = useMemo(() => {
    return eventosPeriodo
  }, [eventosPeriodo])

  // paginação interações
  const eventosPaginados = useMemo(() => {
    return eventosFiltrados
  }, [eventosFiltrados])
  const totalPagInter = Math.ceil((data?.eventos_total ?? 0) / tamPagInter)

  const temFiltroEvento = filtroEvento !== 'Todos' || filtroDestaque !== '' || buscaEvento !== ''

  const blocos = blocosDashboardVisiveis(data?.campanha.modo_exibicao ?? '')
  // Cliques CTA por conteúdo (só formato não-destaque) — o backend já devolve
  // em ordem de `ordem` ASC, então nunca reordenamos aqui.
  const desempenhoConteudos = data?.desempenho_conteudos ?? []
  const cliquesCtaSemConteudo = data?.cliques_cta_sem_conteudo ?? 0
  const desempenhoDestaques = data?.desempenho_destaques ?? []
  const destaquesOrdenados = useMemo(() => [...desempenhoDestaques].sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1
    if (a.percentual_util !== b.percentual_util) return (b.percentual_util ?? -1) - (a.percentual_util ?? -1)
    if (a.avaliacoes !== b.avaliacoes) return b.avaliacoes - a.avaliacoes
    return b.visualizacoes - a.visualizacoes
  }), [desempenhoDestaques])
  const destaqueTituloPorId = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const item of desempenhoDestaques) mapa.set(item.destaque_item_id, item.titulo)
    return mapa
  }, [desempenhoDestaques])
  // Só pra sinalizar "Removido" na seção "Avaliações dos destaques" — a
  // tabela de Interações já resolve título pelo mesmo destaqueTituloPorId
  // sem esse selo, comportamento dela preservado como estava.
  const destaqueAtivoPorId = useMemo(() => {
    const mapa = new Map<string, boolean>()
    for (const item of desempenhoDestaques) mapa.set(item.destaque_item_id, item.ativo)
    return mapa
  }, [desempenhoDestaques])

  // ── Avaliações dos destaques (utilidade_destaque) — só destaque_elemento ──
  const avaliacoesDestaques = data?.avaliacoes_destaques ?? []

  const avaliacoesPeriodo = useMemo(() => {
    return avaliacoesDestaques
  }, [avaliacoesDestaques])
  const avaliacoesFiltradas = avaliacoesPeriodo

  const avaliacoesPaginadas = useMemo(() => {
    return avaliacoesPeriodo
  }, [avaliacoesPeriodo])
  const totalPagAvaliacao = Math.ceil((data?.avaliacoes_total ?? 0) / tamPagAvaliacao)

  const temFiltroAvaliacao = filtroDestaqueAvaliacao !== '' || filtroUtilAvaliacao !== 'Todos' || buscaAvaliacao !== ''

  // ── KPI metrics — período-aware ──────────────────────────────────────────
  const kpiVisualizacoes = data?.visualizacoes ?? 0
  const kpiVisualizacoesUnicas = data?.visualizacoes_unicas ?? 0
  const kpiCliques = data?.cliques_cta ?? 0
  const kpiCliquesUnicos = data?.cliques_unicos ?? 0
  const kpiTotal = data?.total_periodo ?? data?.total ?? 0
  const kpiMedia: number | null = data?.media ?? null
  const kpiDistribuicao: Record<string, number> = data?.distribuicao ?? {}
  const kpiTaxaClique = kpiVisualizacoes > 0 ? Math.round((kpiCliques / kpiVisualizacoes) * 1000) / 10 : 0
  const kpiRespondentesUnicos = data?.respondentes_unicos ?? 0
  // total real de interações no período (visualizações + cliques, contagens completas do backend)
  const totalEventosPeriodo = kpiVisualizacoes + kpiCliques

  // ── KPIs específicos de destaque_elemento — reaproveitam dados já
  // implementados (eventosPeriodo, desempenhoDestaques, avaliacoesPeriodo),
  // nenhum cálculo novo além de somar/filtrar o que já existe. Mesmo padrão
  // período-ativo/total-do-backend das métricas acima: com período ativo,
  // filtra a lista já carregada; sem período, usa os totais exatos que já
  // vêm prontos em desempenho_destaques (nunca capados em 100 como
  // eventos_recentes).
  const kpiInteracoes = periodoAtivo
    ? (data?.destaque_resumo_periodo.interacoes ?? 0)
    : desempenhoDestaques.reduce((s, i) => s + i.interacoes, 0)
  const kpiTaxaInteracao = kpiVisualizacoes > 0 ? Math.round((kpiInteracoes / kpiVisualizacoes) * 1000) / 10 : 0
  const kpiDispensas = periodoAtivo
    ? (data?.destaque_resumo_periodo.dispensas ?? 0)
    : desempenhoDestaques.reduce((s, i) => s + i.dispensas, 0)
  const kpiAvaliacoesTotal = periodoAtivo
    ? (data?.destaque_resumo_periodo.avaliacoes ?? 0)
    : desempenhoDestaques.reduce((s, i) => s + i.avaliacoes, 0)
  const kpiSimTotal = periodoAtivo
    ? (data?.destaque_resumo_periodo.sim ?? 0)
    : desempenhoDestaques.reduce((s, i) => s + i.sim, 0)
  const kpiNaoTotal = Math.max(0, kpiAvaliacoesTotal - kpiSimTotal)
  const kpiPercentualUtil = kpiAvaliacoesTotal > 0 ? Math.round((kpiSimTotal / kpiAvaliacoesTotal) * 1000) / 10 : null

  // Valores dos chips-resumo da seção Interações — QUAIS chips aparecem
  // (e com que rótulo) vem de blocos.indicadoresInteracoes (dashboardBlocos.ts);
  // aqui só existe o mapeamento key -> valor já calculado acima, sem
  // condicional de modo_exibicao nenhuma.
  const valoresIndicadoresInteracoes: Record<IndicadorResumoDef['key'], string> = {
    visualizacoes: kpiVisualizacoes.toLocaleString('pt-BR'),
    usuariosUnicos: kpiVisualizacoesUnicas.toLocaleString('pt-BR'),
    interacoes: kpiInteracoes.toLocaleString('pt-BR'),
    cliquesCta: kpiCliques.toLocaleString('pt-BR'),
    clicadoresUnicos: kpiCliquesUnicos.toLocaleString('pt-BR'),
    dispensas: kpiDispensas.toLocaleString('pt-BR'),
    taxaClique: `${kpiTaxaClique.toLocaleString('pt-BR')}%`,
  }

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

  const serieImpressao = data?.serie_impressao ?? []
  const serieAnterior = data?.serie_impressao_anterior ?? []
  const diasPeriodo = diasCivisNoIntervalo(data?.periodo.inicio, data?.periodo.fim)
  const mediaDiaria = serieImpressao.length > 0
    ? Math.round(serieImpressao.reduce((sum, p) => sum + p.visualizacoes, 0) / (diasPeriodo ?? serieImpressao.length))
    : 0
  const variacaoVisualizacoes = variacaoPercentual(kpiVisualizacoes, data?.comparacao?.visualizacoes)
  const variacaoRespostas = variacaoPercentual(kpiTotal, data?.comparacao?.respostas)
  const variacaoCliques = variacaoPercentual(kpiCliques, data?.comparacao?.cliques_cta)
  const atividadeSemana = data?.atividade_semana ?? []
  const maiorDia = atividadeSemana.reduce<{ dia: number; visualizacoes: number } | null>(
    (maior, atual) => !maior || atual.visualizacoes > maior.visualizacoes ? atual : maior, null,
  )
  const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const totalAtividade = atividadeSemana.reduce((s, d) => s + d.visualizacoes, 0)
  const percentualMaiorDia = maiorDia && totalAtividade ? Math.round(maiorDia.visualizacoes / totalAtividade * 1000) / 10 : 0
  const notaMaisFrequente = Array.from({ length: 11 }, (_, nota) => ({ nota, total: kpiDistribuicao[String(nota)] ?? 0 }))
    .sort((a, b) => b.total - a.total || b.nota - a.nota)[0]
  const quotes = data?.quotes_nps ?? []

  // % de visualizações que resultaram em resposta — usado no funil (Visualizações → Respostas)
  const taxaRespostaPorVisualizacao = kpiVisualizacoes > 0
    ? Math.round((kpiTotal / kpiVisualizacoes) * 1000) / 10
    : 0
  // baseado em usuários (card Respostas) — só faz sentido quando há usuários respondentes identificados
  const temRespondentes = kpiRespondentesUnicos > 0

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
    <section className="min-h-full overflow-x-hidden bg-[#f5f7fb] px-4 py-6 lg:px-margin-desktop lg:py-8">

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="mx-auto mb-6 flex max-w-[1480px] flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <nav className="mb-2.5 flex gap-2 text-[12px] font-bold text-[#98a2b3]">
            <button onClick={() => navigate('/campanhas')} className="hover:text-primary transition-colors">Campanhas</button>
            <span>/</span>
            <span className="text-on-surface">Dashboard</span>
          </nav>
          <h2 className="break-words text-[24px] font-bold leading-[1.16] tracking-[-0.035em] text-[#101828] sm:text-[30px]">
            {data?.campanha.nome_interno ?? 'Dashboard da Campanha'}
          </h2>
          {data && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-[30px] items-center rounded-full border border-[#e7ebf2] bg-white px-3 text-[12px] font-bold text-[#667085]">{data.campanha.sistema}</span>
              <StatusBadge status={getStatus(data.campanha)} />
              <TypeBadge tipo={data.campanha.tipo} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          <button
            onClick={() => navigate(`/campanhas/${id}/preview`)}
            className="flex h-[42px] items-center gap-2 rounded-xl border border-[#e7ebf2] bg-white px-4 text-[13px] font-bold text-[#344054] shadow-sm transition-colors hover:border-primary/40"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            Preview
          </button>
          <button
            onClick={() => navigate(data ? rotaEditarCampanha(data.campanha) : `/campanhas/${id}/editar`)}
            className="flex h-[42px] items-center gap-2 rounded-xl border border-primary bg-primary px-[18px] text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Editar
          </button>
        </div>
      </div>

      {loading && !data && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!error && data && (
        <>
          <div className="mx-auto max-w-[1480px]">
          {/* ── Filtro de período ──────────────────────────────────────────── */}
          <div className="mb-5 flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#e7ebf2] bg-white p-[7px] shadow-sm">
            {(['hoje', '7d', '30d', 'mes', 'todo', 'custom'] as PeriodoOpcao[]).map(op => (
              <button
                key={op}
                onClick={() => alterarPeriodo(p => ({ ...p, opcao: op }))}
                className={`h-[34px] whitespace-nowrap rounded-[10px] border-0 px-[13px] text-[12px] font-bold transition-all ${
                  periodo.opcao === op
                    ? 'bg-[#101828] text-white'
                    : 'bg-transparent text-[#667085] hover:bg-[#f5f7fb] hover:text-[#101828]'
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
                  onChange={e => alterarPeriodo(p => ({ ...p, customInicio: e.target.value }))}
                  className="h-[34px] rounded-lg border border-[#dfe3e9] bg-white px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-label-md text-outline">até</span>
                <input
                  type="date"
                  value={periodo.customFim}
                  onChange={e => alterarPeriodo(p => ({ ...p, customFim: e.target.value }))}
                  className="h-[34px] rounded-lg border border-[#dfe3e9] bg-white px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </>
            )}
            {periodoAtivo && (
              <button
                onClick={() => alterarPeriodo(PERIODO_INICIAL)}
                className="flex h-[34px] items-center gap-1 whitespace-nowrap px-2.5 text-[12px] font-bold text-[#667085] transition-colors hover:text-error"
                title="Restaurar todo período"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Restaurar
              </button>
            )}
          </div>

          {/* KPIs no topo, como no relatório de referência. */}
          {blocos.kpiDestaque ? (
            <div className="mb-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon="visibility" iconColor="text-primary" iconBg="bg-primary/10"
                label="Visualizações" value={kpiVisualizacoes.toLocaleString('pt-BR')}
                trend={variacaoVisualizacoes}
                sub={`${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} usuários únicos`}
                subTooltip="Visualizações únicas representam a quantidade de usuários distintos que visualizaram os destaques no período selecionado."
              />
              <KpiCard
                icon="touch_app" iconColor="text-secondary" iconBg="bg-secondary/10"
                label="Interações" value={kpiInteracoes.toLocaleString('pt-BR')}
                sub={`${kpiTaxaInteracao.toLocaleString('pt-BR')}% das visualizações`}
                subTooltip="Interações = cliques no badge para abrir ou fechar os detalhes de um destaque. Taxa = interações ÷ visualizações totais. O cálculo respeita o período selecionado."
              />
              <KpiCard
                icon="ads_click" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Cliques CTA" value={kpiCliques.toLocaleString('pt-BR')}
                trend={variacaoCliques}
                sub={`${kpiCliquesUnicos.toLocaleString('pt-BR')} usuários únicos · ${kpiTaxaClique.toLocaleString('pt-BR')}% das visualizações`}
                subTooltip="Taxa de clique = cliques no CTA ÷ visualizações totais dos destaques (não por usuários únicos). O cálculo respeita o período selecionado."
              />
              <KpiCard
                icon="thumbs_up_down" iconColor="text-primary" iconBg="bg-primary/10"
                label="Avaliações" value={kpiAvaliacoesTotal.toLocaleString('pt-BR')}
                sub={kpiPercentualUtil === null ? 'sem avaliações ainda' : `${kpiPercentualUtil.toLocaleString('pt-BR')}% consideraram útil`}
                subTooltip="Avaliações = respostas de utilidade ('Essa melhoria foi útil?') recebidas nos destaques. % útil = respostas Sim ÷ total de avaliações. O cálculo respeita o período selecionado."
                subExtra={kpiAvaliacoesTotal > 0 ? <UtilidadeBar sim={kpiSimTotal} nao={kpiNaoTotal} compacta /> : undefined}
              />
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon="visibility" iconColor="text-primary" iconBg="bg-primary/10"
                label="Impressões" value={kpiVisualizacoes.toLocaleString('pt-BR')}
                trend={variacaoVisualizacoes}
                sub={data.comparacao ? `vs. ${data.comparacao.visualizacoes.toLocaleString('pt-BR')} no período anterior` : `${kpiVisualizacoesUnicas.toLocaleString('pt-BR')} usuários únicos`}
                subTooltip="Visualizações únicas representam a quantidade de usuários distintos que visualizaram a campanha no período selecionado."
              />
              <KpiCard
                icon="forum" iconColor="text-secondary" iconBg="bg-secondary/10"
                label="Respostas" value={kpiTotal.toLocaleString('pt-BR')}
                trend={variacaoRespostas}
                sub={`Taxa de resposta de ${taxaRespostaPorVisualizacao.toLocaleString('pt-BR')}%`}
                subTooltip={
                  temRespondentes
                    ? "Taxa de resposta = usuários que responderam ÷ usuários únicos que visualizaram a campanha. O cálculo respeita o período selecionado."
                    : "Média de respostas por usuário único que visualizou a campanha (sem usuários respondentes identificados para calcular uma taxa). O cálculo respeita o período selecionado."
                }
              />
              <KpiCard
                icon="ads_click" iconColor="text-tertiary" iconBg="bg-tertiary/10"
                label="Cliques CTA" value={kpiCliques.toLocaleString('pt-BR')}
                trend={variacaoCliques}
                sub={`${kpiCliquesUnicos.toLocaleString('pt-BR')} usuários únicos · ${kpiTaxaClique.toLocaleString('pt-BR')}% das visualizações`}
                subTooltip="Taxa de clique = cliques no CTA ÷ visualizações totais da campanha (não por usuários únicos). O cálculo respeita o período selecionado."
              />
              {kpiTotal > 0 ? (
                <KpiCard
                  icon="speed" iconColor="text-amber-600" iconBg="bg-amber-50"
                  label="NPS" value={`${npsScore > 0 ? '+' : ''}${npsScore}`}
                  sub={`${promotores} promotores · ${neutros} neutros · ${detratores} detratores`}
                  tooltip="NPS = % de promotores − % de detratores. Promotores: notas 9 e 10. Neutros: notas 7 e 8. Detratores: notas de 0 a 6."
                />
              ) : (
                <KpiCard
                  icon="speed" iconColor="text-amber-600" iconBg="bg-amber-50"
                  label="NPS" value="—"
                  sub="sem respostas ainda"
                />
              )}
            </div>
          )}

          {/* Dados agregados no servidor; listas paginadas não alimentam gráficos. */}
          {blocos.graficoImpressoes && !blocos.funilEngajamento && (
            <div className="mb-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.75fr)]">
              <ImpressionChart
                serie={serieImpressao}
                serieAnterior={serieAnterior}
                mediaDiaria={mediaDiaria}
                titulo="Impressões dos destaques"
              />
              <ActivityPanel atividade={atividadeSemana} maiorDia={maiorDia} total={totalAtividade} percentualMaiorDia={percentualMaiorDia} nomesDias={nomesDias} />
            </div>
          )}
          {blocos.funilEngajamento && (
            <div className="mb-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.75fr)]">
              <div className="grid min-w-0 gap-4">
                <ImpressionChart serie={serieImpressao} serieAnterior={serieAnterior} mediaDiaria={mediaDiaria} />
                <EngagementFunnel
                  visualizacoes={kpiVisualizacoes}
                  respostas={kpiTotal}
                  cliques={kpiCliques}
                  taxaResposta={taxaRespostaPorVisualizacao}
                  taxaClique={kpiTaxaClique}
                />
              </div>
              <div className="grid min-w-0 gap-4">
                <ActivityPanel atividade={atividadeSemana} maiorDia={maiorDia} total={totalAtividade} percentualMaiorDia={percentualMaiorDia} nomesDias={nomesDias} />
                <NpsExecutive score={npsScore} media={kpiMedia} detratores={detratores} percentualDetratores={pctDetr} quotes={quotes} />
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

          {blocos.distribuicaoNotas && kpiTotal > 0 && (
            <NpsDeepDive
              score={npsScore}
              promotores={promotores}
              neutros={neutros}
              detratores={detratores}
              pctProm={pctProm}
              pctNeut={pctNeut}
              pctDetr={pctDetr}
              distribuicao={kpiDistribuicao}
              maxDist={maxDist}
              notaMaisFrequente={notaMaisFrequente}
            />
          )}

          {/* ── Seção: Respostas (feedback geral/NPS — não existe pra
              destaque_elemento; bloco preservado no código, só não exibido) ── */}
          {blocos.secaoRespostas && (
          <>
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
                      title={`A tabela mostra a página ${pagResp} de ${totalPagResp}; os KPIs usam as ${kpiTotal.toLocaleString('pt-BR')} respostas do período.`}
                    >
                      info
                    </span>
                  )}
                </span>
                {temFiltros && (
                  <span className="text-label-md text-outline">
                    · {data.total.toLocaleString('pt-BR')} {data.total === 1 ? 'filtrada' : 'filtradas'} no universo filtrado
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
                  {showColMenu && colMenuPos && createPortal(
                    <div
                      ref={colMenuPopoverRef}
                      style={{ position: 'fixed', top: colMenuPos.top, right: colMenuPos.right }}
                      className="z-50 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-2 w-52 max-h-80 overflow-y-auto"
                    >
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
                    </div>,
                    document.body
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
            ) : data.total === 0 ? (
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
                    total={data.total}
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
          </>
          )}

          {/* ── Seção: Desempenho dos destaques (só destaque_elemento) ──────── */}
          {blocos.desempenhoDestaques && desempenhoDestaques.length > 0 && (
            <>
              <SectionTitle icon="new_releases" tooltip={TOOLTIP_DESEMPENHO_DESTAQUES}>Desempenho dos destaques</SectionTitle>
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {destaquesOrdenados.map((item, index) => (
                  <DestaquePerformanceCard
                    key={item.destaque_item_id}
                    item={item}
                    liderUtilidade={index === 0 && item.ativo && item.percentual_util !== null}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Seção: Avaliações dos destaques (só destaque_elemento) ──────── */}
          {/* Sempre exibida pra destaque_elemento, mesmo sem nenhuma avaliação
              ainda — diferente de "Desempenho dos destaques" (que só aparece
              com dados), esta seção não deve sumir por quantidade zero. */}
          {blocos.avaliacoesDestaques && (
            <>
              <SectionTitle icon="thumbs_up_down" tooltip={TOOLTIP_AVALIACOES_DESTAQUES}>Avaliações dos destaques</SectionTitle>
              <div className="w-full max-w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden mb-6">

                {/* Header */}
                <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-title-md font-bold text-on-surface">
                      {data.avaliacoes_total.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-label-md text-outline">
                      {data.avaliacoes_total === 1 ? 'avaliação no período' : 'avaliações no período'}
                    </span>
                    {temFiltroAvaliacao && (
                      <span className="text-label-md text-outline">
                        · {data.avaliacoes_total.toLocaleString('pt-BR')} {data.avaliacoes_total === 1 ? 'filtrada' : 'filtradas'} no universo filtrado
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {temFiltroAvaliacao && (
                      <button
                        onClick={() => { setFiltroDestaqueAvaliacao(''); setFiltroUtilAvaliacao('Todos'); setBuscaAvaliacao('') }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-label-md text-on-surface-variant hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                        Limpar
                      </button>
                    )}
                    <FiltroSelect
                      label="Destaque"
                      value={filtroDestaqueAvaliacao}
                      options={[
                        { value: '', label: 'Todos' },
                        ...desempenhoDestaques.map(item => ({ value: item.destaque_item_id, label: item.titulo })),
                      ]}
                      onChange={setFiltroDestaqueAvaliacao}
                    />
                    <FiltroSelect
                      label="Avaliação"
                      value={filtroUtilAvaliacao}
                      options={[
                        { value: 'Todos', label: 'Todos' },
                        { value: 'Sim', label: 'Sim' },
                        { value: 'Não', label: 'Não' },
                      ]}
                      onChange={v => setFiltroUtilAvaliacao(v as typeof filtroUtilAvaliacao)}
                    />
                  </div>
                </div>

                {/* Busca */}
                <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/30">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-outline pointer-events-none">search</span>
                    <input
                      type="text"
                      value={buscaAvaliacao}
                      onChange={e => setBuscaAvaliacao(e.target.value)}
                      placeholder="Buscar por usuário, e-mail ou comentário…"
                      className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-xl text-body-sm bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Tabela ou estado vazio */}
                {data.avaliacoes_total === 0 ? (
                  <EmptySection
                    icon="thumbs_up_down"
                    title="Nenhuma avaliação recebida ainda."
                    message="As respostas de utilidade dos destaques aparecerão aqui assim que os usuários avaliarem."
                  />
                ) : avaliacoesPeriodo.length === 0 ? (
                  <EmptySection
                    icon="event_busy"
                    title="Nenhuma avaliação neste período"
                    message="Não há avaliações de utilidade no intervalo selecionado. Tente ampliar o período ou escolher 'Todo período'."
                  />
                ) : avaliacoesFiltradas.length === 0 ? (
                  <EmptySection
                    icon="search_off"
                    title="Nenhuma avaliação encontrada"
                    message="Nenhuma avaliação corresponde aos filtros selecionados. Tente ajustar o destaque, a avaliação ou a busca."
                  />
                ) : (
                  <>
                    {/* Desktop/tablet largo (>= md): tabela */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-surface-container-low border-b border-outline-variant">
                          <tr>
                            {['Data/Hora', 'Destaque', 'Avaliação', 'Comentário', 'Usuário', 'Cliente', 'Unidade'].map(h => (
                              <th key={h} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/30">
                          {avaliacoesPaginadas.map(a => {
                            const c = (a.contexto ?? {}) as Record<string, string>
                            const titulo = a.destaque_item_id ? destaqueTituloPorId.get(a.destaque_item_id) : undefined
                            const removido = a.destaque_item_id ? destaqueAtivoPorId.get(a.destaque_item_id) === false : false
                            const nome = a.usuario_nome || c.usuario_nome || a.usuario_id
                            const email = a.usuario_email || c.usuario_email
                            const unidade = c.unidade_nome || c.clinica_nome
                            const comentario = a.observacao?.trim() || NI
                            return (
                              <tr key={a.id} className="hover:bg-surface-container-low/50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap align-middle">
                                  <CellText value={formatDateTime(a.criado_em)} />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap align-middle max-w-[180px]">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[13px] truncate ${titulo ? 'text-on-surface' : 'text-outline italic'}`} title={titulo}>
                                      {titulo ?? NI}
                                    </span>
                                    {removido && (
                                      <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-outline-variant/30 text-outline">
                                        Removido
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap align-middle">
                                  <UtilBadge util={a.util} />
                                </td>
                                <td className="px-4 py-3 align-middle max-w-[260px]">
                                  <ObservacaoCell value={comentario} />
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
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile (< md): cards */}
                    <div className="md:hidden divide-y divide-outline-variant/20">
                      {avaliacoesPaginadas.map(a => (
                        <AvaliacaoDestaqueCard
                          key={a.id}
                          a={a}
                          destaqueTitulo={a.destaque_item_id ? destaqueTituloPorId.get(a.destaque_item_id) : undefined}
                          destaqueRemovido={a.destaque_item_id ? destaqueAtivoPorId.get(a.destaque_item_id) === false : false}
                        />
                      ))}
                    </div>

                    {totalPagAvaliacao > 1 && (
                      <Paginacao
                        total={data.avaliacoes_total}
                        pagina={pagAvaliacao}
                        tamPagina={tamPagAvaliacao}
                        onChange={setPagAvaliacao}
                        onChangeTam={t => { setTamPagAvaliacao(t); setPagAvaliacao(1) }}
                        unidade={temFiltroAvaliacao ? 'avaliação filtrada' : 'avaliação carregada'}
                        unidadePlural={temFiltroAvaliacao ? 'avaliações filtradas' : 'avaliações carregadas'}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ── Seção: Cliques CTA por conteúdo (só formato não-destaque) ───── */}
          {/* Mesma posição relativa que "Desempenho/Avaliações dos destaques"
              ocupam pro formato destaque_elemento — os dois blocos nunca
              coexistem (blocos.desempenhoConteudos === !destaque). Aparece com
              pelo menos 1 conteúdo OU quando há cliques legados sem conteúdo
              identificado. */}
          {blocos.desempenhoConteudos && (desempenhoConteudos.length > 0 || cliquesCtaSemConteudo > 0) && (
            <>
              <SectionTitle icon="ads_click" tooltip={TOOLTIP_CLIQUES_POR_CONTEUDO}>Cliques CTA por conteúdo</SectionTitle>
              <div className="w-full max-w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden mb-6">
                {/* Desktop/tablet largo (>= md): tabela */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low border-b border-outline-variant">
                      <tr>
                        {['#', 'Conteúdo', 'Cliques CTA', 'Cliques únicos'].map(h => (
                          <th key={h} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {desempenhoConteudos.map(item => (
                        <tr key={item.conteudo_item_id} className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap align-middle text-[13px] text-outline">{item.ordem}</td>
                          <td className="px-4 py-3 align-middle max-w-[280px]">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] truncate text-on-surface" title={item.titulo}>{item.titulo}</span>
                              {!item.tem_cta && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-outline-variant/30 text-outline">
                                  Sem CTA
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle text-[13px] text-on-surface">
                            {item.tem_cta ? item.cliques_cta.toLocaleString('pt-BR') : <span className="text-outline">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle text-[13px] text-on-surface">
                            {item.tem_cta ? item.cliques_cta_unicos.toLocaleString('pt-BR') : <span className="text-outline">—</span>}
                          </td>
                        </tr>
                      ))}
                      {cliquesCtaSemConteudo > 0 && (
                        <tr className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap align-middle text-[13px] text-outline">—</td>
                          <td className="px-4 py-3 align-middle max-w-[280px]">
                            <span className="text-[13px] text-outline italic">Cliques anteriores sem identificação do conteúdo</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle text-[13px] text-outline">
                            {cliquesCtaSemConteudo.toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap align-middle text-[13px] text-outline">—</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile (< md): cards — mesmo padrão de RespostaCard/InteracaoCard/AvaliacaoDestaqueCard */}
                <div className="md:hidden divide-y divide-outline-variant/20">
                  {desempenhoConteudos.map(item => (
                    <ConteudoCliquesCard key={item.conteudo_item_id} item={item} />
                  ))}
                  {cliquesCtaSemConteudo > 0 && (
                    <div className="p-4">
                      <span className="text-[13px] text-outline italic block">Cliques anteriores sem identificação do conteúdo</span>
                      <div className="mt-3 pt-3 border-t border-outline-variant/20 grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <div className="min-w-0">
                          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Cliques CTA</p>
                          <span className="text-[13px] block text-outline">{cliquesCtaSemConteudo.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Cliques únicos</p>
                          <span className="text-[13px] block text-outline">—</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Seção: Interações ─────────────────────────────────────────── */}
          <SectionTitle icon="touch_app">Interações</SectionTitle>

          {/* mb-6 alinhado ao mesmo wrapper usado por Respostas/Desempenho
              dos destaques/Avaliações dos destaques — única divergência
              encontrada na auditoria de padronização (era a única tabela
              sem a margem inferior consistente com as demais). */}
          <div className="w-full max-w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden mb-6">

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
                      title={`A tabela mostra a página ${pagInter} de ${totalPagInter}; os KPIs usam todas as interações do período.`}
                    >
                      info
                    </span>
                  )}
                </span>
                {temFiltroEvento && (
                  <span className="text-label-md text-outline">
                    · {data.eventos_total.toLocaleString('pt-BR')} {data.eventos_total === 1 ? 'filtrada' : 'filtradas'} no universo filtrado
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
                  options={blocos.opcoesTipoEvento}
                  onChange={v => setFiltroEvento(v as typeof filtroEvento)}
                />
                {blocos.filtroDestaque && desempenhoDestaques.length > 0 && (
                  <FiltroSelect
                    label="Destaque"
                    value={filtroDestaque}
                    options={[
                      { value: '', label: 'Todos' },
                      ...desempenhoDestaques.map(item => ({ value: item.destaque_item_id, label: item.titulo })),
                    ]}
                    onChange={setFiltroDestaque}
                  />
                )}
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
                {blocos.indicadoresInteracoes.map(ind => (
                  <IndicadorFiltro key={ind.key} label={ind.label} value={valoresIndicadoresInteracoes[ind.key]} />
                ))}
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
                        {[
                          'Tipo', 'Data/Hora',
                          ...(blocos.filtroDestaque ? ['Destaque'] : []),
                          'Usuário', 'Perfil', 'Cliente', 'Unidade', 'Estado',
                        ].map(h => (
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
                        const destaqueTitulo = e.destaque_item_id ? destaqueTituloPorId.get(e.destaque_item_id) : undefined
                        return (
                          <tr key={e.id} className="hover:bg-surface-container-low/50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              <EventoBadge tipo={e.tipo_evento} />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap align-middle">
                              <CellText value={formatDateTime(e.criado_em)} />
                            </td>
                            {blocos.filtroDestaque && (
                              <td className="px-4 py-3 whitespace-nowrap align-middle max-w-[160px]">
                                <span className={`text-[13px] truncate block ${destaqueTitulo ? 'text-on-surface' : 'text-outline italic'}`} title={destaqueTitulo}>
                                  {destaqueTitulo ?? NI}
                                </span>
                              </td>
                            )}
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
                    <InteracaoCard
                      key={e.id}
                      e={e}
                      destaqueTitulo={e.destaque_item_id ? destaqueTituloPorId.get(e.destaque_item_id) : undefined}
                    />
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
          </div>
        </>
      )}
    </section>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type SerieImpressaoDashboard = DashboardData['serie_impressao']
type AtividadeSemanaDashboard = DashboardData['atividade_semana']

function formatarDataCurta(data: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
    .format(new Date(`${data}T12:00:00`))
    .replace('.', '')
}

function formatarDataGrafico(data: string) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })
    .format(new Date(`${data}T12:00:00`))
    .replace('.', '')
}

function ImpressionChart({ serie, serieAnterior, mediaDiaria, titulo = 'Impressões da campanha' }: {
  serie: SerieImpressaoDashboard
  serieAnterior: SerieImpressaoDashboard
  mediaDiaria: number
  titulo?: string
}) {
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null)
  const [comparacaoVisivel, setComparacaoVisivel] = useState(true)
  const graficoRef = useRef<SVGSVGElement>(null)
  const largura = 840
  const altura = 300
  const margem = { esquerda: 46, direita: 18, topo: 26, base: 36 }
  const serieComparativa = comparacaoVisivel ? serieAnterior : []
  const maximo = Math.max(1, ...serie.map(p => p.visualizacoes), ...serieComparativa.map(p => p.visualizacoes))
  const teto = Math.max(10, Math.ceil(maximo / 10) * 10)
  const x = (indice: number, total: number) => margem.esquerda + (total <= 1 ? (largura - margem.esquerda - margem.direita) / 2 : indice * (largura - margem.esquerda - margem.direita) / (total - 1))
  const y = (valor: number) => margem.topo + (teto - valor) * (altura - margem.topo - margem.base) / teto
  const pontos = serie.map((p, indice) => `${x(indice, serie.length)},${y(p.visualizacoes)}`).join(' ')
  const pontosAnteriores = serieComparativa.map((p, indice) => `${x(indice, serieComparativa.length)},${y(p.visualizacoes)}`).join(' ')
  const area = serie.length > 1 ? `M ${x(0, serie.length)} ${y(serie[0].visualizacoes)} ${serie.map((p, indice) => `L ${x(indice, serie.length)} ${y(p.visualizacoes)}`).join(' ')} L ${x(serie.length - 1, serie.length)} ${altura - margem.base} L ${x(0, serie.length)} ${altura - margem.base} Z` : ''
  const pico = serie.reduce<{ indice: number; data: string; visualizacoes: number } | null>((atual, ponto, indice) => !atual || ponto.visualizacoes > atual.visualizacoes ? { indice, ...ponto } : atual, null)
  const linhas = [0, Math.round(teto / 3), Math.round(teto * 2 / 3), teto]
  const quantidadeDatas = serie.length <= 7 ? serie.length : serie.length <= 14 ? 7 : serie.length <= 31 ? 6 : 5
  const indicesDatas = [...new Set(Array.from(
    { length: quantidadeDatas },
    (_, indice) => Math.round(indice * (serie.length - 1) / Math.max(1, quantidadeDatas - 1)),
  ))]
  const pontoAtivo = indiceAtivo === null ? null : serie[indiceAtivo]
  const pontoAnterior = indiceAtivo === null ? null : serieAnterior[indiceAtivo]
  const totalAtual = serie.reduce((total, ponto) => total + ponto.visualizacoes, 0)

  const selecionarPonto = (clientX: number) => {
    const rect = graficoRef.current?.getBoundingClientRect()
    if (!rect) return
    const coordenadaSvg = (clientX - rect.left) * largura / rect.width
    const posicao = Math.min(1, Math.max(0, (coordenadaSvg - margem.esquerda) / (largura - margem.esquerda - margem.direita)))
    setIndiceAtivo(Math.round(posicao * (serie.length - 1)))
  }

  const navegarPontos = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    setIndiceAtivo(atual => {
      if (event.key === 'Home') return 0
      if (event.key === 'End') return serie.length - 1
      const indice = atual ?? serie.length - 1
      return Math.min(serie.length - 1, Math.max(0, indice + (event.key === 'ArrowLeft' ? -1 : 1)))
    })
  }

  const diferencaAtiva = pontoAtivo && pontoAnterior
    ? pontoAtivo.visualizacoes - pontoAnterior.visualizacoes
    : null

  return (
    <article className="rounded-[22px] border border-[#e7ebf2] bg-white p-5 shadow-sm sm:p-[22px]">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-[16px] font-extrabold tracking-[-0.015em] text-[#101828]">{titulo}</h3><p className="mt-1 text-[12px] font-semibold text-[#98a2b3]">Passe pelo gráfico para explorar cada dia</p></div>
        <div className="flex flex-wrap items-center gap-3.5 text-[11px] font-bold text-[#667085]">
          <span className="inline-flex items-center gap-2"><i className="h-[3px] w-4 rounded bg-primary" />Período atual</span>
          {serieAnterior.length > 0 && (
            <button
              type="button"
              onClick={() => setComparacaoVisivel(visivel => !visivel)}
              aria-pressed={comparacaoVisivel}
              className={`inline-flex items-center gap-2 rounded-lg px-2 py-1 transition-colors ${comparacaoVisivel ? 'bg-[#f2f4f7] text-[#475467]' : 'text-[#98a2b3] hover:bg-[#f8fafc]'}`}
              title={`${comparacaoVisivel ? 'Ocultar' : 'Mostrar'} período anterior`}
            >
              <i className={`w-4 border-t-2 border-dashed ${comparacaoVisivel ? 'border-[#98a2b3]' : 'border-[#d0d5dd]'}`} />
              Período anterior
              <span className="material-symbols-outlined text-[14px]">{comparacaoVisivel ? 'visibility' : 'visibility_off'}</span>
            </button>
          )}
        </div>
      </div>
      {serie.length === 0 ? <EmptySection icon="show_chart" title="Sem impressões ainda" message="O gráfico aparecerá quando a campanha for visualizada." /> : <>
        <div
          className="relative h-[280px] touch-pan-y overflow-hidden rounded-2xl border border-[#f0f2f6] bg-gradient-to-b from-[#fbfcff] to-white p-2 outline-none ring-primary/30 transition-shadow focus:ring-2 sm:h-[330px]"
          tabIndex={0}
          aria-label="Gráfico diário de impressões. Use as setas esquerda e direita para navegar entre os dias."
          onFocus={() => setIndiceAtivo(atual => atual ?? serie.length - 1)}
          onBlur={() => setIndiceAtivo(null)}
          onKeyDown={navegarPontos}
          onPointerMove={event => selecionarPonto(event.clientX)}
          onPointerDown={event => selecionarPonto(event.clientX)}
          onPointerLeave={() => setIndiceAtivo(null)}
        >
          <svg ref={graficoRef} viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Gráfico de impressões">
            <defs><linearGradient id="campaign-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0064e0" stopOpacity=".18" /><stop offset="100%" stopColor="#0064e0" stopOpacity="0" /></linearGradient></defs>
            {linhas.map(valor => <g key={valor}><line x1={margem.esquerda} y1={y(valor)} x2={largura - margem.direita} y2={y(valor)} stroke="#e9edf3" /><text x="8" y={y(valor) + 4} fill="#98a2b3" fontSize="11" fontWeight="600">{valor}</text></g>)}
            {indicesDatas.map((indice, posicao) => <text key={serie[indice].data} x={x(indice, serie.length)} y={altura - 10} fill="#98a2b3" fontSize="11" fontWeight="600" textAnchor={posicao === 0 ? 'start' : posicao === indicesDatas.length - 1 ? 'end' : 'middle'}>{formatarDataCurta(serie[indice].data)}</text>)}
            {pontosAnteriores && <polyline points={pontosAnteriores} fill="none" stroke="#cfd5df" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {area && <path d={area} fill="url(#campaign-area-fill)" />}
            <polyline points={pontos} fill="none" stroke="#0064e0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {pontoAtivo && <>
              <line x1={x(indiceAtivo!, serie.length)} y1={margem.topo} x2={x(indiceAtivo!, serie.length)} y2={altura - margem.base} stroke="#98a2b3" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
              {comparacaoVisivel && pontoAnterior && <circle cx={x(indiceAtivo!, serie.length)} cy={y(pontoAnterior.visualizacoes)} r="4" fill="white" stroke="#98a2b3" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
              <circle cx={x(indiceAtivo!, serie.length)} cy={y(pontoAtivo.visualizacoes)} r="6" fill="white" stroke="#0064e0" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </>}
          </svg>
          {pontoAtivo && (
            <div
              className="pointer-events-none absolute z-10 w-[172px] rounded-xl border border-[#e7ebf2] bg-[#101828] p-3 text-white shadow-xl"
              style={{
                left: `clamp(94px, ${(x(indiceAtivo!, serie.length) / largura) * 100}%, calc(100% - 94px))`,
                top: `clamp(82px, ${(y(pontoAtivo.visualizacoes) / altura) * 100}%, calc(100% - 18px))`,
                transform: 'translate(-50%, -100%) translateY(-12px)',
              }}
            >
              <p className="text-[12px] font-medium leading-4 text-[#d0d5dd]">{formatarDataGrafico(pontoAtivo.data)}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <span className="text-[11px] font-semibold text-[#98a2b3]">Impressões</span>
                <strong className="text-[22px] leading-none">{pontoAtivo.visualizacoes.toLocaleString('pt-BR')}</strong>
              </div>
              {comparacaoVisivel && pontoAnterior && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] font-semibold">
                  <span className="text-[#98a2b3]">Período anterior</span>
                  <span>{pontoAnterior.visualizacoes.toLocaleString('pt-BR')}</span>
                </div>
              )}
              {comparacaoVisivel && diferencaAtiva !== null && (
                <p className={`mt-1 text-right text-[11px] font-bold ${diferencaAtiva >= 0 ? 'text-[#6ce9a6]' : 'text-[#fda29b]'}`}>
                  {diferencaAtiva >= 0 ? '+' : ''}{diferencaAtiva.toLocaleString('pt-BR')} vs. período anterior
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-[#f8fafc] px-3.5 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[.05em] text-[#98a2b3]">Total no período</p><p className="mt-1 text-[16px] font-extrabold text-[#344054]">{totalAtual.toLocaleString('pt-BR')}</p></div>
          <div className="rounded-xl bg-[#f8fafc] px-3.5 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[.05em] text-[#98a2b3]">Média diária</p><p className="mt-1 text-[16px] font-extrabold text-[#344054]">{mediaDiaria.toLocaleString('pt-BR')}</p></div>
          <div className="rounded-xl bg-[#f8fafc] px-3.5 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[.05em] text-[#98a2b3]">Melhor dia</p><p className="mt-1 truncate text-[16px] font-extrabold text-[#344054]">{pico ? `${pico.visualizacoes.toLocaleString('pt-BR')} · ${formatarDataCurta(pico.data)}` : '—'}</p></div>
        </div>
      </>}
    </article>
  )
}

function EngagementFunnel({ visualizacoes, respostas, cliques, taxaResposta, taxaClique }: { visualizacoes: number; respostas: number; cliques: number; taxaResposta: number; taxaClique: number }) {
  const etapas = [
    { icon: 'visibility', nome: 'Impressões', valor: visualizacoes, badge: 'Base total', cor: '#0064e0', fundo: '#f8fafc', descricao: 'Total de vezes que a campanha foi visualizada pelos usuários no período selecionado.', largura: 100 },
    { icon: 'forum', nome: 'Respostas', valor: respostas, badge: `${taxaResposta.toLocaleString('pt-BR')}%`, cor: '#7a5af8', fundo: '#f4f0ff', descricao: 'Usuários que enviaram uma nota ou feedback depois de visualizar a campanha.', largura: taxaResposta },
    { icon: 'ads_click', nome: 'Cliques CTA', valor: cliques, badge: `${taxaClique.toLocaleString('pt-BR')}%`, cor: '#12b76a', fundo: '#ecfdf3', descricao: 'Ação paralela: cliques no botão configurado, sem depender do envio de resposta.', largura: taxaClique },
  ]
  return (
    <article className="overflow-hidden rounded-[22px] border border-[#e7ebf2] bg-white shadow-sm">
      <div className="px-[22px] pt-[22px]"><h3 className="text-[16px] font-extrabold tracking-[-0.015em] text-[#101828]">Funil de engajamento</h3><p className="mt-1 text-[12px] font-semibold text-[#98a2b3]">Fluxo principal e ações da campanha</p></div>
      <div className="relative m-[22px] mt-[18px] overflow-hidden rounded-3xl border border-[#e7ebf2]">
        <div className="relative h-[76px] bg-gradient-to-r from-[#0064e0] via-[#4e8efc] to-[#7a5af8] after:absolute after:-bottom-7 after:-left-[5%] after:-right-[5%] after:h-[72px] after:rounded-t-[60%] after:bg-white after:content-['']" />
        <div className="relative z-[2] grid grid-cols-1 md:grid-cols-3">
          {etapas.map((etapa, indice) => <div key={etapa.nome} className={`flex min-h-[214px] flex-col p-[22px] ${indice < etapas.length - 1 ? 'border-b border-[#e7ebf2] md:border-b-0 md:border-r' : ''}`}>
            <span className="mb-3.5 grid h-[42px] w-[42px] place-items-center rounded-xl border border-[#e7ebf2]" style={{ color: etapa.cor, backgroundColor: etapa.fundo }}><span className="material-symbols-outlined text-[18px]">{etapa.icon}</span></span>
            <span className="mb-2.5 text-[12px] font-extrabold text-[#475467]">{etapa.nome}</span>
            <div className="mb-2.5 flex flex-wrap items-end gap-2.5"><strong className="text-[36px] leading-none tracking-[-0.05em] text-[#101828] sm:text-[40px]">{etapa.valor.toLocaleString('pt-BR')}</strong><span className="rounded-[10px] px-2 py-1 text-[12px] font-extrabold" style={{ color: etapa.cor, backgroundColor: etapa.fundo }}>{etapa.badge}</span></div>
            <p className="mb-4 text-[13px] font-semibold leading-[1.55] text-[#667085]">{etapa.descricao}</p>
            <div className="mt-auto h-2 overflow-hidden rounded-full bg-[#eef2f6]"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(etapa.valor > 0 ? 4 : 0, etapa.largura))}%`, backgroundColor: etapa.cor }} /></div>
          </div>)}
        </div>
      </div>
    </article>
  )
}

function ActivityPanel({ atividade, maiorDia, total, percentualMaiorDia, nomesDias }: { atividade: AtividadeSemanaDashboard; maiorDia: { dia: number; visualizacoes: number } | null; total: number; percentualMaiorDia: number; nomesDias: string[] }) {
  const maximo = Math.max(1, ...atividade.map(item => item.visualizacoes))
  const nomesDiasCompletos = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
  return <article className="rounded-[22px] border border-[#e7ebf2] bg-white p-[22px] shadow-sm"><h3 className="text-[16px] font-extrabold tracking-[-0.015em] text-[#101828]">Dias mais ativos</h3><p className="mt-1 text-[12px] font-semibold text-[#98a2b3]">Visualizações por dia da semana</p>
    {total === 0 ? <EmptySection icon="bar_chart" title="Sem dados de atividade" message="Os dias mais ativos aparecerão com as primeiras visualizações." /> : <><div className="mt-4 flex h-[178px] items-end gap-2 border-b border-[#e7ebf2] px-1 pb-1.5">{atividade.map(item => { const ativo = maiorDia?.dia === item.dia; return <div key={item.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-extrabold text-[#344054]">{item.visualizacoes}</span><div className={`w-full max-w-[42px] rounded-t-[10px] ${ativo ? 'bg-gradient-to-b from-[#4e8efc] to-[#0064e0] shadow-[0_8px_22px_rgba(11,111,251,.16)]' : 'bg-[#edf1f6]'}`} style={{ height: `${Math.max(8, Math.round(item.visualizacoes / maximo * 100))}%` }} /><span className={`text-[11px] font-bold ${ativo ? 'text-primary' : 'text-[#98a2b3]'}`}>{nomesDias[item.dia]}</span></div>})}</div><div className="mt-4 flex items-center gap-4 rounded-2xl bg-[#f8fafc] px-4 py-3.5"><strong className="shrink-0 text-[32px] leading-none tracking-[-0.04em] text-[#101828]">{percentualMaiorDia.toLocaleString('pt-BR')}%</strong><div className="border-l border-[#e7ebf2] pl-4"><p className="text-[11px] font-extrabold uppercase tracking-[.04em] text-[#98a2b3]">Maior concentração</p><p className="mt-1 text-[12px] font-semibold leading-[1.45] text-[#667085]">das visualizações aconteceram na <strong className="text-[#344054]">{maiorDia ? nomesDiasCompletos[maiorDia.dia] : '—'}</strong>.</p></div></div></>}
  </article>
}

function NpsExecutive({ score, media, detratores, percentualDetratores, quotes }: { score: number; media: number | null; detratores: number; percentualDetratores: number; quotes: Feedback[] }) {
  const zona = npsZona(score)
  const itens = [{ rotulo: 'Zona atual', valor: `${score > 0 ? '+' : ''}${score}`, texto: `A campanha está em ${zona.nome.toLowerCase()}.` }, { rotulo: 'Nota média', valor: media === null ? '—' : media.toFixed(1), texto: 'Média geral das respostas recebidas.' }, { rotulo: 'Ponto de atenção', valor: detratores.toLocaleString('pt-BR'), texto: `${percentualDetratores}% das respostas vieram de detratores.` }]
  return <article className="rounded-[22px] border border-[#e7ebf2] bg-white p-[22px] shadow-sm"><h3 className="text-[16px] font-extrabold tracking-[-0.015em] text-[#101828]">Leitura do NPS</h3><p className="mt-1 text-[12px] font-semibold text-[#98a2b3]">Resumo executivo das notas</p><div className="mt-2.5 grid gap-3">{itens.map(item => <div key={item.rotulo} className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7ebf2] bg-[#fbfcfe] p-[15px]"><div><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#667085]">{item.rotulo}</p><p className="text-[12px] font-semibold leading-[1.45] text-[#98a2b3]">{item.texto}</p></div><strong className="shrink-0 text-[24px] tracking-[-0.04em] text-[#101828]">{item.valor}</strong></div>)}</div><div className="mt-4 border-t border-[#e7ebf2] pt-4"><p className="mb-3 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#667085]">Sinais qualitativos</p>{quotes.length === 0 ? <p className="text-[12px] font-semibold text-[#98a2b3]">Ainda não há comentários no período.</p> : <div className="grid gap-2.5">{quotes.map(item => <div key={item.id} className="rounded-xl border border-[#e7ebf2] bg-[#fbfcfe] px-3 py-2.5 text-[12px] font-semibold leading-[1.45] text-[#475467]"><strong className={`mb-1 block text-[10px] uppercase tracking-[.04em] ${npsLabel(item.nota) === 'Promotor' ? 'text-tertiary' : 'text-error'}`}>{npsLabel(item.nota)} · nota {item.nota}</strong>“{item.observacao}”</div>)}</div>}</div></article>
}

function NpsDeepDive({ score, promotores, neutros, detratores, pctProm, pctNeut, pctDetr, distribuicao, maxDist, notaMaisFrequente }: { score: number; promotores: number; neutros: number; detratores: number; pctProm: number; pctNeut: number; pctDetr: number; distribuicao: Record<string, number>; maxDist: number; notaMaisFrequente: { nota: number; total: number } }) {
  return <article className="mb-6 rounded-[22px] border border-[#e7ebf2] bg-white p-[22px] shadow-sm"><div className="mb-[18px]"><h3 className="text-[16px] font-extrabold tracking-[-0.015em] text-[#101828]">Distribuição e leitura das notas</h3><p className="mt-1 text-[12px] font-semibold text-[#98a2b3]">Detalhamento para entender melhor a qualidade das respostas do NPS</p></div><div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[300px_minmax(0,1fr)_300px]">
    <div className="h-full rounded-[18px] border border-[#e7ebf2] bg-[#fbfcfe] p-[18px]"><div className="mx-auto h-[112px] w-[190px] overflow-hidden"><div className="relative h-[190px] w-[190px] rounded-full" style={{ background: 'conic-gradient(from 270deg, #f04438 0deg 52deg, #ffb74a 52deg 91deg, #42c77a 91deg 180deg, #edf1f6 180deg 360deg)' }}><div className="absolute left-[26px] top-[26px] h-[138px] w-[138px] rounded-full bg-[#fbfcfe]" /><div className="absolute bottom-[78px] left-1/2 z-10 -translate-x-1/2 text-center"><strong className="text-[31px] tracking-[-0.04em] text-[#101828]">{score > 0 ? '+' : ''}{score}</strong><p className="text-[11px] font-bold text-[#98a2b3]">NPS atual</p></div></div></div><div className="mt-4">{[["#12b76a", 'Promotores', promotores, pctProm], ["#ffb74a", 'Neutros', neutros, pctNeut], ["#f04438", 'Detratores', detratores, pctDetr]].map(([cor, label, total, pct]) => <div key={String(label)} className="flex items-center justify-between border-b border-[#e7ebf2] py-2.5 text-[12px] font-bold text-[#475467] last:border-0"><span><i className="mr-2 inline-block h-[9px] w-[9px] rounded-full" style={{ backgroundColor: String(cor) }} />{label}</span><strong className="text-[14px] text-[#101828]">{total} · {pct}%</strong></div>)}</div></div>
    <div className="min-w-0 rounded-[18px] border border-[#e7ebf2] bg-white p-[18px]"><p className="mb-3.5 text-[12px] font-extrabold text-[#475467]">Distribuição das notas (0 a 10)</p><div className="overflow-x-auto"><div className="grid h-[220px] min-w-[460px] grid-cols-11 items-end gap-2">{Array.from({ length: 11 }, (_, nota) => { const total = distribuicao[String(nota)] ?? 0; return <div key={nota} className="flex min-w-0 flex-col items-center justify-end gap-2"><span className="text-[10px] font-extrabold text-[#475467]">{total}</span><div className={`w-full max-w-[42px] rounded-t-[10px] ${notaColor(nota)}`} style={{ height: `${Math.max(8, Math.round(total / maxDist * 150))}px` }} /><span className="text-[10px] font-bold text-[#98a2b3]">{nota}</span></div>})}</div></div></div>
    <div className="grid gap-3"><div className="rounded-[18px] border border-[#e7ebf2] bg-[#fbfcfe] p-4"><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#667085]">Maior concentração</p><strong className="text-[26px] tracking-[-0.04em] text-[#101828]">Nota {notaMaisFrequente.nota}</strong><p className="mt-1.5 text-[12px] font-semibold leading-[1.5] text-[#667085]">{notaMaisFrequente.total} respostas estão nessa nota, a maior concentração do período.</p></div><div className="rounded-[18px] border border-[#e7ebf2] bg-[#fbfcfe] p-4"><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#667085]">Risco atual</p><strong className="text-[26px] tracking-[-0.04em] text-[#101828]">{pctDetr}%</strong><p className="mt-1.5 text-[12px] font-semibold leading-[1.5] text-[#667085]">O percentual de detratores é o principal ponto de atenção desta campanha.</p></div></div>
  </div></article>
}

function taxaDestaque(valor: number, visualizacoes: number) {
  return visualizacoes > 0 ? Math.round(valor / visualizacoes * 1000) / 10 : 0
}

function UtilidadeBar({ sim, nao, compacta = false }: { sim: number; nao: number; compacta?: boolean }) {
  const total = sim + nao
  const percentualSim = total > 0 ? sim / total * 100 : 0
  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full bg-[#eef2f6] ${compacta ? 'h-1.5' : 'h-2.5'}`} aria-label={`${sim} respostas Sim e ${nao} respostas Não`}>
        <span className="bg-[#12b76a] transition-[width] duration-300" style={{ width: `${percentualSim}%` }} />
        <span className="bg-[#f97066] transition-[width] duration-300" style={{ width: `${100 - percentualSim}%` }} />
      </div>
      <div className={`flex items-center justify-between font-bold ${compacta ? 'mt-1.5 text-[10px]' : 'mt-2.5 text-[11px]'}`}>
        <span className="inline-flex items-center gap-1.5 text-[#027a48]"><i className="h-2 w-2 rounded-full bg-[#12b76a]" />Sim {sim.toLocaleString('pt-BR')}</span>
        <span className="inline-flex items-center gap-1.5 text-[#b42318]"><i className="h-2 w-2 rounded-full bg-[#f97066]" />Não {nao.toLocaleString('pt-BR')}</span>
      </div>
    </div>
  )
}

function DestaquePerformanceCard({ item, liderUtilidade }: { item: DesempenhoDestaqueItem; liderUtilidade: boolean }) {
  const metricas = [
    { rotulo: 'Interações', valor: item.interacoes, unicos: item.interacoes_unicas, taxa: taxaDestaque(item.interacoes, item.visualizacoes), cor: 'text-[#6941c6]', fundo: 'bg-[#f4f0ff]' },
    { rotulo: 'Cliques CTA', valor: item.cliques_cta, unicos: item.cliques_cta_unicos, taxa: taxaDestaque(item.cliques_cta, item.visualizacoes), cor: 'text-[#027a48]', fundo: 'bg-[#ecfdf3]' },
    { rotulo: 'Dispensas', valor: item.dispensas, unicos: item.dispensas_unicas, taxa: taxaDestaque(item.dispensas, item.visualizacoes), cor: 'text-[#b42318]', fundo: 'bg-[#fff1f0]' },
  ]

  return (
    <article className={`flex min-w-0 flex-col rounded-[22px] border bg-white p-5 shadow-sm transition-colors ${item.ativo ? 'border-[#e7ebf2] hover:border-primary/30' : 'border-[#e7ebf2] opacity-75'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-[15px] font-extrabold text-[#101828]" title={item.titulo}>{item.titulo}</h4>
            {!item.ativo && <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#667085]">Removido</span>}
            {liderUtilidade && <span className="rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#027a48]">Maior % útil</span>}
          </div>
          <p className="mt-1 text-[11px] font-semibold text-[#98a2b3]">Desempenho no período selecionado</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><span className="material-symbols-outlined text-[18px]">new_releases</span></span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 border-b border-[#e7ebf2] pb-4">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.05em] text-[#98a2b3]">Visualizações</p><strong className="mt-1 block text-[32px] leading-none tracking-[-0.04em] text-[#101828]">{item.visualizacoes.toLocaleString('pt-BR')}</strong></div>
        <div className="text-right"><p className="text-[10px] font-extrabold uppercase tracking-[.05em] text-[#98a2b3]">Usuários únicos</p><strong className="mt-1 block text-[20px] text-[#344054]">{item.visualizacoes_unicas.toLocaleString('pt-BR')}</strong></div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {metricas.map(metrica => (
          <div key={metrica.rotulo} className={`min-w-0 rounded-2xl p-3 ${metrica.fundo}`}>
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[.03em] text-[#667085]" title={metrica.rotulo}>{metrica.rotulo}</p>
            <div className="mt-2 flex items-end gap-1.5"><strong className={`text-[20px] leading-none ${metrica.cor}`}>{metrica.valor.toLocaleString('pt-BR')}</strong><span className={`text-[10px] font-extrabold ${metrica.cor}`}>{metrica.taxa.toLocaleString('pt-BR')}%</span></div>
            <p className="mt-1.5 truncate text-[10px] font-semibold text-[#98a2b3]">{metrica.unicos.toLocaleString('pt-BR')} únicos</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-[#e7ebf2] bg-[#fbfcfe] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-extrabold text-[#475467]">Este destaque foi útil?</p><p className="mt-0.5 text-[10px] font-semibold text-[#98a2b3]">{item.avaliacoes.toLocaleString('pt-BR')} {item.avaliacoes === 1 ? 'resposta' : 'respostas'}</p></div>
          <strong className={`text-[22px] tracking-[-0.03em] ${item.percentual_util === null ? 'text-[#98a2b3]' : 'text-[#027a48]'}`}>{item.percentual_util === null ? '—' : `${item.percentual_util.toLocaleString('pt-BR')}%`}</strong>
        </div>
        {item.avaliacoes > 0 ? <UtilidadeBar sim={item.sim} nao={item.nao} /> : <p className="rounded-xl bg-white px-3 py-2 text-center text-[11px] font-semibold text-[#98a2b3]">Aguardando avaliações de utilidade</p>}
      </div>
    </article>
  )
}

function SectionTitle({ icon, tooltip, children }: { icon: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-2">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{icon}</span>
      <h3 className="text-label-md font-bold text-on-surface-variant uppercase tracking-wider">{children}</h3>
      {tooltip && (
        <TooltipIconButton
          label={tooltip}
          ariaLabel="Ajuda"
          className="flex items-center justify-center text-outline/50 hover:text-outline"
          tooltipClassName="w-max max-w-[280px] whitespace-pre-line text-left"
        >
          <span className="material-symbols-outlined text-[13px]">info</span>
        </TooltipIconButton>
      )}
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
  const [pos, setPos] = useState<{ top: number; left: number | null; right: number | null } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Menu é portalado pra <body> (ver render) pra escapar do overflow-hidden
    // do card — por isso o clique-fora precisa checar os DOIS refs (gatilho +
    // menu), já que o menu não é mais descendente do gatilho no DOM.
    const atualizarPosicao = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      // Perto da borda direita da viewport: alinha o menu pela direita (ele
      // cresce pra esquerda) em vez de deixar vazar pra fora da tela.
      const alinharDireita = rect.left > window.innerWidth / 2
      setPos({
        top: rect.bottom + 4,
        left: alinharDireita ? null : rect.left,
        right: alinharDireita ? window.innerWidth - rect.right : null,
      })
    }
    atualizarPosicao()
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', atualizarPosicao, true)
    window.addEventListener('resize', atualizarPosicao)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', atualizarPosicao, true)
      window.removeEventListener('resize', atualizarPosicao)
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
      </div>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left ?? undefined, right: pos.right ?? undefined }}
          className="z-50 min-w-max max-w-[min(320px,calc(100vw-16px))] rounded-xl border border-outline-variant bg-surface-bright shadow-lg overflow-hidden"
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full flex items-center justify-between gap-4 px-3 py-2 text-[13px] text-left transition-colors ${
                value === o.value
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <span className="whitespace-normal break-words">{o.label}</span>
              {value === o.value && (
                <span className="material-symbols-outlined text-[13px] shrink-0">check</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
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
function InteracaoCard({ e, destaqueTitulo }: { e: EventoCampanha; destaqueTitulo?: string }) {
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
        {destaqueTitulo && (
          <div className="min-w-0 col-span-2">
            <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Destaque</p>
            <span className="text-[13px] block truncate text-on-surface" title={destaqueTitulo}>{destaqueTitulo}</span>
          </div>
        )}
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

// Card de avaliação de utilidade pra telas mobile (< md) — mesma lógica de
// substituição da tabela que InteracaoCard já usa acima.
function AvaliacaoDestaqueCard({ a, destaqueTitulo, destaqueRemovido }: {
  a: AvaliacaoDestaqueItem
  destaqueTitulo?: string
  destaqueRemovido?: boolean
}) {
  const c = (a.contexto ?? {}) as Record<string, string>
  const nome = a.usuario_nome || c.usuario_nome || a.usuario_id
  const email = a.usuario_email || c.usuario_email
  const unidade = c.unidade_nome || c.clinica_nome
  const comentario = a.observacao?.trim() || NI
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <UtilBadge util={a.util} />
        <span className="text-[11px] text-outline shrink-0">{formatDateTime(a.criado_em)}</span>
      </div>

      <div className="mt-3 pt-3 border-t border-outline-variant/20 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div className="min-w-0 col-span-2">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Destaque</p>
          <div className="flex items-center gap-2">
            <span className={`text-[13px] truncate ${destaqueTitulo ? 'text-on-surface' : 'text-outline italic'}`} title={destaqueTitulo}>
              {destaqueTitulo ?? NI}
            </span>
            {destaqueRemovido && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-outline-variant/30 text-outline">
                Removido
              </span>
            )}
          </div>
        </div>
        <div className="min-w-0 col-span-2">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Comentário</p>
          <ObservacaoCell value={comentario} />
        </div>
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

// Card de "Cliques CTA por conteúdo" pra telas mobile (< md) — mesma lógica de
// substituição da tabela que InteracaoCard/AvaliacaoDestaqueCard já usam acima.
function ConteudoCliquesCard({ item }: { item: DesempenhoConteudoItem }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-outline shrink-0">#{item.ordem}</span>
        <span className="text-[13px] truncate text-on-surface" title={item.titulo}>{item.titulo}</span>
        {!item.tem_cta && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-outline-variant/30 text-outline">
            Sem CTA
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-outline-variant/20 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Cliques CTA</p>
          <span className={`text-[13px] block ${item.tem_cta ? 'text-on-surface' : 'text-outline'}`}>
            {item.tem_cta ? item.cliques_cta.toLocaleString('pt-BR') : '—'}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">Cliques únicos</p>
          <span className={`text-[13px] block ${item.tem_cta ? 'text-on-surface' : 'text-outline'}`}>
            {item.tem_cta ? item.cliques_cta_unicos.toLocaleString('pt-BR') : '—'}
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

// Avaliação de utilidade do destaque — util nulo só existiria por dado
// inconsistente (validarAvaliacaoFeedback no backend sempre exige boolean
// pra tipo_avaliacao='utilidade_destaque'), mas o tipo aceita null por
// segurança; trata como "Não informado" em vez de quebrar.
function UtilBadge({ util }: { util: boolean | null }) {
  if (util === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-tertiary/10 text-tertiary">
        <span className="material-symbols-outlined text-[12px]">thumb_up</span>
        Sim
      </span>
    )
  }
  if (util === false) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-error/10 text-error">
        <span className="material-symbols-outlined text-[12px]">thumb_down</span>
        Não
      </span>
    )
  }
  return <CellText value={NI} />
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
  if (tipo === 'interacao_badge') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-tertiary/10 text-tertiary">
        <span className="material-symbols-outlined text-[12px]">touch_app</span>
        Interação
      </span>
    )
  }
  if (tipo === 'dispensa') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-outline-variant/30 text-outline">
        <span className="material-symbols-outlined text-[12px]">close</span>
        Dispensa
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
  trend?: number | null
  tooltip?: string; subTooltip?: string; subExtra?: React.ReactNode
}

function KpiCard({ icon, iconColor, iconBg, label, value, sub, large, trend, tooltip, subTooltip, subExtra }: KpiCardProps) {
  return (
    <div className="min-h-[146px] min-w-0 rounded-[22px] border border-[#e7ebf2] bg-white p-5 shadow-sm transition-colors hover:border-primary/30">
      <div className="mb-3.5 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1 truncate text-[13px] font-bold text-[#475467]">
            {label}
            {tooltip && (
              <span className="material-symbols-outlined text-[13px] text-outline/50 cursor-help shrink-0" title={tooltip}>
                info
              </span>
            )}
          </p>
          <div className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl border border-current/10 ${iconBg}`}>
            <span className={`material-symbols-outlined ${iconColor} text-[19px]`}>{icon}</span>
          </div>
      </div>
          <p className={`truncate font-bold leading-none tracking-[-0.045em] text-[#101828] ${large ? 'text-[31px]' : 'text-[33px]'}`}>
            {value}
            {trend !== null && trend !== undefined && (
              <span className={`ml-2 inline-flex -translate-y-0.5 items-center rounded-full px-[7px] py-1 align-middle text-[11px] font-extrabold ${trend >= 0 ? 'bg-[#ecfdf3] text-[#12b76a]' : 'bg-[#fff1f0] text-[#f04438]'}`} title="Variação em relação ao período anterior">
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
              </span>
            )}
          </p>
          <p className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-[#98a2b3]">
            {sub}
            {subTooltip && (
              <span className="material-symbols-outlined text-[13px] text-outline/50 cursor-help shrink-0" title={subTooltip}>
                info
              </span>
            )}
          </p>
          {subExtra && <div className="mt-1.5">{subExtra}</div>}
    </div>
  )
}
