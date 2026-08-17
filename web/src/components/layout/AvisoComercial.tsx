import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { AdminUser } from '../../types'
import { podeEscreverConfiguracao } from '../../utils/permissions'

// A partir de quantos dias restantes o aviso de "vence em breve" aparece
// pra licença paga (licenca_ativa) — nenhum vencimento além disso gera
// aviso, mesmo padrão de badgeStatusTenant em Topbar.tsx. Trial ativo NÃO
// usa mais este limiar (ver trial_ativo em resolverAviso abaixo) — a
// contagem de dias do trial aparece sempre, do primeiro ao último dia.
const LIMIAR_DIAS_AVISO = 7

function diasRestantes(dataISO: string | null): number | null {
  if (!dataISO) return null
  return Math.ceil((new Date(dataISO).getTime() - Date.now()) / 86_400_000)
}

function textoContagem(dias: number): string {
  if (dias <= 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  return `vence em ${dias} dias`
}

// Fase 6C — lead-in em negrito do banner de trial ativo, a partir de
// tenant.trial_dias_restantes já calculado pelo backend (ver
// server/src/lib/tenantGuards.ts, diasRestantesTrial) — nunca recalculado
// aqui. Math.max(dias, 1) evita mostrar "0 dias restantes": enquanto
// situacao_comercial ainda for trial_ativo, sempre mostra pelo menos 1 dia.
function tituloDiasRestantesTrial(dias: number): string {
  const d = Math.max(dias, 1)
  const contagem = d === 1 ? '1 dia restante' : `${d} dias restantes`
  return `Teste grátis · ${contagem}.`
}

// Severidade visual do banner de trial — só cosmética (cor/ícone), nunca
// altera a regra de bloqueio em si (essa continua 100% em
// obterSituacaoComercialTenant no backend). Limiares pedidos: >3 dias
// informativo, 2-3 dias atenção, 1 dia (ou vencendo hoje) atenção forte.
function severidadeTrial(dias: number): Variante {
  const d = Math.max(dias, 1)
  if (d <= 1) return 'trial-urgente'
  if (d <= 3) return 'trial-atencao'
  return 'trial-info'
}

// Fase 7 — texto durante a tolerância de inadimplência, a partir de
// tenant.tolerancia_dias_restantes já calculado pelo backend (ver
// server/src/lib/tenantGuards.ts, diasRestantesTolerancia) — nunca
// recalculado aqui, e nunca menciona data/status financeiro, só o número
// de dias (regra explícita da tarefa).
function textoToleranciaInadimplencia(dias: number): string {
  const contagem = dias === 1 ? '1 dia' : `${dias} dias`
  return `Pagamento pendente. Você tem ${contagem} para regularizar sua assinatura.`
}

// trial-info/trial-atencao/trial-urgente são as 3 severidades do banner de
// trial ativo (ver severidadeTrial acima) — danger/warning seguem exatamente
// como já eram usadas pelos demais estados comerciais, sem nenhuma mudança.
type Variante = 'danger' | 'warning' | 'trial-info' | 'trial-atencao' | 'trial-urgente'

interface Aviso {
  texto: string
  // Fragmento em negrito antes de `texto` (só o banner de trial ativo usa —
  // "Teste grátis · X dias restantes." em negrito seguido do texto normal).
  // Ausente em todos os outros estados, que continuam um texto único simples.
  textoDestaque?: string
  variante: Variante
  // Ícone específico do banner de trial (relógio) — os demais estados
  // continuam usando o ícone padrão por variante (error/warning), ver render.
  icone?: string
  cta?: { label: string; to: string }
}

// Mesma decisão que já bloqueia escrita no backend (situacao_comercial, ver
// obterSituacaoComercialTenant em server/src/lib/tenantGuards.ts) — nunca
// recalculada aqui, só traduzida em texto/cor. trial_ativo mostra a
// contagem de dias sempre (do primeiro dia até o vencimento); licenca_ativa
// só vira aviso perto do vencimento (LIMIAR_DIAS_AVISO); os 4 estados
// "vencidos" (trial_vencido/licenca_vencida/suspenso/cancelado) sempre
// mostram aviso, já que a escrita já está bloqueada nesses casos.
function resolverAviso(tenant: AdminUser['tenant'], role: AdminUser['role'] | undefined): Aviso | null {
  switch (tenant.situacao_comercial) {
    case 'suspenso':
      return { texto: 'Sua conta está suspensa. Entre em contato com o suporte.', variante: 'danger' }
    case 'cancelado':
      return { texto: 'Sua conta foi cancelada. Entre em contato com o suporte.', variante: 'danger' }
    case 'trial_vencido':
      return {
        texto: 'Seu teste grátis terminou. Escolha um plano para continuar usando o UserPulse.',
        variante: 'danger',
        // Minha Assinatura é restrita a ADMIN/SUPER_ADMIN (ver
        // RequireEscritaConfiguracao.tsx) — EDITOR/VIEWER veem o aviso sem
        // o botão, pra não linkar pra uma tela de "acesso restrito".
        cta: podeEscreverConfiguracao(role) ? { label: 'Escolher um plano', to: '/minha-assinatura' } : undefined,
      }
    case 'licenca_vencida': {
      // Fase 7 — tolerância de inadimplência: dentro da janela (dias > 0),
      // acesso operacional continua normal (ver motivoBloqueioEscrita no
      // backend), só avisa. Depois de expirada (dias null ou 0), o
      // middleware já bloqueia de verdade — mensagem final, sem contagem.
      const dias = tenant.tolerancia_dias_restantes
      const emTolerancia = dias != null && dias > 0
      return {
        texto: emTolerancia
          ? textoToleranciaInadimplencia(dias)
          : 'Sua assinatura está com pagamento pendente. Regularize para continuar usando o UserPulse.',
        variante: emTolerancia ? 'warning' : 'danger',
        cta: podeEscreverConfiguracao(role) ? { label: 'Regularizar assinatura', to: '/minha-assinatura' } : undefined,
      }
    }
    case 'trial_ativo': {
      const dias = tenant.trial_dias_restantes
      // Sempre exibido enquanto o trial estiver ativo (sem limiar) — ao
      // vencer, situacao_comercial já vira trial_vencido e cai no case
      // acima, então dias<=0 nunca chega aqui na prática.
      if (dias == null) return null
      return {
        texto: 'Explore todos os recursos e turbine seu engajamento.',
        textoDestaque: tituloDiasRestantesTrial(dias),
        variante: severidadeTrial(dias),
        icone: 'schedule',
        cta: { label: 'Ver minha assinatura', to: '/minha-assinatura' },
      }
    }
    case 'licenca_ativa': {
      const dias = diasRestantes(tenant.licenca_fim)
      if (dias == null || dias > LIMIAR_DIAS_AVISO) return null
      return { texto: `Sua licença ${textoContagem(dias)}.`, variante: 'warning' }
    }
    default:
      return null
  }
}

const VARIANTE_CLS: Record<Variante, string> = {
  danger: 'bg-error-container text-on-error-container',
  warning: 'bg-amber-100 text-amber-900',
  'trial-info': 'bg-primary/5 text-primary',
  'trial-atencao': 'bg-amber-100 text-amber-900',
  'trial-urgente': 'bg-amber-200 text-amber-900',
}

const VARIANTE_ICONE_PADRAO: Record<Variante, string> = {
  danger: 'error',
  warning: 'warning',
  'trial-info': 'schedule',
  'trial-atencao': 'schedule',
  'trial-urgente': 'schedule',
}

// Renderizado dentro de Layout.tsx, acima do <Outlet />, em toda página do
// painel — exceto Gestão SaaS: SUPER_ADMIN nunca deve ver um aviso sobre a
// própria licença interna (ver contexto da tarefa). A rota /admin/* já é
// protegida por RequireSuperAdmin; checar o path aqui evita duplicar uma
// checagem de role só pra decidir visibilidade de UI.
export function AvisoComercial() {
  const { user } = useAuth()
  const location = useLocation()

  if (location.pathname.startsWith('/admin')) return null
  if (!user) return null

  const aviso = resolverAviso(user.tenant, user.role)
  if (!aviso) return null

  return (
    <div className={`px-4 lg:px-margin-desktop py-2.5 text-body-sm font-medium flex items-center gap-2 ${VARIANTE_CLS[aviso.variante]}`}>
      <span className="material-symbols-outlined text-[18px] shrink-0">
        {aviso.icone ?? VARIANTE_ICONE_PADRAO[aviso.variante]}
      </span>
      <span>
        {aviso.textoDestaque && <span className="font-bold">{aviso.textoDestaque} </span>}
        {aviso.texto}
      </span>
      {aviso.cta && (
        <Link
          to={aviso.cta.to}
          className="ml-auto shrink-0 rounded-full border border-current px-3 py-1 text-label-md font-bold hover:opacity-80 transition-opacity"
        >
          {aviso.cta.label}
        </Link>
      )}
    </div>
  )
}
