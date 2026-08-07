import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'

// Tela de troca obrigatória de senha — alcançada via redirect do
// RequireSenhaAtualizada.tsx quando /auth/me devolve precisa_trocar_senha=true
// (senha definida pelo super admin, nunca pelo próprio usuário). Fica DENTRO
// de <RequireAuth> mas FORA do guard, senão o próprio redirect pra cá
// entraria em loop (ver App.tsx).
export function TrocarSenhaPage() {
  const { user, loading, trocarSenha } = useAuth()
  const navigate = useNavigate()

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Usuário já com senha atualizada tentando abrir a rota direto — sem
  // motivo pra mostrar essa tela, manda pro painel.
  if (!loading && user && !user.precisa_trocar_senha) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (salvando) return
    setErro(null)

    if (novaSenha.length < 8) {
      setErro('A nova senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }
    if (novaSenha === senhaAtual) {
      setErro('A nova senha não pode ser igual à senha atual.')
      return
    }

    setSalvando(true)
    try {
      await trocarSenha(senhaAtual, novaSenha, confirmarSenha)
      navigate('/', { replace: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível trocar a senha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary mb-3">
            <span className="material-symbols-outlined ms-fill text-[24px]">lock_reset</span>
          </div>
          <h1 className="text-headline-md font-bold text-primary">Troque sua senha</h1>
          <p className="text-label-md text-outline text-center">
            Sua senha foi definida por um administrador. Defina uma nova senha para continuar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/70 shadow-sm space-y-4"
        >
          <div>
            <label htmlFor="senha-atual" className="block text-label-sm text-on-surface-variant mb-1">Senha atual</label>
            <input
              id="senha-atual"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={senhaAtual}
              onChange={e => setSenhaAtual(e.target.value)}
              className={field}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label htmlFor="nova-senha" className="block text-label-sm text-on-surface-variant mb-1">Nova senha</label>
            <input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              className={field}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label htmlFor="confirmar-senha" className="block text-label-sm text-on-surface-variant mb-1">Confirmar nova senha</label>
            <input
              id="confirmar-senha"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmarSenha}
              onChange={e => setConfirmarSenha(e.target.value)}
              className={field}
              placeholder="••••••••"
            />
          </div>

          <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
            A nova senha precisa ter pelo menos 8 caracteres e ser diferente da senha atual.
          </p>

          {erro && (
            <p className="flex items-center gap-2 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
          >
            {salvando ? 'Salvando…' : 'Trocar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
