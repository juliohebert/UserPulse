import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  // Já logado (ex.: voltou pra /login manualmente com sessão válida) — manda
  // direto pro painel em vez de mostrar o formulário à toa.
  if (!loading && user) {
    const destino = (location.state as { from?: Location } | null)?.from
    return <Navigate to={destino ? `${destino.pathname}${destino.search}` : '/'} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (entrando) return
    setErro(null)
    setEntrando(true)
    try {
      await login(email.trim(), senha)
      const destino = (location.state as { from?: Location } | null)?.from
      navigate(destino ? `${destino.pathname}${destino.search}` : '/', { replace: true })
    } catch (e) {
      // Mensagem genérica de propósito — o backend já responde só
      // "E-mail ou senha inválidos." pra qualquer motivo de falha (ver
      // server/src/controllers/auth.ts), nunca revelando qual dos dois.
      setErro(e instanceof Error ? e.message : 'E-mail ou senha inválidos.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary mb-3">
            <span className="material-symbols-outlined ms-fill text-[24px]">pulse_alert</span>
          </div>
          <h1 className="text-headline-md font-bold text-primary">UserPulse</h1>
          <p className="text-label-md text-outline">Painel administrativo — acesso restrito</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/70 shadow-sm space-y-4"
        >
          <div>
            <label htmlFor="login-email" className="block text-label-sm text-on-surface-variant mb-1">E-mail</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={field}
              placeholder="voce@quark.com.br"
            />
          </div>
          <div>
            <label htmlFor="login-senha" className="block text-label-sm text-on-surface-variant mb-1">Senha</label>
            <input
              id="login-senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={e => setSenha(e.target.value)}
              className={field}
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={entrando}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
