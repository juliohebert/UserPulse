import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { RequisitosSenha, senhaAtendeTodasRegras } from '../components/auth/RequisitosSenha'
import type { AdminRole } from '../types'

const card = 'w-full bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm'
const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Administrador',
  EDITOR: 'Editor',
  VIEWER: 'Visualizador',
}

// Iniciais pro avatar — mesmo helper já usado em Topbar.tsx (duplicado de
// propósito, sem componente de avatar compartilhado no projeto ainda).
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'UP'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

// "Minha conta" — acessível a qualquer papel autenticado (ADMIN/EDITOR/
// VIEWER), sem guard de escrita/configuração: cada usuário só edita a
// própria senha, nunca dados de outra pessoa nem nada administrativo. A
// seção "Segurança" reaproveita POST /auth/trocar-senha (mesma rota já
// usada pela troca obrigatória em TrocarSenha.tsx) — nenhuma regra de senha
// nova foi criada, o backend segue sendo a única fonte de verdade
// (motivoSenhaFraca em server/src/controllers/auth.ts).
export function MinhaContaPage() {
  const { user, trocarSenha } = useAuth()

  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  if (!user) return null

  const confirmacaoNaoConfere = tocado && confirmarSenha.length > 0 && novaSenha !== confirmarSenha
  const senhaFraca = tocado && novaSenha.length > 0 && !senhaAtendeTodasRegras(novaSenha)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (salvando) return
    setTocado(true)
    setErro(null)
    setSucesso(false)
    if (!senhaAtual || !senhaAtendeTodasRegras(novaSenha) || novaSenha !== confirmarSenha) return

    setSalvando(true)
    try {
      await trocarSenha(senhaAtual, novaSenha, confirmarSenha)
      setSucesso(true)
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmarSenha('')
      setTocado(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível alterar sua senha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <div className="px-4 lg:px-margin-desktop py-5">
        <h2 className="text-title-lg font-bold text-on-surface">Minha conta</h2>
        <p className="text-body-md text-on-surface-variant mt-0.5">Seus dados e segurança da conta.</p>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-8 max-w-[1000px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Perfil */}
          <div className={card}>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-title-lg border-2 border-primary-fixed shrink-0">
                {iniciais(user.nome)}
              </div>
              <div className="min-w-0">
                <p className="text-title-md font-bold text-on-surface truncate">{user.nome}</p>
                <p className="text-body-sm text-on-surface-variant truncate">{user.email}</p>
                <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-primary/10 text-primary">
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
            </div>
            <div className="pt-4 border-t border-outline-variant/60">
              <span className="block text-[12px] text-on-surface-variant">Empresa</span>
              <span className="text-on-surface font-medium text-body-md">{user.tenant.nome}</span>
            </div>
          </div>

          {/* Segurança / Alterar senha */}
          <form onSubmit={handleSubmit} className={card}>
            <h3 className="text-title-md font-bold text-on-surface mb-1">Segurança</h3>
            <p className="text-body-sm text-on-surface-variant mb-4">Altere sua senha regularmente para manter sua conta protegida.</p>

            <div className="space-y-4">
              <div>
                <label htmlFor="conta-senha-atual" className="block text-label-sm text-on-surface-variant mb-1">Senha atual</label>
                <input
                  id="conta-senha-atual"
                  type="password"
                  autoComplete="current-password"
                  value={senhaAtual}
                  onChange={e => setSenhaAtual(e.target.value)}
                  onBlur={() => setTocado(true)}
                  className={field}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="conta-nova-senha" className="block text-label-sm text-on-surface-variant mb-1">Nova senha</label>
                <div className="relative">
                  <input
                    id="conta-nova-senha"
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
                <label htmlFor="conta-confirmar-senha" className="block text-label-sm text-on-surface-variant mb-1">Confirmar nova senha</label>
                <input
                  id="conta-confirmar-senha"
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
              {sucesso && (
                <p className="flex items-center gap-2 p-3 rounded-xl bg-tertiary/10 text-tertiary text-body-sm">
                  <span className="material-symbols-outlined text-[18px] shrink-0">check_circle</span>
                  Senha alterada com sucesso.
                </p>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-sm hover:shadow-md hover:opacity-95 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {salvando ? 'Salvando…' : 'Alterar senha'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </>
  )
}
