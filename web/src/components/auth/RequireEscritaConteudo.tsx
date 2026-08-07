import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { EmptyState } from '../ui/EmptyState'
import { podeEscreverConteudo } from '../../utils/permissions'

// Protege as telas de CRIAR/EDITAR campanhas, tours e jornadas (inclui o
// Gravador de fluxo, que é uma ferramenta de criação) — VIEWER nunca chega
// aqui. Só UX: o backend (requireEscritaConteudo, ver
// server/src/middleware/requireEscritaTenant.ts) já bloqueia com 403 mesmo
// que alguém contorne esta tela. Fica dentro de <Layout> (sidebar/topbar
// continuam visíveis) — só o conteúdo principal vira a mensagem de bloqueio.
export function RequireEscritaConteudo() {
  const { user } = useAuth()

  if (!podeEscreverConteudo(user?.role)) {
    return (
      <div className="px-4 lg:px-margin-desktop py-10">
        <EmptyState
          icon="lock"
          title="Acesso restrito"
          description="Seu papel (Visualizador) não permite criar ou editar este conteúdo. Peça a um administrador do seu time se precisar de acesso."
        />
      </div>
    )
  }

  return <Outlet />
}
