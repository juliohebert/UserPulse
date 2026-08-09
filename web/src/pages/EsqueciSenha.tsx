import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AuthLayout } from '../components/auth/AuthLayout'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-7 rounded-2xl border border-outline-variant/70 shadow-md space-y-4'
const cta = 'w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:shadow-lg hover:opacity-95 transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100'

// Pública, sem sessão (ver server/src/routes/auth.ts). A resposta do backend
// é SEMPRE a mesma mensagem genérica, exista ou não conta com aquele
// e-mail — esta tela nunca tenta adivinhar/exibir nada diferente disso, pra
// nunca virar um jeito de descobrir se um e-mail está cadastrado.
export function EsqueciSenhaPage() {
  const { user, loading, esqueciSenha } = useAuth()

  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setErro(null)
    setEnviando(true)
    try {
      const resultado = await esqueciSenha(email.trim())
      setMensagem(resultado.mensagem)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível processar sua solicitação. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout
      tituloForm="Recuperar acesso"
      subtituloForm="Informe seu e-mail e enviaremos as instruções para redefinir sua senha."
    >
      {mensagem ? (
        <div className={`${card} text-center`}>
          <span className="material-symbols-outlined ms-fill text-tertiary text-[44px]">mark_email_read</span>
          <p className="text-body-md text-on-surface">{mensagem}</p>
          <Link to="/login" className={cta}>
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={card}>
          <div>
            <label htmlFor="esqueci-email" className="block text-label-sm text-on-surface-variant mb-1">E-mail</label>
            <input
              id="esqueci-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={field}
              placeholder="voce@empresa.com"
            />
          </div>

          {erro && (
            <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              {erro}
            </p>
          )}

          <button type="submit" disabled={enviando} className={cta}>
            {enviando ? 'Enviando…' : 'Enviar instruções'}
            {!enviando && <span className="material-symbols-outlined text-[18px]">send</span>}
          </button>

          <p className="text-center text-body-sm text-outline">
            <Link to="/login" className="text-primary font-bold hover:underline">Voltar para o login</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
