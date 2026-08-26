import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { get, post } from '../services/api'
import type { ConviteInfo } from '../types'
import { useAuth } from '../hooks/useAuth'
import { RequisitosSenha, senhaAtendeTodasRegras } from '../components/auth/RequisitosSenha'
import { AuthLayout } from '../components/auth/AuthLayout'
import { LoadingSpinner } from '../components/ui/EmptyState'

const field = 'w-full h-11 rounded-lg border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface outline-none transition-colors focus:border-2 focus:border-primary'
const card = 'bg-surface p-6 sm:p-8 rounded-3xl border border-outline-variant space-y-5'
const cta = 'w-full flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-[30px] py-3.5 text-label-md font-bold tracking-[-0.14px] text-on-primary transition-colors active:bg-[#0457cb] active:scale-[0.98] disabled:bg-[#bcc0c4] disabled:text-white'

const ROLE_LABEL: Record<ConviteInfo['role'], string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Visualizador',
}

// Pública, sem sessão (ver server/src/routes/auth.ts, GET/POST
// /auth/convite/:token). Nunca autentica automaticamente após aceitar
// (mesma regra de RedefinirSenha.tsx) — o próprio usuário faz login em
// seguida, já com a senha que acabou de definir.
export function AceitarConvitePage() {
  const { user, loading: authLoading } = useAuth()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [convite, setConvite] = useState<ConviteInfo | null>(null)
  const [carregandoConvite, setCarregandoConvite] = useState(true)
  const [erroConvite, setErroConvite] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erroAceite, setErroAceite] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    if (!token) { setCarregandoConvite(false); return }
    get<ConviteInfo>(`/auth/convite/${token}`)
      .then(setConvite)
      .catch(e => setErroConvite(e instanceof Error ? e.message : 'Convite inválido ou expirado.'))
      .finally(() => setCarregandoConvite(false))
  }, [token])

  if (!authLoading && user) {
    return <Navigate to="/" replace />
  }

  const linkQuebrado = !token || (!carregandoConvite && (!convite || erroConvite))
  const senhaFraca = tocado && senha.length > 0 && !senhaAtendeTodasRegras(senha)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enviando || !token) return
    setTocado(true)
    setErroAceite(null)
    if (!nome.trim() || !senhaAtendeTodasRegras(senha)) return

    setEnviando(true)
    try {
      await post(`/auth/convite/${token}/aceitar`, { nome: nome.trim(), senha })
      setSucesso(true)
    } catch (e) {
      setErroAceite(e instanceof Error ? e.message : 'Não foi possível aceitar o convite. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout
      tituloForm="Aceitar convite"
      subtituloForm={carregandoConvite || linkQuebrado || sucesso ? undefined : `Você foi convidado para ${convite!.tenantNome} como ${ROLE_LABEL[convite!.role]}.`}
    >
      {carregandoConvite ? (
        <div className={`${card} flex justify-center`}>
          <LoadingSpinner />
        </div>
      ) : linkQuebrado ? (
        <div className={`${card} text-center`}>
          <span className="material-symbols-outlined text-error text-[44px]">error</span>
          <p className="text-body-md text-on-surface">{erroConvite ?? 'Este link de convite está incompleto ou inválido.'}</p>
          <Link to="/login" className={cta}>Ir para o login</Link>
        </div>
      ) : sucesso ? (
        <div className={`${card} text-center`}>
          <span className="material-symbols-outlined ms-fill text-tertiary text-[44px]">check_circle</span>
          <p className="text-body-md text-on-surface">Convite aceito. Faça login com sua nova senha.</p>
          <button type="button" onClick={() => navigate('/login', { replace: true })} className={cta}>
            Ir para o login
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={card}>
          <p className="text-body-md text-on-surface-variant">{convite!.email}</p>

          <div>
            <label htmlFor="convite-nome" className="block text-label-sm text-on-surface-variant mb-1">Seu nome</label>
            <input
              id="convite-nome"
              type="text"
              autoComplete="name"
              value={nome}
              onChange={e => setNome(e.target.value)}
              onBlur={() => setTocado(true)}
              className={`${field} ${tocado && !nome.trim() ? 'border-error focus:border-error' : ''}`}
              placeholder="Seu nome completo"
            />
          </div>

          <div>
            <label htmlFor="convite-senha" className="block text-label-sm text-on-surface-variant mb-1">Crie uma senha</label>
            <div className="relative">
              <input
                id="convite-senha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                onBlur={() => setTocado(true)}
                className={`${field} pr-10 ${senhaFraca ? 'border-error focus:border-error' : ''}`}
                placeholder="Mínimo de 8 caracteres"
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
            <RequisitosSenha senha={senha} />
          </div>

          {erroAceite && (
            <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              {erroAceite}
            </p>
          )}

          <button type="submit" disabled={enviando} className={cta}>
            {enviando ? 'Aceitando…' : 'Aceitar convite e criar acesso'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
