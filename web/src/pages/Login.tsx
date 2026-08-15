import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCadastroConfig } from '../hooks/useCadastroConfig'
import { AuthLayout } from '../components/auth/AuthLayout'

const field = 'w-full h-11 rounded-lg border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface outline-none transition-colors focus:border-2 focus:border-primary'
const card = 'bg-surface p-6 sm:p-8 rounded-3xl border border-outline-variant space-y-5'
const cta = 'w-full flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-[30px] py-3.5 text-label-md font-bold tracking-[-0.14px] text-on-primary transition-colors active:bg-[#0457cb] active:scale-[0.98] disabled:bg-[#bcc0c4] disabled:text-white'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
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
          <div className="relative">
            <input
              id="login-senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={senha}
              onChange={e => setSenha(e.target.value)}
              className={`${field} pr-10`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(v => !v)}
              tabIndex={-1}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[20px]">{mostrarSenha ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>

        {erro && (
          <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            {erro}
          </p>
        )}

        <button type="submit" disabled={entrando} className={cta}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-center text-body-sm text-outline">
          Não tem conta?{' '}
          <Link to="/cadastro" className="text-primary font-bold hover:underline">Criar conta gratuitamente</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
