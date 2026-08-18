import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { EmptyState } from '../ui/EmptyState'
import { podeEscreverConfiguracao } from '../../utils/permissions'

// Fase 4 de permissões personalizadas — ATENÇÃO: desde esta fase, este guard
// protege SÓ Billing/Minha Assinatura (/minha-assinatura em App.tsx), nunca
// mais as telas de Configurações (aparência/catálogo/sistemas/integração) —
// essas migraram pra RequireAcessoModulo modulo="CONFIGURACOES" (ver
// App.tsx e RequireAcessoModulo.tsx), que respeita permissão personalizada.
// Billing fica de propósito fora da nova permissão por módulo (regra
// fechada da tarefa) — continua 100% Set-based (podeEscreverConfiguracao,
// ADMIN/SUPER_ADMIN, sem personalização), mesmo comportamento de sempre. Só
// UX: o backend (requireEscritaConfiguracao em routes/billing.ts) já
// bloqueia com 403 mesmo que alguém contorne esta tela.
export function RequireEscritaConfiguracao() {
  const { user } = useAuth()

  if (!podeEscreverConfiguracao(user?.role)) {
    return (
      <div className="px-4 lg:px-margin-desktop py-10">
        <EmptyState
          icon="lock"
          title="Acesso restrito"
          description="Apenas administradores podem acessar Minha Assinatura. Peça a um administrador do seu time se precisar de acesso."
        />
      </div>
    )
  }

  return <Outlet />
}
