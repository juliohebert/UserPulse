import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { get, post, setUnauthorizedHandler, setForbiddenHandler } from '../services/api'
import type { AdminUser } from '../types'
import { criarRefreshUnico } from '../utils/refreshUnico'

interface AuthContextValue {
  user: AdminUser | null
  // true só durante a checagem inicial (GET /auth/me no mount) — RequireAuth
  // usa isso pra mostrar loading em vez de redirecionar cedo demais pro /login.
  loading: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
  trocarSenha: (senha_atual: string, nova_senha: string, confirmar_senha: string) => Promise<void>
  // Fase 6B — cadastro público self-service. Mesmo formato de resposta de
  // login/me (usuarioPublico) e já autenticado (o backend seta o cookie de
  // sessão dentro de POST /auth/cadastro) — setUser aqui já é a "entrada
  // automática" completa, sem precisar de um login separado depois.
  cadastrar: (dados: { nome: string; empresa: string; email: string; senha: string }) => Promise<void>
  // "Esqueci minha senha" — nenhum dos dois autentica (não fazem setUser),
  // são fluxos públicos completos em si mesmos. esqueciSenha devolve sempre
  // a mesma mensagem genérica (o backend nunca revela se o e-mail existe);
  // redefinirSenha só confirma sucesso, o próprio caller redireciona pro
  // /login (regra explícita da tarefa: nunca autenticar automaticamente
  // depois de um reset).
  esqueciSenha: (email: string) => Promise<{ mensagem: string }>
  redefinirSenha: (token: string, nova_senha: string) => Promise<{ mensagem: string }>
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

    // Fase 6 de permissões personalizadas — 403 de qualquer rota admin
    // (autorização, não autenticação) dispara uma revalidação de /auth/me,
    // pra Sidebar/rotas/botões refletirem uma permissão personalizada que o
    // SUPER_ADMIN alterou enquanto este usuário já estava logado (o backend
    // já aplica a mudança na hora; só o front ficava com permissoes_efetivas
    // desatualizadas até reload/login). criarRefreshUnico garante no máximo
    // 1 GET /auth/me em voo por vez, mesmo com vários 403 quase simultâneos
    // (ver utils/refreshUnico.ts) — nunca um por 403, nunca um loop (api.ts
    // nunca chama este handler pra respostas do próprio /auth/me). A
    // request original que recebeu o 403 continua rejeitando normalmente
    // pra quem chamou (nunca é repetida aqui); falha no próprio refresh
    // (rede etc.) é silenciosa de propósito — nunca desloga por causa
    // disso, só um 401 de verdade faz isso, via onUnauthorized acima.
    const refrescarPermissoes = criarRefreshUnico(() =>
      get<AdminUser>('/auth/me').then(setUser).catch(() => {})
    )
    setForbiddenHandler(() => { void refrescarPermissoes() })

    get<AdminUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    return () => {
      setUnauthorizedHandler(null)
      setForbiddenHandler(null)
    }
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

  // Resposta tem o mesmo formato de login/me (usuarioPublico) — já vem com
  // precisa_trocar_senha=false, então setUser aqui já libera a navegação
  // normal sem precisar de um novo GET /auth/me.
  const trocarSenha = async (senha_atual: string, nova_senha: string, confirmar_senha: string) => {
    const atualizado = await post<AdminUser>('/auth/trocar-senha', { senha_atual, nova_senha, confirmar_senha })
    setUser(atualizado)
  }

  const cadastrar = async (dados: { nome: string; empresa: string; email: string; senha: string }) => {
    const criado = await post<AdminUser>('/auth/cadastro', dados)
    setUser(criado)
  }

  const esqueciSenha = (email: string) => post<{ mensagem: string }>('/auth/esqueci-senha', { email })

  const redefinirSenha = (token: string, nova_senha: string) =>
    post<{ mensagem: string }>('/auth/redefinir-senha', { token, nova_senha })

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, trocarSenha, cadastrar, esqueciSenha, redefinirSenha }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.')
  return ctx
}
