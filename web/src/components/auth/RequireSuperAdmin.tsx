import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Fica sempre dentro de <RequireAuth> (ver App.tsx) — nesse ponto já existe
// sessão válida, então não precisa de loading próprio, só checar o role.
// ADMIN comum que digitar a URL direto cai de volta pro dashboard; o backend
// (requireSuperAdmin.ts) também bloqueia com 403, então mesmo pulando este
// guard nenhuma chamada de API teria sucesso.
export function RequireSuperAdmin() {
  const { user } = useAuth()

  if (user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
