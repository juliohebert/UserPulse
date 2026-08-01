import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { get, post, setUnauthorizedHandler } from '../services/api'
import type { AdminUser } from '../types'

interface AuthContextValue {
  user: AdminUser | null
  // true só durante a checagem inicial (GET /auth/me no mount) — RequireAuth
  // usa isso pra mostrar loading em vez de redirecionar cedo demais pro /login.
  loading: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Qualquer 401 de rota admin (sessão expirou, cookie foi limpo em outra
    // aba etc.) derruba o usuário local — RequireAuth reage disso navegando
    // pra /login. Registrado uma vez, pro app inteiro (não só pra este effect).
    setUnauthorizedHandler(() => setUser(null))

    get<AdminUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    return () => setUnauthorizedHandler(null)
  }, [])

  const login = async (email: string, senha: string) => {
    const logado = await post<AdminUser>('/auth/login', { email, senha })
    setUser(logado)
  }

  const logout = async () => {
    // Mesmo se a chamada falhar (ex.: já sem sessão), limpa o usuário local —
    // "sair" precisa funcionar mesmo com a sessão já inválida no servidor.
    await post('/auth/logout', {}).catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.')
  return ctx
}
