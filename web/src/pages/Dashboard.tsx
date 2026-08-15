import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, del } from '../services/api'
import type { Campanha, TourGuiado } from '../types'
import { getStatus, formatDate } from '../utils/campanha'
import { StatusBadge } from '../components/ui/StatusBadge'
import { TypeBadge } from '../components/ui/TypeBadge'
import { LoadingSpinner, ErrorState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuth } from '../hooks/useAuth'
import { podeEscreverConteudo, podeEscreverConfiguracao } from '../utils/permissions'

// ─── Building blocks ────────────────────────────────────────────────────────

function KpiCard({
  label, icon, iconBg, iconColor, value, hint, hintColor,
}: {
  label: string
  icon: string
  iconBg: string
  iconColor: string
  value: string | number
  hint?: string
  hintColor?: string
}) {
  return (
    <div className="min-h-[164px] bg-surface rounded-3xl border border-outline-variant p-6 flex flex-col">
      <div className="flex min-h-10 items-center gap-2.5">
        <span className={`w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </span>
        <p className="text-label-md font-medium text-on-surface-variant leading-tight">{label}</p>
      </div>
      <div className="mt-4 flex flex-1 flex-col">
        <p className="text-headline-lg font-semibold text-on-surface leading-none">{value}</p>
        {hint ? (
          <p className={`mt-auto min-h-5 text-[13px] font-medium leading-5 ${hintColor ?? 'text-outline'}`}>{hint}</p>
        ) : (
          <span className="mt-auto min-h-5" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

function AcaoRapida({
  icon, iconBg, iconColor, title, description, onClick,
}: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col gap-3 p-6 bg-surface rounded-3xl border border-outline-variant transition-colors text-left hover:border-[#ced0d4]"
    >
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </span>
      <div className="pr-5">
        <p className="text-body-md font-bold text-on-surface mb-0.5">{title}</p>
        <p className="text-label-md text-on-surface-variant leading-snug">{description}</p>
      </div>
      <span className="absolute top-5 right-5 text-outline-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all material-symbols-outlined text-[18px]">
        arrow_forward
      </span>
    </button>
  )
}

function InsightCard({
  icon, iconBg, iconColor, title, description, ctaLabel, onCta,
}: {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  description: string
  ctaLabel: string
  onCta: () => void
}) {
  return (
    <div className="flex items-start gap-3 p-5 rounded-3xl bg-surface border border-outline-variant">
      <span className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-md font-bold text-on-surface">{title}</p>
        <p className="text-label-md text-on-surface-variant mt-0.5">{description}</p>
        <button onClick={onCta} className="text-label-md font-bold text-primary hover:underline mt-1.5">
          {ctaLabel}
        </button>
      </div>
    </div>
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

function OnboardingState({ navigate, podeEscrever }: { navigate: (path: string) => void; podeEscrever: boolean }) {
  return (
    <div className="bg-surface rounded-3xl border border-outline-variant p-8 sm:p-12 text-center">
      <div className="w-16 h-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-5">
        <span className="material-symbols-outlined text-[32px]">rocket_launch</span>
      </div>
      <h3 className="text-headline-md font-semibold text-on-surface mb-2">Vamos começar</h3>
      <p className="text-body-md text-on-surface-variant max-w-md mx-auto mb-6">
        Ainda não há campanhas nem tours guiados por aqui. Crie o primeiro conteúdo para começar a coletar feedback
        e guiar seus usuários dentro do produto.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {podeEscrever && (
          <>
            <Button
              onClick={() => navigate('/campanhas/nova')}
              size="md"
              iconLeft={<span className="material-symbols-outlined text-[18px]">add_circle</span>}
            >
              Criar campanha
            </Button>
            <Button
              onClick={() => navigate('/tours/novo')}
              variant="ghost"
              size="md"
              iconLeft={<span className="material-symbols-outlined text-[18px]">map</span>}
            >
              Criar tour guiado
            </Button>
          </>
        )}
        <Button
          onClick={() => navigate('/integracao')}
          variant="ghost"
          size="md"
          iconLeft={<span className="material-symbols-outlined text-[18px]">integration_instructions</span>}
        >
          Ver integração
        </Button>
      </div>
    </div>
  )
}

// Modal de boas-vindas do trial (Fase de melhoria visual) — mostrado uma
// única vez por trial, ver mostrarModalTrial/fecharModalTrial em Dashboard()
// abaixo. Limites vêm sempre de user.tenant.plano (já devolvido em
// /auth/me), nunca hardcoded aqui (mesmo raciocínio de TrialCard em
// MinhaAssinatura.tsx).
function fmtLimiteModal(n: number | null): string {
  return n != null ? String(n) : 'Ilimitado'
}

function TrialWelcomeModal({
  dias, plano, onVerPlanos, onComecar, onClose,
}: {
  dias: number | null
  plano: { limite_campanhas_ativas: number | null; limite_tours_ativos: number | null; limite_jornadas_ativas: number | null } | null
  onVerPlanos: () => void
  onComecar: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Mesmos ícones já usados pelos itens de navegação equivalentes na
  // Sidebar (campaign/map/route) — mantém consistência visual sem inventar
  // um novo conjunto de ícones só para este modal.
  const limites = plano ? [
    { icon: 'campaign', valor: fmtLimiteModal(plano.limite_campanhas_ativas), label: plano.limite_campanhas_ativas === 1 ? 'Campanha' : 'Campanhas' },
    { icon: 'map', valor: fmtLimiteModal(plano.limite_tours_ativos), label: plano.limite_tours_ativos === 1 ? 'Tour Guiado' : 'Tours Guiados' },
    { icon: 'route', valor: fmtLimiteModal(plano.limite_jornadas_ativas), label: plano.limite_jornadas_ativas === 1 ? 'Jornada' : 'Jornadas' },
  ] : []

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-modal-title"
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-primary/15 to-secondary/15 py-8 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-surface shadow-md flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[30px]">rocket_launch</span>
          </div>
        </div>
        <div className="p-6 text-center">
          <h3 id="trial-modal-title" className="text-headline-md font-bold text-on-surface mb-2">Seu teste grátis começou</h3>
          <p className="text-body-md text-on-surface-variant mb-5">
            {dias != null
              ? `Você tem ${dias} dia${dias === 1 ? '' : 's'} para explorar o UserPulse e conhecer os principais recursos.`
              : 'Explore o UserPulse e conheça os principais recursos.'}
          </p>

          {limites.length > 0 && (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/40 p-4 mb-5 text-left">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-3">
                <span className="material-symbols-outlined text-[16px]">fact_check</span>
                Limites do plano
              </p>
              <div className="grid grid-cols-3 gap-2">
                {limites.map(l => (
                  <div key={l.label} className="text-center bg-surface rounded-lg border border-outline-variant/30 py-3 px-1">
                    <span className="material-symbols-outlined text-primary text-[20px]">{l.icon}</span>
                    <p className="text-title-md font-bold text-on-surface mt-1">{l.valor}</p>
                    <p className="text-[11px] text-on-surface-variant leading-tight">{l.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="ghost" fullWidthMobile onClick={onVerPlanos} className="sm:flex-1">Ver planos</Button>
            <Button fullWidthMobile onClick={onComecar} className="sm:flex-1">Começar a explorar</Button>
          </div>
          <p className="flex items-center justify-center gap-1 text-label-sm text-on-surface-variant mt-4">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            Não é necessário cadastrar cartão agora.
          </p>
        </div>
      </div>
    </div>
  )
}

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

interface Insight {
  id: string
  icon: string
  iconBg: string
  iconColor: string
  title: string
  description: string
  ctaLabel: string
  onCta: () => void
}

// Persistência mínima local (mesmo mecanismo já usado no projeto pra "visto
// uma vez" — ver localStorage de sidebar collapsed em Layout.tsx e wasShown
// do widget.js) — não existe nenhum flag de onboarding no backend/AdminUser
// pra reaproveitar, então não criamos migration nova só pra isto. Chave
// composta por tenant + usuário + trial_fim: um trial FUTURO (trial_fim
// diferente, ex.: reativação manual por suporte) nunca fica bloqueado por
// uma flag de um trial anterior já visto. Nenhum dado sensível armazenado,
// só a marca "1".
const TRIAL_MODAL_KEY_PREFIX = 'userpulse:trial-modal-visto:'

function trialModalKey(tenantId: string, userId: string, trialFim: string | null): string {
  return `${TRIAL_MODAL_KEY_PREFIX}${tenantId}:${userId}:${trialFim ?? 'sem-data'}`
}

export function Dashboard() {
  const { user } = useAuth()
  // RBAC real (ver server/src/middleware/requireEscritaTenant.ts) — esconder
  // aqui é só UX, o backend já bloqueia 403 em qualquer chamada de escrita.
  const podeEscrever = podeEscreverConteudo(user?.role)
  const podeConfig = podeEscreverConfiguracao(user?.role)
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tours, setTours] = useState<TourGuiado[]>([])
  const [toursLoading, setToursLoading] = useState(true)
  const [toursError, setToursError] = useState(false)
  const [campanhaInativar, setCampanhaInativar] = useState<Campanha | null>(null)
  const [inativandoId, setInativandoId] = useState<string | null>(null)
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null)
  const [mostrarModalTrial, setMostrarModalTrial] = useState(false)
  const navigate = useNavigate()

  // Modal de boas-vindas do trial — só quando tenant está em trial ATIVO
  // (situacao_comercial já vem calculada do backend, nunca recalculada aqui,
  // mesmo padrão de AvisoComercial.tsx) e o usuário ainda não viu essa
  // apresentação deste trial específico (ver trialModalKey acima).
  useEffect(() => {
    if (!user || user.tenant.situacao_comercial !== 'trial_ativo') return
    const chave = trialModalKey(user.tenant.id, user.id, user.tenant.trial_fim)
    try {
      if (localStorage.getItem(chave) !== '1') setMostrarModalTrial(true)
    } catch { /* localStorage indisponível (modo privado, etc.) — nunca bloqueia a tela por isso */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.tenant.id, user?.tenant.trial_fim, user?.tenant.situacao_comercial])

  const fecharModalTrial = () => {
    setMostrarModalTrial(false)
    if (user) {
      try { localStorage.setItem(trialModalKey(user.tenant.id, user.id, user.tenant.trial_fim), '1') } catch {}
    }
  }

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

  const totalTours = tours.length
  const toursAtivos = tours.filter(t => t.ativo).length
  const toursInativos = totalTours - toursAtivos
  const toursRecentes = tours.slice(0, 3)
  const toursDataReady = !toursLoading && !toursError

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

  // "O que merece atenção" — tudo calculado a partir dos dados já carregados
  // nesta tela (campanhas + tours), sem endpoint novo.
  const insights: Insight[] = []
  const campanhasSemFeedback = campanhas.filter(c => getStatus(c) === 'ativa' && (c._count?.feedbacks ?? 0) === 0)
  if (campanhasSemFeedback.length > 0) {
    insights.push({
      id: 'sem-feedback',
      icon: 'forum',
      iconBg: 'bg-secondary/10',
      iconColor: 'text-secondary',
      title: `${campanhasSemFeedback.length} campanha${campanhasSemFeedback.length === 1 ? '' : 's'} ativa${campanhasSemFeedback.length === 1 ? '' : 's'} sem feedback`,
      description: 'Ainda não receberam nenhuma resposta dos usuários.',
      ctaLabel: 'Ver campanhas',
      onCta: () => navigate('/campanhas'),
    })
  }
  const campanhasInativas = campanhas.filter(c => !c.ativo).length
  if (campanhasInativas > 0) {
    insights.push({
      id: 'inativas',
      icon: 'pause_circle',
      iconBg: 'bg-outline-variant/40',
      iconColor: 'text-on-surface-variant',
      title: `${campanhasInativas} campanha${campanhasInativas === 1 ? '' : 's'} inativa${campanhasInativas === 1 ? '' : 's'}`,
      description: 'Reative ou revise para manter o painel organizado.',
      ctaLabel: 'Ver campanhas',
      onCta: () => navigate('/campanhas'),
    })
  }
  if (toursDataReady && totalTours === 0) {
    insights.push({
      id: 'sem-tours',
      icon: 'map',
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      title: 'Nenhum tour guiado criado ainda',
      description: 'Tours ajudam a orientar usuários direto no seu sistema.',
      ctaLabel: 'Criar tour guiado',
      onCta: () => navigate('/tours/novo'),
    })
  } else if (toursDataReady && toursInativos > 0) {
    insights.push({
      id: 'tours-inativos',
      icon: 'visibility_off',
      iconBg: 'bg-outline-variant/40',
      iconColor: 'text-on-surface-variant',
      title: `${toursInativos} tour${toursInativos === 1 ? '' : 's'} inativo${toursInativos === 1 ? '' : 's'}`,
      description: 'Publicados como rascunho — ative quando estiverem prontos.',
      ctaLabel: 'Ver tours',
      onCta: () => navigate('/tours'),
    })
  }
  if (total > 0 && totalFeedbacks === 0 && campanhasSemFeedback.length === 0) {
    insights.push({
      id: 'sem-feedback-global',
      icon: 'forum',
      iconBg: 'bg-yellow-500/10',
      iconColor: 'text-yellow-600',
      title: 'Nenhum feedback coletado ainda',
      description: 'Confira se as campanhas estão sendo exibidas corretamente para os usuários.',
      ctaLabel: 'Ver campanhas',
      onCta: () => navigate('/campanhas'),
    })
  }
  const insightsVisiveis = insights.slice(0, 4)

  const isEmpty = !loading && !error && toursDataReady && total === 0 && totalTours === 0

  const heroSubtitulo = loading || toursLoading
    ? 'Acompanhe campanhas, tours guiados e o engajamento dos seus usuários em um só lugar.'
    : total === 0 && totalTours === 0
    ? 'Comece criando sua primeira campanha ou tour guiado para engajar os usuários.'
    : `${ativas} campanha${ativas === 1 ? '' : 's'} ativa${ativas === 1 ? '' : 's'} e ${toursAtivos} tour${toursAtivos === 1 ? '' : 's'} guiado${toursAtivos === 1 ? '' : 's'} ajudando seus usuários agora.`

  const confirmarInativacao = async () => {
    if (!campanhaInativar) return
    const id = campanhaInativar.id
    setInativandoId(id)
    setErroConfirmacao(null)
    try {
      await del(`/campanhas/${id}`)
      setCampanhas(prev => prev.map(c => c.id === id ? { ...c, ativo: false } : c))
      setCampanhaInativar(null)
    } catch {
      setErroConfirmacao('Erro ao inativar campanha. Tente novamente.')
    } finally {
      setInativandoId(null)
    }
  }

  return (
    <section className="px-4 lg:px-margin-desktop py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-primary p-8 sm:p-10 text-white mb-8">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -left-12 -bottom-20 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-label-md font-bold uppercase tracking-widest opacity-75 mb-2">Visão geral</p>
            <h2 className="text-headline-lg sm:text-display-lg font-semibold leading-tight mb-2">Bem-vindo de volta</h2>
            <p className="text-body-lg opacity-90 max-w-xl">{heroSubtitulo}</p>
          </div>
          {podeEscrever && (
            <div className="flex flex-wrap gap-3 shrink-0">
              <Button
                onClick={() => navigate('/campanhas/nova')}
                size="md"
                className="!bg-white !text-primary"
                iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
              >
                Nova campanha
              </Button>
              <Button
                onClick={() => navigate('/tours/gravador')}
                size="md"
                className="!border-white/25 !bg-transparent !text-white"
                iconLeft={<span className="material-symbols-outlined text-[18px]">radio_button_checked</span>}
              >
                Gravar fluxo
              </Button>
            </div>
          )}
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <KpiCard label="Total de Campanhas" icon="list_alt" iconBg="bg-primary/10" iconColor="text-primary" value={total} />
            <KpiCard label="Campanhas Ativas" icon="play_circle" iconBg="bg-tertiary/10" iconColor="text-tertiary" value={ativas} hint="Em andamento" />
            <KpiCard
              label="Feedbacks Coletados"
              icon="forum"
              iconBg="bg-secondary/10"
              iconColor="text-secondary"
              value={totalFeedbacks.toLocaleString('pt-BR')}
              hint={totalFeedbacks > 0 ? `${totalFeedbacks} respostas` : 'Nenhuma resposta ainda'}
              hintColor="text-tertiary"
            />
            <KpiCard
              label="Tours Guiados"
              icon="map"
              iconBg="bg-primary/10"
              iconColor="text-primary"
              value={toursLoading ? '—' : totalTours}
              hint={toursLoading ? undefined : `${toursAtivos} ativo${toursAtivos === 1 ? '' : 's'}`}
              hintColor="text-tertiary"
            />
            <KpiCard label="Média Geral" icon="star" iconBg="bg-yellow-500/10" iconColor="text-yellow-600" value="—" hint="Ver por campanha" />
          </div>

          {/* Ações rápidas */}
          <div className="mb-6">
            <h3 className="text-title-lg font-semibold text-on-surface mb-3">Ações rápidas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {podeEscrever && (
                <>
                  <AcaoRapida
                    icon="add_circle" iconBg="bg-primary/10" iconColor="text-primary"
                    title="Nova campanha"
                    description="Crie um anúncio, pesquisa ou aviso para os usuários."
                    onClick={() => navigate('/campanhas/nova')}
                  />
                  <AcaoRapida
                    icon="map" iconBg="bg-secondary/10" iconColor="text-secondary"
                    title="Novo Tour Guiado"
                    description="Estruture um passo a passo dentro do produto."
                    onClick={() => navigate('/tours/novo')}
                  />
                  <AcaoRapida
                    icon="radio_button_checked" iconBg="bg-tertiary/10" iconColor="text-tertiary"
                    title="Gravar Fluxo"
                    description="Grave um fluxo real e gere um tour automaticamente."
                    onClick={() => navigate('/tours/gravador')}
                  />
                </>
              )}
              <AcaoRapida
                icon="integration_instructions" iconBg="bg-primary/10" iconColor="text-primary"
                title="Ver Integração"
                description="Veja como instalar e configurar o widget."
                onClick={() => navigate('/integracao')}
              />
              {podeConfig && (
                <AcaoRapida
                  icon="grid_view" iconBg="bg-secondary/10" iconColor="text-secondary"
                  title="Catálogo de Telas"
                  description="Consulte as telas já mapeadas no sistema."
                  onClick={() => navigate('/catalogo-telas')}
                />
              )}
            </div>
          </div>

          {isEmpty ? (
            <OnboardingState navigate={navigate} podeEscrever={podeEscrever} />
          ) : (
            <>
              {/* O que merece atenção */}
              <div className="mb-6">
                <h3 className="text-title-lg font-semibold text-on-surface mb-3">O que merece atenção</h3>
                {insightsVisiveis.length === 0 ? (
                  <div className="flex items-center gap-3 p-6 rounded-3xl bg-white border border-outline-variant">
                    <span className="w-10 h-10 rounded-full bg-tertiary/15 text-tertiary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    </span>
                    <p className="text-body-md text-on-surface font-medium">
                      Tudo certo por aqui. Continue acompanhando a adoção dos usuários.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {insightsVisiveis.map(ins => <InsightCard key={ins.id} {...ins} />)}
                  </div>
                )}
              </div>

              {/* Table + Sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Recent Campaigns Table */}
                <div className="lg:col-span-8 bg-surface rounded-3xl border border-outline-variant overflow-hidden">
                  <div className="px-5 py-4 flex justify-between items-center">
                    <h3 className="text-title-lg font-semibold text-on-surface">Campanhas Recentes</h3>
                    <button onClick={() => navigate('/campanhas')} className="text-primary text-label-md font-bold hover:underline">
                      Ver todas
                    </button>
                  </div>
                  {recentes.length === 0 ? (
                    <p className="text-body-md text-outline px-5 pb-5">Nenhuma campanha criada ainda.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-y border-outline-variant/30">
                            <th className="px-5 py-2.5 text-label-md text-on-surface-variant font-semibold">Título</th>
                            <th className="px-5 py-2.5 text-label-md text-on-surface-variant font-semibold text-center">Status</th>
                            <th className="px-5 py-2.5 text-label-md text-on-surface-variant font-semibold">Tipo</th>
                            <th className="px-5 py-2.5 text-label-md text-on-surface-variant font-semibold">Respostas</th>
                            <th className="px-5 py-2.5 text-label-md text-on-surface-variant font-semibold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20">
                          {recentes.map(c => {
                            const pct = Math.round(((c._count?.feedbacks ?? 0) / maxFeedbacks) * 100)
                            return (
                              <tr key={c.id} className="group hover:bg-surface-container-low/50 transition-colors">
                                <td className="px-5 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-body-md font-bold text-on-surface">{c.titulo}</span>
                                    <span className="text-[11px] text-on-surface-variant">{c.sistema} · {c.tela}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-center">
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
                                  <div className="flex items-center justify-end gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                                    {podeEscrever && (
                                      <button onClick={() => navigate(`/campanhas/${c.id}/editar`)} title="Editar" aria-label={`Editar ${c.titulo}`} className="p-2 text-on-surface-variant hover:text-primary rounded-lg transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                      </button>
                                    )}
                                    <button onClick={() => navigate(`/campanhas/${c.id}/dashboard`)} title="Dashboard" aria-label={`Abrir dashboard de ${c.titulo}`} className="p-2 text-on-surface-variant hover:text-secondary rounded-lg transition-colors">
                                      <span className="material-symbols-outlined text-[18px]">query_stats</span>
                                    </button>
                                    {podeEscrever && (
                                      <button onClick={() => { setErroConfirmacao(null); setCampanhaInativar(c) }} title="Inativar" aria-label={`Inativar ${c.titulo}`} className="p-2 text-on-surface-variant hover:text-error rounded-lg transition-colors">
                                        <span className="material-symbols-outlined text-[18px]">block</span>
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
                  )}
                </div>

                {/* Right sidebar */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Tours Guiados */}
                  <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/30">
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
                              onClick={() => navigate(podeEscrever ? `/tours/${t.id}/editar` : `/tours/${t.id}/dashboard`)}
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

                    {podeEscrever && (
                      <Button
                        onClick={() => navigate('/tours/gravador')}
                        variant="ghost"
                        size="md"
                        className="w-full mt-3"
                        iconLeft={<span className="material-symbols-outlined text-[16px]">radio_button_checked</span>}
                      >
                        Gravar novo fluxo
                      </Button>
                    )}
                  </div>

                  {/* Activity feed */}
                  <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/30">
                    <h3 className="text-title-lg font-bold text-on-surface mb-4">Atividade Recente</h3>
                    {atividades.length === 0 ? (
                      <p className="text-body-md text-on-surface-variant py-2">Nenhuma atividade recente ainda.</p>
                    ) : (
                      <div>
                        {atividades.map((a, i) => (
                          <button
                            key={`${a.tipo}-${a.id}`}
                            onClick={() => navigate(
                              a.tipo === 'campanha'
                                ? `/campanhas/${a.id}/dashboard`
                                : podeEscrever ? `/tours/${a.id}/editar` : `/tours/${a.id}/dashboard`
                            )}
                            className="relative w-full flex gap-3 text-left pb-4 last:pb-0 group"
                          >
                            {i < atividades.length - 1 && (
                              <span className="absolute left-[19px] top-10 bottom-0 w-px bg-outline-variant/40" />
                            )}
                            <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                              a.tipo === 'campanha' ? 'bg-primary-container' : 'bg-secondary/10'
                            }`}>
                              <span className={`material-symbols-outlined text-[18px] ${a.tipo === 'campanha' ? 'text-primary' : 'text-secondary'}`}>
                                {a.tipo === 'campanha' ? 'campaign' : 'map'}
                              </span>
                            </div>
                            <div className="min-w-0 -mx-1 px-1 py-1 rounded-lg group-hover:bg-surface-container-low/60 transition-colors flex-1">
                              <p className="text-body-md font-bold text-on-surface truncate">{a.titulo}</p>
                              <p className="text-label-md text-outline">{a.meta} · {formatDate(a.criado_em)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      onClick={() => navigate('/campanhas')}
                      variant="ghost"
                      size="md"
                      className="w-full mt-2"
                    >
                      Ver todas as campanhas
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {mostrarModalTrial && (
        <TrialWelcomeModal
          dias={user?.tenant.trial_dias_restantes ?? null}
          plano={user?.tenant.plano ?? null}
          onVerPlanos={() => { fecharModalTrial(); navigate('/minha-assinatura') }}
          onComecar={() => { fecharModalTrial(); navigate('/campanhas/nova') }}
          onClose={fecharModalTrial}
        />
      )}
      {campanhaInativar && (
        <ConfirmDialog
          title={`Inativar "${campanhaInativar.titulo}"?`}
          description="Ela deixará de ser exibida para os usuários, mas o histórico de respostas será preservado."
          confirmLabel="Inativar campanha"
          variant="danger"
          loading={inativandoId === campanhaInativar.id}
          erro={erroConfirmacao}
          onConfirm={confirmarInativacao}
          onCancel={() => { setCampanhaInativar(null); setErroConfirmacao(null) }}
        />
      )}
    </section>
  )
}
