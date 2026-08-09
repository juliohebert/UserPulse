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

// Fase 6C — texto do trial ainda ativo, a partir de
// tenant.trial_dias_restantes já calculado pelo backend (ver
// server/src/lib/tenantGuards.ts, diasRestantesTrial) — nunca recalculado
// aqui. Math.max(dias, 1) evita mostrar "0 dias restantes": enquanto
// situacao_comercial ainda for trial_ativo, sempre mostra pelo menos 1 dia.
function textoDiasRestantesTrial(dias: number): string {
  const d = Math.max(dias, 1)
  const contagem = d === 1 ? '1 dia restante' : `${d} dias restantes`
  return `Seu teste grátis está ativo. Você tem ${contagem} para explorar o UserPulse.`
}

type Variante = 'danger' | 'warning'

interface Aviso {
  texto: string
  variante: Variante
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
    case 'licenca_vencida':
      return { texto: 'Sua licença venceu. Entre em contato para regularizar o acesso.', variante: 'danger' }
    case 'trial_ativo': {
      const dias = tenant.trial_dias_restantes
      // Sempre exibido enquanto o trial estiver ativo (sem limiar) — ao
      // vencer, situacao_comercial já vira trial_vencido e cai no case
      // acima, então dias<=0 nunca chega aqui na prática.
      if (dias == null) return null
      return { texto: textoDiasRestantesTrial(dias), variante: 'warning' }
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
        {aviso.variante === 'danger' ? 'error' : 'warning'}
      </span>
      <span>{aviso.texto}</span>
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
