import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { EmptyState } from '../ui/EmptyState'
import { podeEscreverConfiguracao } from '../../utils/permissions'

// Protege as telas de configuração do tenant (Aparência do Widget, Catálogo
// de Telas) — EDITOR e VIEWER nunca chegam aqui, só ADMIN/SUPER_ADMIN. Só
// UX: o backend (requireEscritaConfiguracao, ver
// server/src/middleware/requireEscritaTenant.ts) já bloqueia a escrita com
// 403 mesmo que alguém contorne esta tela; aqui a tela inteira fica restrita
// porque as duas páginas são formulários únicos de visualizar+editar, sem
// versão só-leitura.
export function RequireEscritaConfiguracao() {
  const { user } = useAuth()

  if (!podeEscreverConfiguracao(user?.role)) {
    return (
      <div className="px-4 lg:px-margin-desktop py-10">
        <EmptyState
          icon="lock"
          title="Acesso restrito"
          description="Apenas administradores podem acessar as configurações do cliente (aparência do widget, catálogo de telas). Peça a um administrador do seu time se precisar de acesso."
        />
      </div>
    )
  }

  return <Outlet />
}
