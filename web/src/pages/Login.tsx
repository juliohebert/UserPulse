import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCadastroConfig } from '../hooks/useCadastroConfig'
import { AuthLayout } from '../components/auth/AuthLayout'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-5 sm:p-7 rounded-2xl border border-outline-variant/70 shadow-md space-y-4'
const cta = 'w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:shadow-lg hover:opacity-95 transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  // Config real do trial (dias + limites) pros destaques na coluna
  // institucional (ver AuthLayout, prop trialConfig) — mesmo hook usado por
  // Cadastro.tsx (useCadastroConfig, cacheia em memória entre as duas
  // telas), nunca duplicando a regra comercial aqui: só repassa o que o
  // backend já resolveu (GET /auth/cadastro/config). `carregando` distingue
  // ainda-buscando de resolvido-sem-dados, pro AuthLayout mostrar skeleton
  // em vez de um fallback provisório (ver configCarregando ali).
  const { config: cadastroConfig, carregando: carregandoConfig } = useCadastroConfig()

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
    <AuthLayout
      tituloForm="Entrar na sua conta"
      subtituloForm="Acesse sua conta para continuar criando experiências para seus usuários."
      esconderInstitucionalMobile
      trialConfig={cadastroConfig}
      configCarregando={carregandoConfig}
    >
      <form onSubmit={handleSubmit} className={card}>
        <div>
          <label htmlFor="login-email" className="block text-label-sm text-on-surface-variant mb-1">E-mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={field}
            placeholder="voce@empresa.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="login-senha" className="block text-label-sm text-on-surface-variant">Senha</label>
            <Link to="/esqueci-senha" className="text-label-sm text-primary font-bold hover:underline">Esqueci minha senha?</Link>
          </div>
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

        <button type="submit" disabled={entrando} className={cta}>
          {entrando ? 'Entrando…' : 'Entrar'}
          {!entrando && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
        </button>

        <p className="text-center text-body-sm text-outline">
          Não tem conta?{' '}
          <Link to="/cadastro" className="text-primary font-bold hover:underline">Criar conta gratuitamente</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
