import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { get, del, put } from '../../services/api'
import type { Campanha, StatusCampanha } from '../../types'
import { getStatus, formatDateTime, gerarEmbed } from '../../utils/campanha'
import { TypeBadge } from '../../components/ui/TypeBadge'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { CampanhaQuickView } from './CampanhaQuickView'

const PER_PAGE = 10
const TIPOS = ['comunicado', 'melhoria', 'pesquisa']
const STATUS_OPTIONS = ['ativa', 'inativa', 'agendada', 'encerrada']
const CATEGORIAS = ['Novidade', 'Melhoria', 'Treinamento', 'Pesquisa', 'Comunicado', 'Obrigatório']

// Versão discreta do StatusBadge — ponto + texto em vez de pill preenchida,
// pra não competir visualmente com o ToggleSwitch (mesma info, apresentação mais leve).
const STATUS_DOT: Record<StatusCampanha, { label: string; dot: string; text: string }> = {
  ativa:     { label: 'Ativa',     dot: 'bg-tertiary', text: 'text-tertiary' },
  inativa:   { label: 'Inativa',   dot: 'bg-outline',  text: 'text-outline' },
  agendada:  { label: 'Agendada',  dot: 'bg-primary',  text: 'text-primary' },
  encerrada: { label: 'Encerrada', dot: 'bg-outline',  text: 'text-outline' },
}

function KpiCard({
  label, shortLabel, icon, iconBg, iconColor, value,
}: {
  label: string
  shortLabel: string
  icon: string
  iconBg: string
  iconColor: string
  value: string | number
}) {
  return (
    <div className="min-w-0 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-3.5 sm:p-5 flex items-center gap-2.5 sm:gap-4">
      <span className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        <span className="material-symbols-outlined text-[18px] sm:text-[24px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-title-lg sm:text-headline-md font-bold text-on-surface leading-none truncate">{value}</p>
        <p className="text-label-md font-semibold text-on-surface-variant mt-1.5 truncate">
          <span className="lg:hidden">{shortLabel}</span>
          <span className="hidden lg:inline">{label}</span>
        </p>
      </div>
    </div>
  )
}

// Card de campanha para telas mobile (< md) — substitui a linha da tabela,
// que fica ilegível e com ações apertadas em telas estreitas.
function CampanhaCard({
  c, st, active, copied, navigate, onOpen, onToggle, onCopyEmbed, onInativar, onReativar,
}: {
  c: Campanha
  st: { label: string; dot: string; text: string }
  active: boolean
  copied: boolean
  navigate: ReturnType<typeof useNavigate>
  onOpen: (c: Campanha) => void
  onToggle: (c: Campanha) => void
  onCopyEmbed: (c: Campanha) => void
  onInativar: (id: string) => void
  onReativar: (id: string) => void
}) {
  const actionBtn = 'flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl active:scale-95 transition-all'
  return (
    <div
      onClick={() => onOpen(c)}
      className={`p-4 cursor-pointer transition-colors ${!c.ativo ? 'opacity-60' : ''} ${
        active ? 'bg-primary-fixed/60' : 'hover:bg-surface-container-low/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-md font-bold text-on-surface truncate">{c.titulo}</p>
          {c.subtitulo && (
            <p className="text-[12px] text-on-surface-variant line-clamp-2 mt-0.5">{c.subtitulo}</p>
          )}
        </div>
        <div onClick={e => e.stopPropagation()} className="shrink-0 mt-0.5">
          <ToggleSwitch checked={c.ativo} onChange={() => onToggle(c)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <TypeBadge tipo={c.tipo} />
        {c.categoria && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-secondary/10 text-secondary">
            {c.categoria}
          </span>
        )}
        {(c.prioridade ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary" title="Prioridade">
            <span className="material-symbols-outlined text-[10px]">arrow_upward</span>
            {c.prioridade}
          </span>
        )}
      </div>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-outline-variant/20 text-[12px]">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${st.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
          {st.label}
        </span>
        <span className="inline-flex items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">forum</span>
          {(c._count?.feedbacks ?? 0).toLocaleString('pt-BR')}
        </span>
        <span className="ml-auto text-[11px] text-outline">Criada em {formatDateTime(c.criado_em)}</span>
      </div>

      <div onClick={e => e.stopPropagation()} className="grid grid-cols-5 gap-1 mt-3 pt-3 border-t border-outline-variant/20">
        <button
          onClick={() => navigate(`/campanhas/${c.id}/preview`)}
          title="Preview"
          className={`${actionBtn} text-on-surface-variant hover:text-primary hover:bg-primary-fixed`}
        >
          <span className="material-symbols-outlined text-[20px]">visibility</span>
          <span className="text-[9px] font-semibold leading-none">Preview</span>
        </button>
        <button
          onClick={() => onCopyEmbed(c)}
          title="Copiar embed"
          className={`${actionBtn} ${
            copied ? 'text-tertiary bg-tertiary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">{copied ? 'check' : 'integration_instructions'}</span>
          <span className="text-[9px] font-semibold leading-none">Embed</span>
        </button>
        <button
          onClick={() => navigate(`/campanhas/${c.id}/editar`)}
          title="Editar"
          className={`${actionBtn} text-on-surface-variant hover:text-primary hover:bg-surface-container-high`}
        >
          <span className="material-symbols-outlined text-[20px]">edit</span>
          <span className="text-[9px] font-semibold leading-none">Editar</span>
        </button>
        <button
          onClick={() => navigate(`/campanhas/${c.id}/dashboard`)}
          title="Ver Dashboard"
          className={`${actionBtn} text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed`}
        >
          <span className="material-symbols-outlined text-[20px]">query_stats</span>
          <span className="text-[9px] font-semibold leading-none">Métricas</span>
        </button>
        {c.ativo ? (
          <button
            onClick={() => onInativar(c.id)}
            title="Inativar"
            className={`${actionBtn} text-on-surface-variant hover:text-error hover:bg-error-container`}
          >
            <span className="material-symbols-outlined text-[20px]">block</span>
            <span className="text-[9px] font-semibold leading-none">Inativar</span>
          </button>
        ) : (
          <button
            onClick={() => onReativar(c.id)}
            title="Reativar"
            className={`${actionBtn} text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10`}
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            <span className="text-[9px] font-semibold leading-none">Reativar</span>
          </button>
        )}
      </div>
    </div>
  )
}

export function CampanhasIndex() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [searchParams, setSearchParams] = useSearchParams()
  const [filterBusca, setFilterBusca] = useState(() => searchParams.get('busca') ?? '')

  useEffect(() => {
    if (filterBusca.trim()) {
      setSearchParams({ busca: filterBusca.trim() }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }, [filterBusca])
  const [filterTipo, setFilterTipo] = useState('')
  const [filterSistema, setFilterSistema] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterAtivo, setFilterAtivo] = useState<'todas' | 'ativas' | 'inativas'>('ativas')
  const [showAvancados, setShowAvancados] = useState(false)
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
    if (filterAtivo === 'ativas' && !c.ativo) return false
    if (filterAtivo === 'inativas' && c.ativo) return false
    if (busca) {
      const campos = [
        c.titulo,
        c.subtitulo ?? '',
        c.slug,
        c.sistema,
        c.tela,
        c.categoria ?? '',
        c.tipo,
        getStatus(c),
      ]
      if (!campos.some(v => v.toLowerCase().includes(busca))) return false
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
    setFilterAtivo('ativas')
    setPage(1)
  }

  const hasFilters = Boolean(filterBusca || filterTipo || filterSistema || filterStatus || filterCategoria || filterAtivo !== 'ativas')
  const qtdFiltrosAvancados = [filterTipo, filterCategoria, filterSistema, filterStatus].filter(Boolean).length

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

  const handleReativar = async (id: string) => {
    try {
      const updated = await put<Campanha>(`/campanhas/${id}`, { ativo: true })
      setCampanhas(prev => prev.map(x => (x.id === id ? updated : x)))
      if (quickView?.id === id) setQuickView(updated)
    } catch {
      alert('Erro ao reativar campanha.')
    }
  }

  const totalFeedbacks = campanhas.reduce((s, c) => s + (c._count?.feedbacks ?? 0), 0)
  const ativas = campanhas.filter(c => getStatus(c) === 'ativa').length
  const inativas = campanhas.filter(c => !c.ativo).length

  const STATUS_TABS = [
    { key: 'todas' as const, label: 'Todas', icon: 'apps', count: campanhas.length },
    { key: 'ativas' as const, label: 'Ativas', icon: 'play_circle', count: campanhas.filter(c => c.ativo).length },
    { key: 'inativas' as const, label: 'Inativas', icon: 'pause_circle', count: inativas },
  ]

  return (
    <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="hidden sm:flex w-11 h-11 rounded-xl bg-primary/10 text-primary items-center justify-center shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-[22px]">campaign</span>
          </span>
          <div>
            <nav className="flex text-label-md text-outline mb-1 gap-2">
              <button onClick={() => navigate('/')} className="hover:text-primary transition-colors">UserPulse</button>
              <span>/</span>
              <span className="font-bold text-on-surface">Campanhas</span>
            </nav>
            <h2 className="text-headline-lg font-bold text-on-surface leading-tight">Biblioteca de Campanhas</h2>
            {!loading && !error && (
              <p className="text-body-md text-on-surface-variant mt-0.5">
                {campanhas.length} {campanhas.length === 1 ? 'campanha' : 'campanhas'} no total
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate('/campanhas/nova')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:opacity-95 transition-all active:scale-95 shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nova Campanha
        </button>
      </div>

      {/* KPIs */}
      {!loading && !error && campanhas.length > 0 && (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <KpiCard label="Total de Campanhas" shortLabel="Total" icon="list_alt" iconBg="bg-primary/10" iconColor="text-primary" value={campanhas.length} />
          <KpiCard label="Campanhas Ativas" shortLabel="Ativas" icon="play_circle" iconBg="bg-tertiary/10" iconColor="text-tertiary" value={ativas} />
          <KpiCard label="Campanhas Inativas" shortLabel="Inativas" icon="pause_circle" iconBg="bg-outline-variant/40" iconColor="text-on-surface-variant" value={inativas} />
          <KpiCard label="Total de Feedbacks" shortLabel="Feedbacks" icon="forum" iconBg="bg-secondary/10" iconColor="text-secondary" value={totalFeedbacks.toLocaleString('pt-BR')} />
        </div>
      )}

      {/* Filters */}
      <div className="w-full max-w-full overflow-x-hidden bg-surface-container-lowest p-4 sm:p-5 rounded-2xl border border-outline-variant/30 mb-6 shadow-sm space-y-3">
        <p className="flex items-center gap-1.5 text-label-md font-bold text-on-surface-variant uppercase tracking-wide">
          <span className="material-symbols-outlined text-[16px]">filter_alt</span>
          Filtrar campanhas
        </p>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={filterBusca}
            onChange={e => { setFilterBusca(e.target.value); setPage(1) }}
            placeholder="Buscar por título, slug, sistema, tela, categoria, tipo ou status…"
            className="w-full rounded-xl border border-outline-variant py-2 pl-10 pr-4 text-body-md bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
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

        {/* Quick status filters + advanced toggle + clear */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 bg-surface-container p-1 rounded-xl max-w-full">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setFilterAtivo(tab.key); setPage(1) }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-label-md font-bold transition-all whitespace-nowrap ${
                  filterAtivo === tab.key
                    ? 'bg-surface-bright text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className={`material-symbols-outlined text-[16px] ${
                  filterAtivo === tab.key
                    ? tab.key === 'ativas' ? 'text-tertiary' : tab.key === 'inativas' ? 'text-outline' : 'text-primary'
                    : ''
                }`}>
                  {tab.icon}
                </span>
                {tab.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filterAtivo === tab.key ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAvancados(v => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
              qtdFiltrosAvancados > 0
                ? 'bg-secondary/10 text-secondary border-secondary/30'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50 hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">tune</span>
            Filtros avançados
            {qtdFiltrosAvancados > 0 && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-secondary text-on-secondary text-[10px] flex items-center justify-center">
                {qtdFiltrosAvancados}
              </span>
            )}
            <span className="material-symbols-outlined text-[14px]">{showAvancados ? 'expand_less' : 'expand_more'}</span>
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 ml-auto text-label-md text-on-surface-variant hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
              Limpar filtros
            </button>
          )}
        </div>

        {/* Advanced filters — colapsável */}
        {showAvancados && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-outline-variant/30">
            <FilterSelect
              label="Todos os tipos"
              value={filterTipo}
              options={[
                { value: '', label: 'Todos os tipos' },
                ...TIPOS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
              ]}
              onChange={v => { setFilterTipo(v); setPage(1) }}
            />
            <FilterSelect
              label="Todas as categorias"
              value={filterCategoria}
              options={[
                { value: '', label: 'Todas as categorias' },
                ...CATEGORIAS.map(c => ({ value: c, label: c })),
              ]}
              onChange={v => { setFilterCategoria(v); setPage(1) }}
            />
            <FilterSelect
              label="Todos os sistemas"
              value={filterSistema}
              options={[
                { value: '', label: 'Todos os sistemas' },
                ...sistemas.map(s => ({ value: s, label: s })),
              ]}
              onChange={v => { setFilterSistema(v); setPage(1) }}
            />
            <FilterSelect
              label="Todos os status"
              value={filterStatus}
              options={[
                { value: '', label: 'Todos os status' },
                ...STATUS_OPTIONS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
              ]}
              onChange={v => { setFilterStatus(v); setPage(1) }}
            />
          </div>
        )}

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
            {filterAtivo !== 'todas' && (
              <FilterChip label={filterAtivo === 'ativas' ? 'Ativas' : 'Inativas'} onRemove={() => { setFilterAtivo('todas'); setPage(1) }} />
            )}
            <span className="text-label-md text-on-surface-variant self-center">
              — {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>
        )}
      </div>

      {/* Listagem — tabela no desktop/tablet largo, cards no mobile */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">list_alt</span>
          </span>
          <div className="min-w-0">
            <h3 className="text-title-lg font-bold text-on-surface">Campanhas</h3>
            <p className="text-label-md text-on-surface-variant mt-0.5">
              {loading
                ? 'Carregando campanhas…'
                : `Mostrando ${filtered.length} ${filtered.length === 1 ? 'campanha' : 'campanhas'} conforme os filtros aplicados`}
            </p>
          </div>
        </div>

        {loading && <LoadingSpinner />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && paginated.length === 0 && (
          <EmptyState
            icon="campaign"
            title={hasFilters ? 'Nenhuma campanha encontrada' : 'Nenhuma campanha ainda'}
            description={
              filterBusca && !filterTipo && !filterSistema && !filterStatus && !filterCategoria
                ? `Nenhuma campanha encontrada para a busca "${filterBusca}".`
                : hasFilters
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
        )}

        {!loading && !error && paginated.length > 0 && (
          <>
            {/* Desktop/tablet largo (>= md): tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50 border-b border-outline-variant/40">
                    {(['Campanha', 'Tipo', 'Sistema / Tela', 'Status', 'Respostas', 'Ações'] as const).map(h => (
                      <th key={h} className={`px-4 py-3 text-[11px] text-on-surface-variant font-bold uppercase tracking-wide whitespace-nowrap${
                        h === 'Ações' ? ' text-right' : h === 'Respostas' ? ' text-center hidden sm:table-cell' : ''
                      }${h === 'Tipo' ? ' hidden md:table-cell' : ''}${h === 'Sistema / Tela' ? ' hidden lg:table-cell' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {paginated.map(c => {
                      const status = getStatus(c)
                      const st = STATUS_DOT[status]
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setQuickView(c)}
                          className={`group cursor-pointer transition-colors ${!c.ativo ? 'opacity-60' : ''} ${
                            quickView?.id === c.id
                              ? 'bg-primary-fixed/60'
                              : 'hover:bg-surface-container-low/60'
                          }`}
                        >
                          {/* Campanha */}
                          <td className="px-4 py-4 align-middle max-w-[320px]">
                            <p className="text-body-md font-bold text-on-surface truncate">{c.titulo}</p>
                            {c.subtitulo && (
                              <p className="text-[12px] text-on-surface-variant truncate mt-0.5">{c.subtitulo}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {c.categoria && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-secondary/10 text-secondary">
                                  {c.categoria}
                                </span>
                              )}
                              {(c.prioridade ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary" title="Prioridade">
                                  <span className="material-symbols-outlined text-[10px]">arrow_upward</span>
                                  {c.prioridade}
                                </span>
                              )}
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
                              <span className="text-[11px] text-outline">Criada em {formatDateTime(c.criado_em)}</span>
                            </div>
                          </td>

                          {/* Tipo */}
                          <td className="px-4 py-4 align-middle whitespace-nowrap hidden md:table-cell">
                            <TypeBadge tipo={c.tipo} />
                          </td>

                          {/* Sistema / Tela */}
                          <td className="px-4 py-4 align-middle hidden lg:table-cell">
                            <p className="text-body-md text-on-surface">{c.sistema}</p>
                            <p className="text-[12px] text-on-surface-variant">{c.tela}</p>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4 align-middle">
                            <div className="flex items-center gap-2.5">
                              <div onClick={e => e.stopPropagation()}>
                                <ToggleSwitch checked={c.ativo} onChange={() => handleToggle(c)} />
                              </div>
                              <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${st.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                {st.label}
                              </span>
                            </div>
                          </td>

                          {/* Respostas */}
                          <td className="px-4 py-4 align-middle text-body-md font-bold text-center hidden sm:table-cell">
                            {(c._count?.feedbacks ?? 0).toLocaleString('pt-BR')}
                          </td>

                          {/* Ações */}
                          <td className="px-4 py-4 align-middle text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigate(`/campanhas/${c.id}/preview`)}
                                title="Preview"
                                className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-fixed rounded-full transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </button>
                              <button
                                onClick={() => handleCopyEmbed(c)}
                                title="Copiar embed"
                                className={`p-2 rounded-full transition-all ${
                                  copiedId === c.id
                                    ? 'text-tertiary bg-tertiary/10'
                                    : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {copiedId === c.id ? 'check' : 'integration_instructions'}
                                </span>
                              </button>
                              <button
                                onClick={() => navigate(`/campanhas/${c.id}/editar`)}
                                title="Editar"
                                className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              <button
                                onClick={() => navigate(`/campanhas/${c.id}/dashboard`)}
                                title="Ver Dashboard"
                                className="p-2 text-on-surface-variant hover:text-secondary hover:bg-secondary-fixed rounded-full transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">query_stats</span>
                              </button>
                              {c.ativo ? (
                                <button
                                  onClick={() => handleInativar(c.id)}
                                  title="Inativar"
                                  className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-full transition-all"
                                >
                                  <span className="material-symbols-outlined text-[18px]">block</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleReativar(c.id)}
                                  title="Reativar"
                                  className="p-2 text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-full transition-all"
                                >
                                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                </button>
                              )}
                            </div>
                          </td>
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
                const st = STATUS_DOT[status]
                return (
                  <CampanhaCard
                    key={c.id}
                    c={c}
                    st={st}
                    active={quickView?.id === c.id}
                    copied={copiedId === c.id}
                    navigate={navigate}
                    onOpen={setQuickView}
                    onToggle={handleToggle}
                    onCopyEmbed={handleCopyEmbed}
                    onInativar={handleInativar}
                    onReativar={handleReativar}
                  />
                )
              })}
            </div>

            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </div>

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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full h-10 rounded-xl border border-outline-variant bg-surface-bright px-4 text-body-md flex justify-between items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors hover:border-outline"
      >
        <span className={selected?.value ? 'text-on-surface' : 'text-on-surface-variant'}>
          {selected?.label ?? label}
        </span>
        <span className={`material-symbols-outlined text-outline text-[18px] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-outline-variant bg-surface-bright shadow-lg overflow-hidden">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-body-md text-left transition-colors ${
                value === o.value
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-on-surface hover:bg-surface-container-low'
              }`}
            >
              {o.label}
              {value === o.value && (
                <span className="material-symbols-outlined text-[16px]">check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
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
