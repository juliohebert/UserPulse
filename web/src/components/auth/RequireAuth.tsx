import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoadingSpinner } from '../ui/EmptyState'

// Envolve o grupo de rotas do painel (ver App.tsx) — nunca as rotas públicas
// (apresentacao, login). Sem sessão válida, redireciona pra /login guardando
// a rota original em location.state.from, pra Login.tsx voltar pra lá depois.
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
