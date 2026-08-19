import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, del, post, put } from '../../services/api'
import type { Campanha, StatusCampanha } from '../../types'
import { getStatus, rotaEditarCampanha } from '../../utils/campanha'
import { useAuth } from '../../hooks/useAuth'
import { podeGerenciarModulo } from '../../utils/permissions'
import { limiteTrial } from '../../utils/limiteTrial'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TooltipIconButton } from '../../components/ui/TooltipIconButton'
import { CampanhaQuickView } from './CampanhaQuickView'

const PER_PAGE = 10

type SortKey = 'campanha' | 'categoria' | 'tipo' | 'sistema' | 'status' | 'respostas'
type SortDirection = 'asc' | 'desc'
type ColumnKey = SortKey | 'acoes'
type FiltroStatus = 'todas' | StatusCampanha
type FiltroRespostas = 'todas' | 'com' | 'sem'
const FILTRO_STATUS_PADRAO: FiltroStatus = 'ativa'

const TIPOS = ['comunicado', 'melhoria', 'pesquisa']
const CATEGORIAS = ['Novidade', 'Melhoria', 'Treinamento', 'Pesquisa', 'Comunicado', 'Obrigatório']
const STATUS_FILTRO: Array<{ value: FiltroStatus; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'rascunho', label: 'Rascunhos' },
  { value: 'ativa', label: 'Ativas' },
  { value: 'inativa', label: 'Inativas' },
  { value: 'agendada', label: 'Agendadas' },
  { value: 'encerrada', label: 'Encerradas' },
]

const TABLE_COLUMNS: Array<{ label: string; key: ColumnKey; sortKey: SortKey | null }> = [
  { label: 'Campanha', key: 'campanha', sortKey: 'campanha' },
  { label: 'Categoria', key: 'categoria', sortKey: 'categoria' },
  { label: 'Tipo', key: 'tipo', sortKey: 'tipo' },
  { label: 'Sistema / Tela', key: 'sistema', sortKey: 'sistema' },
  { label: 'Status', key: 'status', sortKey: 'status' },
  { label: 'Respostas', key: 'respostas', sortKey: 'respostas' },
  { label: 'Ações', key: 'acoes', sortKey: null },
]

const COLUNAS_INICIAIS: Record<ColumnKey, boolean> = {
  campanha: true,
  categoria: true,
  tipo: true,
  sistema: true,
  status: true,
  respostas: true,
  acoes: true,
}

const COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

// 'agendada'/'encerrada' NUNCA são status persistido (só existem
// RASCUNHO/ATIVA/INATIVA no backend, ver CampanhaStatus em types.ts) — são
// uma leitura de período por cima de uma campanha ATIVA (ver getStatus em
// pages/campanhas2/campanhaForm.ts). O label deixa isso explícito ("Ativa ·
// Agendada"/"Ativa · Encerrada") pra nunca parecer um 4º/5º status ao lado
// de Rascunho/Ativa/Inativa.
const STATUS_BADGE: Record<StatusCampanha, { label: string; color: string; dot: string }> = {
  rascunho:  { label: 'Rascunho',          color: 'text-secondary', dot: 'bg-secondary' },
  ativa:     { label: 'Ativa',             color: 'text-tertiary',  dot: 'bg-tertiary' },
  inativa:   { label: 'Inativa',           color: 'text-error',     dot: 'bg-error' },
  agendada:  { label: 'Ativa · Agendada',  color: 'text-primary',   dot: 'bg-primary' },
  encerrada: { label: 'Ativa · Encerrada', color: 'text-outline',   dot: 'bg-outline' },
}

function StatusInline({ status }: { status: StatusCampanha }) {
  const st = STATUS_BADGE[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-label-md font-bold ${st.color}`}>
      <span className={`h-2 w-2 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  )
}

function valorOrdenacao(c: Campanha, key: SortKey): string | number {
  switch (key) {
    case 'campanha': return c.titulo
    case 'categoria': return c.categoria ?? ''
    case 'tipo': return c.tipo
    case 'sistema': return `${c.sistema} ${c.tela}`
    case 'status': return STATUS_BADGE[getStatus(c)].label
    case 'respostas': return c._count?.feedbacks ?? 0
  }
}

function compararCampanhas(a: Campanha, b: Campanha, key: SortKey, direction: SortDirection): number {
  const valorA = valorOrdenacao(a, key)
  const valorB = valorOrdenacao(b, key)
  const resultado = typeof valorA === 'number' && typeof valorB === 'number'
    ? valorA - valorB
    : COLLATOR.compare(String(valorA), String(valorB))
  return direction === 'asc' ? resultado : -resultado
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-3xl border border-outline-variant bg-surface px-6 py-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
        <p className="text-label-md font-bold text-on-surface-variant">{label}</p>
      </div>
      <p className="mt-3 text-headline-md font-semibold leading-none text-on-surface">{value}</p>
    </div>
  )
}


function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-on-surface px-2.5 py-1.5 text-[11px] font-semibold text-surface shadow-panel transition-opacity duration-100 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {label}
      </span>
    </span>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label-md font-bold text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-full rounded-full border border-[#ced0d4] bg-surface-bright px-3 text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#ced0d4] bg-white px-2.5 py-1 text-label-md font-bold text-on-surface">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remover filtro ${label}`} className="rounded-full p-0.5 transition-colors hover:text-error">
        <span className="material-symbols-outlined text-[14px] leading-none">close</span>
      </button>
    </span>
  )
}

// Card de campanha para telas mobile (< md) — substitui a linha da tabela,
// que fica ilegível e com ações apertadas em telas estreitas.
function CampanhaCard({
  c, status, active, duplicating, navigate, onOpen, onDuplicar, onInativar, onAtivar, onEncerrar, podeEscrever,
}: {
  c: Campanha
  status: StatusCampanha
  active: boolean
  duplicating: boolean
  navigate: ReturnType<typeof useNavigate>
  onOpen: (c: Campanha) => void
  onDuplicar: (c: Campanha) => void
  onInativar: (id: string) => void
  onAtivar: (id: string) => void
  onEncerrar: (id: string) => void
  podeEscrever: boolean
}) {
  const actionBtn = 'flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl active:scale-95 transition-all'
  return (
    <div
      onClick={() => onOpen(c)}
      className={`p-4 cursor-pointer transition-colors ${c.status !== 'ATIVA' ? 'opacity-60' : ''} ${
        active ? 'bg-primary-fixed/60' : 'hover:bg-surface-container-low/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-body-md font-bold text-on-surface truncate">{c.titulo}</p>
          {(c.prioridade ?? 0) > 0 && (
            <Tooltip label={`Prioridade ${c.prioridade}`}>
              <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border border-primary/20 bg-primary/5 px-1.5 text-[10px] font-bold leading-none text-primary">
                <span className="material-symbols-outlined text-[11px] leading-none">arrow_upward</span>
                {c.prioridade}
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <TypeBadge tipo={c.tipo} />
        {c.categoria && (
          <CategoryBadge categoria={c.categoria} />
        )}
      </div>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-outline-variant/20 text-[12px]">
        <StatusInline status={status} />
        <span className="inline-flex items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">forum</span>
          {(c._count?.feedbacks ?? 0).toLocaleString('pt-BR')}
        </span>
      </div>

      <div onClick={e => e.stopPropagation()} className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-outline-variant/20 [&>button]:flex-1 [&>button]:min-w-[64px]">
        <button
          onClick={() => navigate(`/campanhas/${c.id}/preview`)}
          aria-label={`Abrir preview de ${c.titulo}`}
          className={`${actionBtn} text-on-surface-variant hover:text-primary hover:bg-primary-fixed`}
        >
          <span className="material-symbols-outlined text-[20px]">visibility</span>
          <span className="text-[9px] font-semibold leading-none">Preview</span>
        </button>
        <button
          onClick={() => navigate(`/campanhas/${c.id}/dashboard`)}
          aria-label={`Abrir dashboard de ${c.titulo}`}
          className={`${actionBtn} text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed`}
        >
          <span className="material-symbols-outlined text-[20px]">query_stats</span>
          <span className="text-[9px] font-semibold leading-none">Métricas</span>
        </button>
        {podeEscrever && (
          <button
            onClick={() => navigate(rotaEditarCampanha(c))}
            aria-label={`Editar ${c.titulo}`}
            className={`${actionBtn} text-on-surface-variant hover:text-primary hover:bg-surface-container-high`}
          >
            <span className="material-symbols-outlined text-[20px]">edit</span>
            <span className="text-[9px] font-semibold leading-none">Editar</span>
          </button>
        )}
        {podeEscrever && (
          <button
            onClick={() => onDuplicar(c)}
            disabled={duplicating}
            aria-label={`Duplicar ${c.titulo}`}
            className={`${actionBtn} text-on-surface-variant hover:text-primary hover:bg-surface-container-high disabled:opacity-40`}
          >
            <span className={`material-symbols-outlined text-[20px] ${duplicating ? 'animate-spin' : ''}`}>{duplicating ? 'progress_activity' : 'content_copy'}</span>
            <span className="text-[9px] font-semibold leading-none">Duplicar</span>
          </button>
        )}
        {podeEscrever && (
          c.status === 'RASCUNHO' ? (
            <button
              onClick={() => onAtivar(c.id)}
              aria-label={`Publicar ${c.titulo}`}
              className={`${actionBtn} text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10`}
            >
              <span className="material-symbols-outlined text-[20px]">publish</span>
              <span className="text-[9px] font-semibold leading-none">Publicar</span>
            </button>
          ) : c.status === 'ATIVA' ? (
            <>
              <button
                onClick={() => onInativar(c.id)}
                aria-label={`Desativar ${c.titulo}`}
                className={`${actionBtn} text-on-surface-variant hover:text-error hover:bg-error-container`}
              >
                <span className="material-symbols-outlined text-[20px]">block</span>
                <span className="text-[9px] font-semibold leading-none">Desativar</span>
              </button>
              {status !== 'encerrada' && (
                <button
                  onClick={() => onEncerrar(c.id)}
                  aria-label={`Encerrar ${c.titulo}`}
                  className={`${actionBtn} text-on-surface-variant hover:text-outline hover:bg-surface-container-high`}
                >
                  <span className="material-symbols-outlined text-[20px]">event_busy</span>
                  <span className="text-[9px] font-semibold leading-none">Encerrar</span>
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => onAtivar(c.id)}
              aria-label={`Reativar ${c.titulo}`}
              className={`${actionBtn} text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10`}
            >
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span className="text-[9px] font-semibold leading-none">Reativar</span>
            </button>
          )
        )}
      </div>
    </div>
  )
}

export function CampanhasIndex() {
  const { user } = useAuth()
  // Fase 4 de permissões personalizadas (ver utils/permissions.ts) — VIEWER/
  // NENHUM só lê; esconder os botões aqui é só UX, o backend já bloqueia 403.
  const podeEscrever = podeGerenciarModulo(user, 'CAMPANHAS')
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [quickView, setQuickView] = useState<Campanha | null>(null)
  const [campanhaInativar, setCampanhaInativar] = useState<Campanha | null>(null)
  const [inativandoId, setInativandoId] = useState<string | null>(null)
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null)
  const [campanhaEncerrar, setCampanhaEncerrar] = useState<Campanha | null>(null)
  const [encerrandoId, setEncerrandoId] = useState<string | null>(null)
  const [erroEncerramento, setErroEncerramento] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [buscaNome, setBuscaNome] = useState('')
  const [colunasAberto, setColunasAberto] = useState(false)
  const [colunasVisiveis, setColunasVisiveis] = useState(COLUNAS_INICIAIS)
  const [filtrosAberto, setFiltrosAberto] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>(FILTRO_STATUS_PADRAO)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroSistema, setFiltroSistema] = useState('')
  const [filtroRespostas, setFiltroRespostas] = useState<FiltroRespostas>('todas')
  const colunasRef = useRef<HTMLDivElement | null>(null)
  const filtrosRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    if (!colunasAberto) return
    const onMouseDown = (e: MouseEvent) => {
      if (colunasRef.current && !colunasRef.current.contains(e.target as Node)) setColunasAberto(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColunasAberto(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [colunasAberto])

  useEffect(() => {
    if (!filtrosAberto) return
    const onMouseDown = (e: MouseEvent) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target as Node)) setFiltrosAberto(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltrosAberto(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filtrosAberto])

  const termoBusca = buscaNome.trim().toLowerCase()
  const sistemas = [...new Set(campanhas.map(c => c.sistema).filter(Boolean))]
  const campanhasFiltradas = campanhas.filter(c => {
    if (termoBusca && !c.titulo.toLowerCase().includes(termoBusca)) return false
    if (filtroStatus !== 'todas' && getStatus(c) !== filtroStatus) return false
    if (filtroTipo && c.tipo !== filtroTipo) return false
    if (filtroCategoria && c.categoria !== filtroCategoria) return false
    if (filtroSistema && c.sistema !== filtroSistema) return false
    if (filtroRespostas === 'com' && (c._count?.feedbacks ?? 0) === 0) return false
    if (filtroRespostas === 'sem' && (c._count?.feedbacks ?? 0) > 0) return false
    return true
  })
  const campanhasOrdenadas = sort
    ? [...campanhasFiltradas].sort((a, b) => compararCampanhas(a, b, sort.key, sort.direction))
    : campanhasFiltradas
  const paginated = campanhasOrdenadas.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalRespostas = campanhas.reduce((total, c) => total + (c._count?.feedbacks ?? 0), 0)
  const mediaRespostas = campanhas.length > 0 ? totalRespostas / campanhas.length : 0
  const totalAtivas = campanhas.filter(c => getStatus(c) === 'ativa').length
  // Fase 6E — campanhas.length já é o TOTAL cadastrado do tenant (GET
  // /campanhas não filtra por status — RASCUNHO/ATIVA/INATIVA todas voltam,
  // ver server/src/controllers/campanhas.ts listar()) — reaproveitado
  // direto, sem endpoint novo.
  const limiteCampanhas = limiteTrial(user?.tenant.plano, user?.tenant.plano?.limite_campanhas_ativas, campanhas.length, 'campanha')
  const totalColunasSelecionadas = TABLE_COLUMNS.filter(col => colunasVisiveis[col.key]).length
  const totalFiltrosAtivos = [
    filtroStatus !== 'todas',
    Boolean(filtroTipo),
    Boolean(filtroCategoria),
    Boolean(filtroSistema),
    filtroRespostas !== 'todas',
  ].filter(Boolean).length

  const ordenarPor = (key: SortKey) => {
    setSort(prev => {
      if (prev?.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { key, direction: 'asc' }
    })
    setPage(1)
  }

  const abrirBusca = () => {
    setBuscaAberta(true)
    setColunasAberto(false)
  }

  const limparBusca = () => {
    setBuscaNome('')
    setBuscaAberta(false)
    setPage(1)
  }

  const alternarColuna = (key: ColumnKey) => {
    if (key === 'campanha') return
    setColunasVisiveis(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const mostrarTodasColunas = () => {
    setColunasVisiveis(COLUNAS_INICIAIS)
  }

  const limparFiltros = () => {
    setFiltroStatus('todas')
    setFiltroTipo('')
    setFiltroCategoria('')
    setFiltroSistema('')
    setFiltroRespostas('todas')
    setPage(1)
  }

  const duplicarCampanha = async (c: Campanha) => {
    if (duplicandoId) return
    setDuplicandoId(c.id)
    try {
      const copia = await post<Campanha>(`/campanhas/${c.id}/duplicar`, {})
      setCampanhas(prev => [{ ...copia, _count: copia._count ?? { feedbacks: 0 } }, ...prev])
      navigate(rotaEditarCampanha(copia))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Não foi possível duplicar a campanha. Tente novamente.')
    } finally {
      setDuplicandoId(null)
    }
  }

  const solicitarInativacao = (id: string) => {
    const campanha = campanhas.find(c => c.id === id)
    if (campanha) {
      setErroConfirmacao(null)
      setCampanhaInativar(campanha)
    }
  }

  const confirmarInativacao = async () => {
    if (!campanhaInativar) return
    const id = campanhaInativar.id
    setInativandoId(id)
    setErroConfirmacao(null)
    try {
      await del(`/campanhas/${id}`)
      setCampanhas(prev => prev.map(c => c.id === id ? { ...c, status: 'INATIVA' } : c))
      if (quickView?.id === id) setQuickView(prev => prev ? { ...prev, status: 'INATIVA' } : null)
      setCampanhaInativar(null)
    } catch (e) {
      setErroConfirmacao(e instanceof Error ? e.message : 'Erro ao desativar campanha. Tente novamente.')
    } finally {
      setInativandoId(null)
    }
  }

  // Publicar (RASCUNHO -> ATIVA) e Reativar (INATIVA -> ATIVA) são a mesma
  // chamada — o backend decide se a transição é válida (ver
  // validarTransicaoStatusCampanha em server/src/controllers/campanhas.ts);
  // o botão certo já é escolhido por status na renderização abaixo.
  const handleAtivar = async (id: string) => {
    try {
      // Mesmo cuidado de handleToggle: PUT não devolve _count, então precisa
      // preservar o _count.feedbacks já carregado em vez de aceitar a
      // resposta como o objeto completo.
      const atual = campanhas.find(x => x.id === id)
      const updated = await put<Campanha>(`/campanhas/${id}`, { status: 'ATIVA' })
      const merged: Campanha = atual ? { ...atual, ...updated, _count: atual._count } : updated
      setCampanhas(prev => prev.map(x => (x.id === id ? merged : x)))
      if (quickView?.id === id) setQuickView(merged)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao ativar campanha.')
    }
  }

  // Encerrar (Fase 2) — ação própria, endpoint dedicado (nunca reaproveita
  // DELETE/handleAtivar). Só disponível pra ATIVA ainda não encerrada (botão
  // já filtra isso na renderização); o backend valida de novo e devolve a
  // campanha com data_fim atualizado (ver encerrar() em
  // server/src/controllers/campanhas.ts).
  const solicitarEncerramento = (id: string) => {
    const campanha = campanhas.find(c => c.id === id)
    if (campanha) {
      setErroEncerramento(null)
      setCampanhaEncerrar(campanha)
    }
  }

  const confirmarEncerramento = async () => {
    if (!campanhaEncerrar) return
    const id = campanhaEncerrar.id
    setEncerrandoId(id)
    setErroEncerramento(null)
    try {
      const atual = campanhas.find(x => x.id === id)
      const atualizada = await post<Campanha>(`/campanhas/${id}/encerrar`, {})
      const merged: Campanha = atual ? { ...atual, ...atualizada, _count: atual._count } : atualizada
      setCampanhas(prev => prev.map(c => (c.id === id ? merged : c)))
      if (quickView?.id === id) setQuickView(merged)
      setCampanhaEncerrar(null)
    } catch (e) {
      setErroEncerramento(e instanceof Error ? e.message : 'Erro ao encerrar campanha. Tente novamente.')
    } finally {
      setEncerrandoId(null)
    }
  }

  return (
    <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
      {/* Listagem — tabela no desktop/tablet largo, cards no mobile */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-visible">
        <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Campanhas</h3>
            </div>
          </div>
          {podeEscrever && (
            <Button
              onClick={() => {
                // Fase 6E — trial no limite: nem navega pro formulário, só
                // avisa (mesma mensagem do backend). Continua permitido
                // editar/desativar/excluir campanhas existentes — só a
                // criação de uma nova é impedida aqui.
                if (limiteCampanhas.atingido) { alert(limiteCampanhas.mensagem!); return }
                navigate('/campanhas/nova')
              }}
              variant="gradient"
              size="lg"
              className="shrink-0"
              iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
            >
              Nova Campanha
            </Button>
          )}
        </div>

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-5 border-b border-outline-variant/30 bg-surface-container-low/30">
            <MetricCard label="Total de campanhas" value={campanhas.length.toLocaleString('pt-BR')} icon="campaign" />
            <MetricCard label="Campanhas ativas" value={totalAtivas.toLocaleString('pt-BR')} icon="play_circle" />
            <MetricCard label="Total de respostas" value={totalRespostas.toLocaleString('pt-BR')} icon="forum" />
            <MetricCard label="Média por campanha" value={mediaRespostas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} icon="analytics" />
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-3 px-5 py-3 border-b border-outline-variant/30 bg-surface-container-lowest md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-label-md font-bold uppercase tracking-wide text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary">list_alt</span>
                Localizadas
              </p>
              <p className="text-label-md text-outline">
                {campanhasFiltradas.length.toLocaleString('pt-BR')} de {campanhas.length.toLocaleString('pt-BR')} campanha{campanhas.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex items-center gap-2 md:justify-end">
              {buscaAberta ? (
                <div className="relative w-full min-w-[220px] md:w-80">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
                  <input
                    autoFocus
                    value={buscaNome}
                    onChange={e => { setBuscaNome(e.target.value); setPage(1) }}
                    placeholder="Filtrar por nome..."
                    className="h-9 w-full rounded-xl border border-outline-variant bg-surface-bright pl-9 pr-9 text-body-md focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={limparBusca}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-outline transition-colors hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              ) : buscaNome ? (
                <button
                  type="button"
                  onClick={abrirBusca}
                  className="inline-flex h-9 max-w-[260px] items-center gap-2 rounded-xl border border-outline-variant bg-surface-bright px-3 text-label-md font-bold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">search</span>
                  <span className="truncate">{buscaNome}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={abrirBusca}
                  aria-label="Buscar campanha"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant bg-surface-bright text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[20px]">search</span>
                </button>
              )}

              <div className="relative" ref={colunasRef}>
                <button
                  type="button"
                  onClick={() => { setColunasAberto(v => !v); setBuscaAberta(false) }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-outline-variant bg-surface-bright px-3 text-label-md font-bold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">view_column</span>
                  Colunas
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{totalColunasSelecionadas}</span>
                </button>
                {colunasAberto && (
                  <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
                    <div className="border-b border-outline-variant/30 px-4 py-3">
                      <p className="text-label-md font-bold text-on-surface">Colunas visíveis</p>
                    </div>
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={mostrarTodasColunas}
                        className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-body-md font-bold text-primary transition-colors hover:bg-primary-fixed"
                      >
                        Mostrar todas
                        <span className="material-symbols-outlined text-[16px]">select_all</span>
                      </button>
                      {TABLE_COLUMNS.map(col => (
                        <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-body-md text-on-surface transition-colors hover:bg-surface-container-low">
                          <input
                            type="checkbox"
                            checked={colunasVisiveis[col.key]}
                            disabled={col.key === 'campanha'}
                            onChange={() => alternarColuna(col.key)}
                            className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                          />
                          <span className={col.key === 'campanha' ? 'text-on-surface-variant' : ''}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={filtrosRef}>
                <button
                  type="button"
                  onClick={() => { setFiltrosAberto(v => !v); setColunasAberto(false); setBuscaAberta(false) }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-outline-variant bg-surface-bright px-3 text-label-md font-bold text-on-surface transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">filter_list</span>
                  Filtros
                  {totalFiltrosAtivos > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{totalFiltrosAtivos}</span>
                  )}
                </button>
                {filtrosAberto && (
                  <div className="absolute right-0 z-[80] mt-2 max-h-[min(32rem,calc(100vh-8rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-3">
                      <p className="text-label-md font-bold text-on-surface">Filtrar campanhas</p>
                      {totalFiltrosAtivos > 0 && (
                        <button type="button" onClick={limparFiltros} className="text-label-md font-bold text-primary hover:underline">
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 p-4">
                      <FilterSelect
                        label="Status"
                        value={filtroStatus}
                        options={STATUS_FILTRO}
                        onChange={value => { setFiltroStatus(value as FiltroStatus); setPage(1) }}
                      />
                      <FilterSelect
                        label="Tipo"
                        value={filtroTipo}
                        options={[
                          { value: '', label: 'Todos os tipos' },
                          ...TIPOS.map(tipo => ({ value: tipo, label: tipo.charAt(0).toUpperCase() + tipo.slice(1) })),
                        ]}
                        onChange={value => { setFiltroTipo(value); setPage(1) }}
                      />
                      <FilterSelect
                        label="Categoria"
                        value={filtroCategoria}
                        options={[
                          { value: '', label: 'Todas as categorias' },
                          ...CATEGORIAS.map(categoria => ({ value: categoria, label: categoria })),
                        ]}
                        onChange={value => { setFiltroCategoria(value); setPage(1) }}
                      />
                      <FilterSelect
                        label="Sistema"
                        value={filtroSistema}
                        options={[
                          { value: '', label: 'Todos os sistemas' },
                          ...sistemas.map(sistema => ({ value: sistema, label: sistema })),
                        ]}
                        onChange={value => { setFiltroSistema(value); setPage(1) }}
                      />
                      <FilterSelect
                        label="Respostas"
                        value={filtroRespostas}
                        options={[
                          { value: 'todas', label: 'Todas' },
                          { value: 'com', label: 'Com respostas' },
                          { value: 'sem', label: 'Sem respostas' },
                        ]}
                        onChange={value => { setFiltroRespostas(value as FiltroRespostas); setPage(1) }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && totalFiltrosAtivos > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-outline-variant/30 bg-surface-container-low/30">
            {filtroStatus !== 'todas' && (
              <FilterChip label={STATUS_FILTRO.find(s => s.value === filtroStatus)?.label ?? filtroStatus} onRemove={() => { setFiltroStatus('todas'); setPage(1) }} />
            )}
            {filtroTipo && (
              <FilterChip label={filtroTipo.charAt(0).toUpperCase() + filtroTipo.slice(1)} onRemove={() => { setFiltroTipo(''); setPage(1) }} />
            )}
            {filtroCategoria && (
              <FilterChip label={filtroCategoria} onRemove={() => { setFiltroCategoria(''); setPage(1) }} />
            )}
            {filtroSistema && (
              <FilterChip label={filtroSistema} onRemove={() => { setFiltroSistema(''); setPage(1) }} />
            )}
            {filtroRespostas !== 'todas' && (
              <FilterChip label={filtroRespostas === 'com' ? 'Com respostas' : 'Sem respostas'} onRemove={() => { setFiltroRespostas('todas'); setPage(1) }} />
            )}
            <button type="button" onClick={limparFiltros} className="ml-auto text-label-md font-bold text-on-surface-variant transition-colors hover:text-error">
              Limpar filtros
            </button>
          </div>
        )}

        <div className="min-h-[420px]">
          {loading && <LoadingSpinner />}
          {error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && paginated.length === 0 && (
            <EmptyState
              icon="campaign"
              title={campanhas.length === 0 ? 'Nenhuma campanha ainda' : 'Nenhuma campanha encontrada'}
              description={campanhas.length === 0 ? 'Crie sua primeira campanha para começar.' : 'Ajuste a busca para ver outras campanhas.'}
              action={
                campanhas.length === 0 && podeEscrever ? (
                  <Button
                    onClick={() => navigate('/campanhas/nova')}
                    variant="gradient"
                    size="md"
                  >
                    Nova Campanha
                  </Button>
                ) : undefined
              }
            />
          )}

          {!loading && !error && paginated.length > 0 && (
            <>
            {/* Desktop/tablet largo (>= md): tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50 border-b border-outline-variant/40">
                    {TABLE_COLUMNS.filter(col => colunasVisiveis[col.key]).map(col => {
                      const active = sort?.key === col.sortKey
                      const align = col.label === 'Ações' ? ' text-right' : col.label === 'Categoria' || col.label === 'Status' || col.label === 'Tipo' || col.label === 'Respostas' ? ' text-center' : ''
                      const visibility = `${col.label === 'Categoria' ? ' hidden md:table-cell' : ''}${col.label === 'Tipo' ? ' hidden md:table-cell' : ''}${col.label === 'Sistema / Tela' ? ' hidden lg:table-cell' : ''}${col.label === 'Respostas' ? ' hidden sm:table-cell' : ''}`
                      return (
                        <th
                          key={col.label}
                          aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                          className={`px-4 py-3 text-[11px] text-on-surface-variant font-bold uppercase tracking-wide whitespace-nowrap${align}${visibility}`}
                        >
                          {col.sortKey ? (
                            <button
                              type="button"
                              onClick={() => ordenarPor(col.sortKey!)}
                              className={`inline-flex items-center gap-1 rounded-lg transition-colors hover:text-primary ${
                                align.includes('center') ? 'justify-center' : ''
                              }`}
                            >
                              {col.label}
                              <span className={`material-symbols-outlined text-[14px] leading-none transition-opacity ${active ? 'opacity-100' : 'opacity-35'}`}>
                                {active && sort.direction === 'desc' ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                              </span>
                            </button>
                          ) : col.label}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {paginated.map(c => {
                      const status = getStatus(c)
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setQuickView(c)}
                          className={`group cursor-pointer transition-colors ${c.status !== 'ATIVA' ? 'opacity-60' : ''} ${
                            quickView?.id === c.id
                              ? 'bg-primary-fixed/60'
                              : 'hover:bg-surface-container-low/60'
                          }`}
                        >
                          {colunasVisiveis.campanha && (
                            <td className="px-4 py-4 align-middle max-w-[320px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="text-body-md font-bold text-on-surface truncate">{c.titulo}</p>
                                {(c.prioridade ?? 0) > 0 && (
                                  <Tooltip label={`Prioridade ${c.prioridade}`}>
                                    <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border border-primary/20 bg-primary/5 px-1.5 text-[10px] font-bold leading-none text-primary">
                                      <span className="material-symbols-outlined text-[11px] leading-none">arrow_upward</span>
                                      {c.prioridade}
                                    </span>
                                  </Tooltip>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {(c.segmentar_cliente_ids?.length > 0 || c.segmentar_unidade_ids?.length > 0 ||
                                  c.segmentar_perfis?.length > 0 || c.segmentar_usuario_tipos?.length > 0 ||
                                  c.segmentar_estados?.length > 0) && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary/10 text-secondary" title="Segmentação ativa">
                                    <span className="material-symbols-outlined text-[10px]">target</span>
                                    Segmentada
                                  </span>
                                )}
                                {(c.politica_reexibicao || 'uma_vez_apos_visualizacao') === 'ate_responder_ou_confirmar' && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary" title="Até responder/confirmar">
                                    <span className="material-symbols-outlined text-[10px]">repeat</span>
                                    Até responder
                                  </span>
                                )}
                                {(c.politica_reexibicao || 'uma_vez_apos_visualizacao') === 'reexibir_apos_dias' && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-tertiary/10 text-tertiary" title={`Reexibe após ${c.reexibir_apos_dias ?? '?'} dias`}>
                                    <span className="material-symbols-outlined text-[10px]">schedule</span>
                                    Reexibe em {c.reexibir_apos_dias ?? '?'}d
                                  </span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Categoria */}
                          {colunasVisiveis.categoria && (
                            <td className="px-4 py-4 align-middle text-center whitespace-nowrap hidden md:table-cell">
                              {c.categoria ? (
                                <CategoryBadge categoria={c.categoria} />
                              ) : (
                                <span className="text-label-md text-outline">—</span>
                              )}
                            </td>
                          )}

                          {/* Tipo */}
                          {colunasVisiveis.tipo && (
                            <td className="px-4 py-4 align-middle text-center whitespace-nowrap hidden md:table-cell">
                              <TypeBadge tipo={c.tipo} />
                            </td>
                          )}

                          {/* Sistema / Tela */}
                          {colunasVisiveis.sistema && (
                            <td className="px-4 py-4 align-middle hidden lg:table-cell">
                              <p className="text-body-md text-on-surface">{c.sistema}</p>
                              <p className="text-[12px] text-on-surface-variant">{c.tela}</p>
                            </td>
                          )}

                          {/* Status */}
                          {colunasVisiveis.status && (
                            <td className="px-4 py-4 align-middle text-center">
                              <StatusInline status={status} />
                            </td>
                          )}

                          {/* Respostas */}
                          {colunasVisiveis.respostas && (
                            <td className="px-4 py-4 align-middle text-body-md font-bold text-center hidden sm:table-cell">
                              {(c._count?.feedbacks ?? 0).toLocaleString('pt-BR')}
                            </td>
                          )}

                          {/* Ações */}
                          {colunasVisiveis.acoes && (
                            <td className="px-4 py-4 align-middle text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                              <TooltipIconButton
                                label="Preview"
                                onClick={() => navigate(`/campanhas/${c.id}/preview`)}
                                ariaLabel={`Abrir preview de ${c.titulo}`}
                                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-fixed rounded-full transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </TooltipIconButton>
                              <TooltipIconButton
                                label="Ver dashboard"
                                onClick={() => navigate(`/campanhas/${c.id}/dashboard`)}
                                ariaLabel={`Abrir dashboard de ${c.titulo}`}
                                className="p-2 text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed rounded-full transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">query_stats</span>
                              </TooltipIconButton>
                              {podeEscrever && (
                                <TooltipIconButton
                                  label="Editar"
                                  onClick={() => navigate(rotaEditarCampanha(c))}
                                  ariaLabel={`Editar ${c.titulo}`}
                                  className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </TooltipIconButton>
                              )}
                              {podeEscrever && (
                                <TooltipIconButton
                                  label="Duplicar"
                                  onClick={() => duplicarCampanha(c)}
                                  ariaLabel={`Duplicar ${c.titulo}`}
                                  className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
                                >
                                  <span className={`material-symbols-outlined text-[18px] ${duplicandoId === c.id ? 'animate-spin' : ''}`}>
                                    {duplicandoId === c.id ? 'progress_activity' : 'content_copy'}
                                  </span>
                                </TooltipIconButton>
                              )}
                              {podeEscrever && (
                                c.status === 'RASCUNHO' ? (
                                  <TooltipIconButton
                                    label="Publicar"
                                    onClick={() => handleAtivar(c.id)}
                                    ariaLabel={`Publicar ${c.titulo}`}
                                    className="p-2 text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-full transition-all"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">publish</span>
                                  </TooltipIconButton>
                                ) : c.status === 'ATIVA' ? (
                                  <>
                                    <TooltipIconButton
                                      label="Desativar"
                                      onClick={() => solicitarInativacao(c.id)}
                                      ariaLabel={`Desativar ${c.titulo}`}
                                      className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-full transition-all"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">block</span>
                                    </TooltipIconButton>
                                    {status !== 'encerrada' && (
                                      <TooltipIconButton
                                        label="Encerrar"
                                        onClick={() => solicitarEncerramento(c.id)}
                                        ariaLabel={`Encerrar ${c.titulo}`}
                                        className="p-2 text-on-surface-variant hover:text-outline hover:bg-surface-container-high rounded-full transition-all"
                                      >
                                        <span className="material-symbols-outlined text-[18px]">event_busy</span>
                                      </TooltipIconButton>
                                    )}
                                  </>
                                ) : (
                                  <TooltipIconButton
                                    label="Reativar"
                                    onClick={() => handleAtivar(c.id)}
                                    ariaLabel={`Reativar ${c.titulo}`}
                                    className="p-2 text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-full transition-all"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                  </TooltipIconButton>
                                )
                              )}
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {/* Mobile (< md): cards */}
            <div className="md:hidden divide-y divide-outline-variant/20">
              {paginated.map(c => {
                const status = getStatus(c)
                return (
                  <CampanhaCard
                    key={c.id}
                    c={c}
                    status={status}
                    active={quickView?.id === c.id}
                    duplicating={duplicandoId === c.id}
                    navigate={navigate}
                    onOpen={setQuickView}
                    onDuplicar={duplicarCampanha}
                    onInativar={solicitarInativacao}
                    onAtivar={handleAtivar}
                    onEncerrar={solicitarEncerramento}
                    podeEscrever={podeEscrever}
                  />
                )
              })}
            </div>

              <Pagination page={page} total={campanhasFiltradas.length} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {/* Quick View Drawer */}
      {quickView && (
        <CampanhaQuickView
          campanha={quickView}
          onClose={() => setQuickView(null)}
        />
      )}

      {campanhaInativar && (
        <ConfirmDialog
          title={`Desativar "${campanhaInativar.titulo}"?`}
          description="Ela deixará de ser exibida para os usuários, mas o histórico de respostas será preservado."
          confirmLabel="Desativar campanha"
          variant="danger"
          loading={inativandoId === campanhaInativar.id}
          erro={erroConfirmacao}
          onConfirm={confirmarInativacao}
          onCancel={() => { setCampanhaInativar(null); setErroConfirmacao(null) }}
        />
      )}

      {campanhaEncerrar && (
        <ConfirmDialog
          title={`Encerrar "${campanhaEncerrar.titulo}"?`}
          description="A vigência termina agora — ela para de ser exibida para os usuários, mas continua ATIVA (diferente de desativar) e o histórico de respostas é preservado."
          confirmLabel="Encerrar campanha"
          variant="danger"
          loading={encerrandoId === campanhaEncerrar.id}
          erro={erroEncerramento}
          onConfirm={confirmarEncerramento}
          onCancel={() => { setCampanhaEncerrar(null); setErroEncerramento(null) }}
        />
      )}
    </section>
  )
}
