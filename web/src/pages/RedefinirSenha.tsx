import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { RequisitosSenha, senhaAtendeTodasRegras } from '../components/auth/RequisitosSenha'
import { AuthLayout } from '../components/auth/AuthLayout'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-7 rounded-2xl border border-outline-variant/70 shadow-md space-y-4'
const cta = 'w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:shadow-lg hover:opacity-95 transition-all active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100'

// Pública, sem sessão (ver server/src/routes/auth.ts). Nunca autentica
// automaticamente após sucesso (regra explícita da tarefa) — só mostra uma
// confirmação e um link pro /login, sem cookie de sessão nenhum envolvido
// aqui (useAuth().redefinirSenha nunca chama setUser).
export function RedefinirSenhaPage() {
  const { user, loading, redefinirSenha } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  // Sem token na URL — nem tenta chamar a API, mostra direto o estado de
  // link inválido (mesmo card do erro de token expirado/já usado abaixo).
  const linkInvalido = !token

  const confirmacaoNaoConfere = tocado && confirmarSenha.length > 0 && novaSenha !== confirmarSenha
  const senhaFraca = tocado && novaSenha.length > 0 && !senhaAtendeTodasRegras(novaSenha)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setTocado(true)
    setErro(null)
    if (!senhaAtendeTodasRegras(novaSenha) || novaSenha !== confirmarSenha) return

    setEnviando(true)
    try {
      await redefinirSenha(token, novaSenha)
      setSucesso(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível redefinir sua senha. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  const linkQuebrado = linkInvalido || (erro && !sucesso && erro.match(/inválido|expirad/i))

  return (
    <AuthLayout tituloForm="Criar nova senha" subtituloForm={linkQuebrado || sucesso ? undefined : 'Escolha uma senha forte para proteger sua conta.'}>
      {linkQuebrado ? (
        <div className={`${card} text-center`}>
          <span className="material-symbols-outlined text-error text-[44px]">error</span>
          <p className="text-body-md text-on-surface">
            {linkInvalido ? 'Este link de redefinição está incompleto ou inválido.' : erro}
          </p>
          <Link to="/esqueci-senha" className={cta}>
            Solicitar novo link
          </Link>
        </div>
      ) : sucesso ? (
        <div className={`${card} text-center`}>
          <span className="material-symbols-outlined ms-fill text-tertiary text-[44px]">check_circle</span>
          <p className="text-body-md text-on-surface">Senha redefinida com sucesso. Faça login com sua nova senha.</p>
          <Link to="/login" className={cta}>
            Ir para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={card}>
          <div>
            <label htmlFor="redefinir-nova-senha" className="block text-label-sm text-on-surface-variant mb-1">Nova senha</label>
            <div className="relative">
              <input
                id="redefinir-nova-senha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                onBlur={() => setTocado(true)}
                className={`${field} pr-10 ${senhaFraca ? 'border-error focus:ring-error' : ''}`}
                placeholder="Mínimo de 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(v => !v)}
                tabIndex={-1}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px]">{mostrarSenha ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
            <RequisitosSenha senha={novaSenha} />
          </div>

          <div>
            <label htmlFor="redefinir-confirmar-senha" className="block text-label-sm text-on-surface-variant mb-1">Confirmar nova senha</label>
            <input
              id="redefinir-confirmar-senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmarSenha}
              onChange={e => setConfirmarSenha(e.target.value)}
              onBlur={() => setTocado(true)}
              className={`${field} ${confirmacaoNaoConfere ? 'border-error focus:ring-error' : ''}`}
              placeholder="Repita a nova senha"
            />
            {confirmacaoNaoConfere && <p className="text-label-sm text-error mt-1">As senhas não coincidem.</p>}
          </div>

          {erro && (
            <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              {erro}
            </p>
          )}

          <button type="submit" disabled={enviando} className={cta}>
            {enviando ? 'Redefinindo…' : 'Redefinir senha'}
            {!enviando && <span className="material-symbols-outlined text-[18px]">check</span>}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
