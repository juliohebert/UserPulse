import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Fica sempre dentro de <RequireAuth> (ver App.tsx), envolvendo o Layout —
// usuário com senha temporária (definida pelo super admin no acesso inicial
// ou num reset, ver adminTenants.ts) não navega pro painel antes de trocar a
// própria senha em /trocar-senha. A própria rota /trocar-senha fica FORA
// deste guard (senão o redirect entraria em loop).
export function RequireSenhaAtualizada() {
  const { user } = useAuth()

  if (user?.precisa_trocar_senha) {
    return <Navigate to="/trocar-senha" replace />
  }

  return <Outlet />
}
