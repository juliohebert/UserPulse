import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { AdminUser } from '../../types'

// A partir de quantos dias restantes o aviso de "vence em breve" aparece —
// nenhum vencimento além disso gera aviso (trial_ativo/licenca_ativa "de
// boa" não mostram nada, mesmo padrão de badgeStatusTenant em Topbar.tsx).
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

type Variante = 'danger' | 'warning'

interface Aviso {
  texto: string
  variante: Variante
}

// Mesma decisão que já bloqueia escrita no backend (situacao_comercial, ver
// obterSituacaoComercialTenant em server/src/lib/tenantGuards.ts) — nunca
// recalculada aqui, só traduzida em texto/cor. trial_ativo/licenca_ativa só
// viram aviso perto do vencimento (LIMIAR_DIAS_AVISO); os 4 estados
// "vencidos" (trial_vencido/licenca_vencida/suspenso/cancelado) sempre
// mostram aviso, já que a escrita já está bloqueada nesses casos.
function resolverAviso(tenant: AdminUser['tenant']): Aviso | null {
  switch (tenant.situacao_comercial) {
    case 'suspenso':
      return { texto: 'Sua conta está suspensa. Entre em contato com o suporte.', variante: 'danger' }
    case 'cancelado':
      return { texto: 'Sua conta foi cancelada. Entre em contato com o suporte.', variante: 'danger' }
    case 'trial_vencido':
      return { texto: 'Seu teste grátis venceu. Entre em contato para ativar sua licença.', variante: 'danger' }
    case 'licenca_vencida':
      return { texto: 'Sua licença venceu. Entre em contato para regularizar o acesso.', variante: 'danger' }
    case 'trial_ativo': {
      const dias = diasRestantes(tenant.trial_fim)
      if (dias == null || dias > LIMIAR_DIAS_AVISO) return null
      return { texto: `Seu teste grátis ${textoContagem(dias)}.`, variante: 'warning' }
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

  const aviso = resolverAviso(user.tenant)
  if (!aviso) return null

  return (
    <div className={`px-4 lg:px-margin-desktop py-2.5 text-body-sm font-medium flex items-center gap-2 ${VARIANTE_CLS[aviso.variante]}`}>
      <span className="material-symbols-outlined text-[18px] shrink-0">
        {aviso.variante === 'danger' ? 'error' : 'warning'}
      </span>
      {aviso.texto}
    </div>
  )
}
