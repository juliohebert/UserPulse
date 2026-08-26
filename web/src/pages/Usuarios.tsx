import { useEffect, useRef, useState } from 'react'
import { get, post, put, del } from '../services/api'
import type {
  AdminDoTenant, AdminRole, ConvitePendente, ModuloPainel, NivelAcessoModulo,
  PermissoesUsuario, UsuariosResposta,
} from '../types'
import { LoadingSpinner, ErrorState, EmptyState } from '../components/ui/EmptyState'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PermissoesUsuarioModal } from '../components/admin/PermissoesUsuarioModal'
import { formatDateCivil } from '../utils/campanha'
import {
  MODULOS_PAINEL, MODULO_LABEL, NIVEL_OPCOES, matrizInicialPorRole,
  formularioInicialDePermissoes, metodoParaSalvarPermissoes, montarPayloadPermissoes,
  podeReceberPersonalizacao, rotuloIndicadorPersonalizacao, type FormPermissoes, type MatrizPermissoes,
} from '../utils/permissoesUsuario'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import { useAuth } from '../hooks/useAuth'

// Gestão de usuários self-service (ver server/src/controllers/usuarios.ts,
// montado em /api/usuarios) — o próprio ADMIN do tenant convida/edita/
// remove acessos, sem depender do SUPER_ADMIN. Reaproveita o mesmo
// PermissoesUsuarioModal/permissoesUsuario.ts já usados em Gestão SaaS
// (Tenants.tsx) — mesma lógica de formulário, só o path da API muda (aqui
// nunca leva um :tenantId, o tenant é sempre o do usuário logado). Rota
// protegida por RequireEscritaConfiguracao (ADMIN-only), mesmo guard de
// Minha Assinatura (ver App.tsx) — o backend (requireEscritaConfiguracao em
// routes/usuarios.ts) já bloqueia com 403 mesmo que alguém contorne a UI.

const field = 'w-full h-11 rounded-lg border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface placeholder:text-outline outline-none transition-colors focus:border-2 focus:border-primary'
const card = 'bg-surface p-6 rounded-3xl border border-outline-variant'

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Visualizador',
}

const ROLE_OPCOES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Visualizador' },
]

interface EditForm {
  nome: string
  role: AdminRole
  ativo: boolean
}

// Validade do convite é fixa em 7 dias no backend (CONVITE_VALIDADE_DIAS em
// server/src/lib/convites.ts) — nunca exposta por nenhuma resposta de API,
// então o texto do modal é um literal, não um valor calculado. Se o backend
// mudar essa constante, este texto precisa ser atualizado junto (não há
// como derivar automaticamente sem alterar o contrato da API).
const CONVITE_VALIDADE_DIAS_TEXTO = 'O convite será válido por 7 dias.'

// Mesmo cálculo de dias restantes já usado em AvisoComercial.tsx/
// MinhaAssinatura.tsx (diasRestantes) — duplicado de propósito, sem
// utilitário compartilhado ainda pra "dias até uma data". Aqui a comparação
// de "hoje" é por dia civil (toDateString), não por 24h corridas, pra
// "Expira hoje" bater com o que o usuário lê no calendário, não com um
// múltiplo exato de 24h desde agora.
function tempoRestanteConvite(expiresAtISO: string, expirado: boolean): string {
  if (expirado) return 'Expirado'
  const agora = new Date()
  const expira = new Date(expiresAtISO)
  if (expira.toDateString() === agora.toDateString()) return 'Expira hoje'
  const dias = Math.max(1, Math.ceil((expira.getTime() - agora.getTime()) / 86_400_000))
  return `Expira em ${dias} dia${dias === 1 ? '' : 's'}`
}

export function Usuarios() {
  const { user } = useAuth()

  const [dados, setDados] = useState<UsuariosResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Feedback de sucesso ────────────────────────────────────────────────
  // Mesmo padrão já usado em admin/Tenants.tsx (resetSucesso/billingSucesso)
  // — este app não tem um sistema de toast flutuante, então o "toast" daqui
  // é um banner tertiary no topo da página, só que autodispensável (some
  // sozinho depois de alguns segundos), pra servir às várias ações desta
  // tela sem um banner por ação. sucessoTimeout garante que uma segunda
  // ação não seja apagada pelo timer da primeira.
  const [sucesso, setSucesso] = useState<string | null>(null)
  const sucessoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mostrarSucesso = (mensagem: string) => {
    if (sucessoTimeout.current) clearTimeout(sucessoTimeout.current)
    setSucesso(mensagem)
    sucessoTimeout.current = setTimeout(() => setSucesso(null), 4000)
  }
  useEffect(() => () => { if (sucessoTimeout.current) clearTimeout(sucessoTimeout.current) }, [])

  // ─── Adicionar usuário — duas formas de criar acesso (ver
  // criarUsuarioComSenha/criarConvite em server/src/controllers/usuarios.ts):
  // "convite" manda um e-mail com link pra a própria pessoa definir a senha
  // (fluxo original, inalterado); "senha" cria o AdminUser imediatamente com
  // uma senha temporária definida pelo ADMIN, forçando troca no primeiro
  // login pelo fluxo já existente (POST /auth/trocar-senha). `modoAdicionar`
  // só decide qual formulário/rota usar — nome/role/permissões são
  // compartilhados pelas duas variáveis de estado abaixo, sem duplicar.
  const [mostrarConvite, setMostrarConvite] = useState(false)
  const [modoAdicionar, setModoAdicionar] = useState<'convite' | 'senha'>('convite')
  const [conviteNome, setConviteNome] = useState('')
  const [conviteEmail, setConviteEmail] = useState('')
  const [conviteRole, setConviteRole] = useState<AdminRole>('EDITOR')
  const [convitePersonalizarPermissoes, setConvitePersonalizarPermissoes] = useState(false)
  const [conviteMatriz, setConviteMatriz] = useState<MatrizPermissoes>(() => matrizInicialPorRole('EDITOR'))
  const [conviteSenha, setConviteSenha] = useState('')
  const [conviteConfirmarSenha, setConviteConfirmarSenha] = useState('')
  const [convidando, setConvidando] = useState(false)
  const [conviteErro, setConviteErro] = useState<string | null>(null)

  // ─── Reenviar convite ───────────────────────────────────────────────────
  const [reenviandoId, setReenviandoId] = useState<string | null>(null)

  // ─── Editar usuário ───────────────────────────────────────────────────
  const [editando, setEditando] = useState<AdminDoTenant | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ nome: '', role: 'EDITOR', ativo: true })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [edicaoErro, setEdicaoErro] = useState<string | null>(null)

  // ─── Remover usuário / cancelar convite (mesmo ConfirmDialog) ──────────
  const [confirmRemover, setConfirmRemover] = useState<AdminDoTenant | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [confirmCancelar, setConfirmCancelar] = useState<ConvitePendente | null>(null)
  const [cancelando, setCancelando] = useState(false)

  // ─── Permissões (reaproveita PermissoesUsuarioModal de Gestão SaaS) ────
  const [permissoesAlvo, setPermissoesAlvo] = useState<AdminDoTenant | null>(null)
  const [permissoesForm, setPermissoesForm] = useState<FormPermissoes | null>(null)
  const [permissoesLoading, setPermissoesLoading] = useState(false)
  const [permissoesSaving, setPermissoesSaving] = useState(false)
  const [permissoesError, setPermissoesError] = useState<string | null>(null)

  const carregar = () => {
    setLoading(true)
    setError(null)
    get<UsuariosResposta>('/usuarios')
      .then(setDados)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar usuários.'))
      .finally(() => setLoading(false))
  }

  useEffect(carregar, [])

  const capacidadeTexto = dados
    ? `${dados.capacidade.usados} de ${dados.capacidade.limite ?? '∞'} acessos utilizados`
    : ''
  const capacidadeAtingida = dados?.capacidade.limite != null && dados.capacidade.usados >= dados.capacidade.limite

  // ─── Adicionar usuário ──────────────────────────────────────────────────
  const abrirConvite = () => {
    setModoAdicionar('convite')
    setConviteNome('')
    setConviteEmail('')
    setConviteRole('EDITOR')
    setConvitePersonalizarPermissoes(false)
    setConviteMatriz(matrizInicialPorRole('EDITOR'))
    setConviteSenha('')
    setConviteConfirmarSenha('')
    setConviteErro(null)
    setMostrarConvite(true)
  }

  const alterarConviteRole = (role: AdminRole) => {
    setConviteRole(role)
    // Sem personalização ativa, a matriz acompanha a role escolhida (mesmo
    // ponto de partida de matrizInicialPorRole usado na edição de um
    // usuário já existente) — só deixa de acompanhar quando o admin liga o
    // toggle de personalização.
    if (!convitePersonalizarPermissoes) setConviteMatriz(matrizInicialPorRole(role))
  }

  const enviarConvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (convidando) return
    setConvidando(true)
    setConviteErro(null)
    try {
      await post('/usuarios/convites', {
        email: conviteEmail.trim(),
        role: conviteRole,
        // Só manda `permissoes` quando personalizado — omitir o campo
        // (undefined) é o que o backend trata como "convite sem
        // personalização" (ver validarPayloadConvite em usuarios.ts), nunca
        // mandar a matriz padrão da role à toa.
        ...(convitePersonalizarPermissoes ? montarPayloadPermissoes(conviteMatriz) : {}),
      })
      setMostrarConvite(false)
      mostrarSucesso(`Convite enviado para ${conviteEmail.trim()}.`)
      carregar()
    } catch (e) {
      setConviteErro(e instanceof Error ? e.message : 'Erro ao enviar convite.')
    } finally {
      setConvidando(false)
    }
  }

  // Segunda forma de criar acesso — cria o AdminUser imediatamente com
  // senha_temporaria:true (ver criarUsuarioComSenha em
  // server/src/controllers/usuarios.ts), sem passar pelo link de convite.
  const criarComSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    if (convidando) return
    if (conviteSenha !== conviteConfirmarSenha) {
      setConviteErro('As senhas não coincidem.')
      return
    }
    setConvidando(true)
    setConviteErro(null)
    try {
      await post('/usuarios', {
        nome: conviteNome.trim(),
        email: conviteEmail.trim(),
        role: conviteRole,
        senha: conviteSenha,
        confirmar_senha: conviteConfirmarSenha,
        ...(convitePersonalizarPermissoes ? montarPayloadPermissoes(conviteMatriz) : {}),
      })
      setMostrarConvite(false)
      mostrarSucesso(`Usuário ${conviteNome.trim()} criado com senha temporária.`)
      carregar()
    } catch (e) {
      setConviteErro(e instanceof Error ? e.message : 'Erro ao criar usuário.')
    } finally {
      setConvidando(false)
    }
  }

  // ─── Reenviar convite ───────────────────────────────────────────────────
  // Renova token/prazo (link antigo deixa de valer) e revalida capacidade no
  // backend (ver reenviarConvite em controllers/usuarios.ts) — disponível
  // tanto pra convite ainda pendente quanto expirado.
  const reenviarConvite = async (convite: ConvitePendente) => {
    if (reenviandoId) return
    setReenviandoId(convite.id)
    setError(null)
    try {
      await post(`/usuarios/convites/${convite.id}/reenviar`, {})
      mostrarSucesso(`Convite reenviado para ${convite.email}.`)
      carregar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reenviar convite.')
    } finally {
      setReenviandoId(null)
    }
  }

  // ─── Editar usuário ───────────────────────────────────────────────────
  const abrirEditar = (usuario: AdminDoTenant) => {
    setEditando(usuario)
    setEditForm({ nome: usuario.nome, role: usuario.role, ativo: usuario.ativo })
    setEdicaoErro(null)
  }

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando || salvandoEdicao) return
    setSalvandoEdicao(true)
    setEdicaoErro(null)
    try {
      await put(`/usuarios/${editando.id}`, { nome: editForm.nome.trim(), role: editForm.role, ativo: editForm.ativo })
      setEditando(null)
      mostrarSucesso('Acesso atualizado.')
      carregar()
    } catch (e) {
      setEdicaoErro(e instanceof Error ? e.message : 'Erro ao salvar acesso.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  // ─── Remover usuário / cancelar convite ────────────────────────────────
  // "Remover" (usuário ativo) -> DELETE /:id (desativa, nunca hard delete).
  // "Reativar" (usuário já inativo) -> PUT /:id com ativo:true, preservando
  // nome/role atuais — DELETE só sabe desativar, nunca o inverso.
  const confirmarRemover = async () => {
    if (!confirmRemover) return
    setRemovendo(true)
    try {
      if (confirmRemover.ativo) {
        await del(`/usuarios/${confirmRemover.id}`)
        mostrarSucesso('Acesso removido.')
      } else {
        await put(`/usuarios/${confirmRemover.id}`, { nome: confirmRemover.nome, role: confirmRemover.role, ativo: true })
        mostrarSucesso('Acesso reativado.')
      }
      setConfirmRemover(null)
      carregar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar acesso.')
      setConfirmRemover(null)
    } finally {
      setRemovendo(false)
    }
  }

  const confirmarCancelarConvite = async () => {
    if (!confirmCancelar) return
    setCancelando(true)
    try {
      await del(`/usuarios/convites/${confirmCancelar.id}`)
      setConfirmCancelar(null)
      mostrarSucesso('Convite cancelado.')
      carregar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao cancelar convite.')
      setConfirmCancelar(null)
    } finally {
      setCancelando(false)
    }
  }

  // ─── Permissões — mesmo fluxo de Tenants.tsx (abrirPermissoes/
  // salvarPermissoes), só o path da API muda.
  const abrirPermissoes = (usuario: AdminDoTenant) => {
    setPermissoesAlvo(usuario)
    setPermissoesForm(null)
    setPermissoesError(null)
    setPermissoesLoading(true)
    get<PermissoesUsuario>(`/usuarios/${usuario.id}/permissoes`)
      .then(resp => setPermissoesForm(formularioInicialDePermissoes(resp)))
      .catch(e => setPermissoesError(e instanceof Error ? e.message : 'Erro ao carregar permissões.'))
      .finally(() => setPermissoesLoading(false))
  }

  const fecharPermissoes = () => {
    setPermissoesAlvo(null)
    setPermissoesForm(null)
    setPermissoesError(null)
  }

  const alternarPersonalizado = (v: boolean) => {
    setPermissoesForm(prev => (prev ? { ...prev, personalizado: v } : prev))
  }

  const alterarNivelModulo = (modulo: ModuloPainel, nivel: NivelAcessoModulo) => {
    setPermissoesForm(prev => (prev ? { ...prev, matriz: { ...prev.matriz, [modulo]: nivel } } : prev))
  }

  const salvarPermissoes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!permissoesAlvo || !permissoesForm || permissoesSaving) return
    setPermissoesSaving(true)
    setPermissoesError(null)
    const path = `/usuarios/${permissoesAlvo.id}/permissoes`
    try {
      if (metodoParaSalvarPermissoes(permissoesForm.personalizado) === 'PUT') {
        await put(path, montarPayloadPermissoes(permissoesForm.matriz))
      } else {
        await del(path)
      }
      fecharPermissoes()
      mostrarSucesso('Permissões atualizadas.')
      carregar()
    } catch (e) {
      setPermissoesError(e instanceof Error ? e.message : 'Erro ao salvar permissões.')
    } finally {
      setPermissoesSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error && !dados) return <ErrorState message={error} onRetry={carregar} />
  if (!dados) return null

  return (
    <div>
      <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
        {sucesso && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-xl text-body-md bg-tertiary/10 text-tertiary">
            <span className="material-symbols-outlined text-[18px] shrink-0">check_circle</span>
            {sucesso}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-xl text-body-md bg-error-container text-on-error-container">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            {error}
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Usuários</h3>
              <p className="text-body-md text-on-surface-variant mt-0.5">Gerencie quem tem acesso a este workspace.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`px-3 py-1.5 rounded-full text-label-md font-semibold ${capacidadeAtingida ? 'bg-error-container text-on-error-container' : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}>
                {capacidadeTexto}
              </span>
              <Button
                onClick={abrirConvite}
                disabled={capacidadeAtingida}
                variant="gradient"
                size="lg"
                className="shrink-0"
                iconLeft={<span className="material-symbols-outlined text-[18px]">person_add</span>}
              >
                Adicionar usuário
              </Button>
            </div>
          </div>

          {capacidadeAtingida && (
            <div className="flex items-center gap-2 px-5 py-3 border-b border-outline-variant/30 bg-error-container/30 text-on-error-container text-body-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
              Limite de acessos do plano atingido. Remova um acesso ou fale com o suporte para aumentar seu plano.
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 p-5">
      <div className={card}>
        <h2 className="text-title-md font-bold text-on-surface mb-4">Acessos</h2>
        {dados.usuarios.length === 0 ? (
          <EmptyState icon="group" title="Nenhum usuário" description="Convide alguém do seu time para colaborar." />
        ) : (
          <div className="divide-y divide-outline-variant">
            {dados.usuarios.map(usuario => (
              <div key={usuario.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-body-md font-semibold text-on-surface truncate">{usuario.nome}</p>
                    {usuario.id === user?.id && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary">Você</span>
                    )}
                    {!usuario.ativo && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-error-container text-error">Inativo</span>
                    )}
                    {rotuloIndicadorPersonalizacao(usuario.permissoes_personalizadas) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-outline-variant/30 text-outline">
                        {rotuloIndicadorPersonalizacao(usuario.permissoes_personalizadas)}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-on-surface-variant truncate">{usuario.email} · {ROLE_LABEL[usuario.role]}</p>
                </div>
                {usuario.role !== 'SUPER_ADMIN' && usuario.id !== user?.id && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {podeReceberPersonalizacao(usuario.role) && (
                      <Button variant="ghost" size="sm" onClick={() => abrirPermissoes(usuario)}>Permissões</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(usuario)}>Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemover(usuario)}>
                      {usuario.ativo ? 'Remover' : 'Reativar'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={card}>
        <h2 className="text-title-md font-bold text-on-surface mb-4">Convites pendentes</h2>
        {dados.convites.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">Nenhum convite pendente.</p>
        ) : (
          <div className="divide-y divide-outline-variant">
            {dados.convites.map(convite => (
              <div key={convite.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-body-md font-semibold text-on-surface truncate">{convite.email}</p>
                    {convite.expirado && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-error-container text-error">Expirado</span>
                    )}
                  </div>
                  <p className="text-[12px] text-on-surface-variant">
                    {ROLE_LABEL[convite.role]} · convidado por {convite.convidado_por_nome ?? 'usuário removido'} ·{' '}
                    {tempoRestanteConvite(convite.expires_at, convite.expirado)} ({formatDateCivil(convite.expires_at)})
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" disabled={reenviandoId === convite.id} onClick={() => reenviarConvite(convite)}>
                    {reenviandoId === convite.id ? 'Reenviando…' : 'Reenviar'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmCancelar(convite)}>Cancelar</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
          </div>
        </div>
      </section>

      {/* Modal "Adicionar usuário" — duas formas de criar acesso */}
      {mostrarConvite && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Adicionar usuário</h3>
              <button onClick={() => setMostrarConvite(false)} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={modoAdicionar === 'convite' ? enviarConvite : criarComSenha} className="px-5 py-4 space-y-4">
              {conviteErro && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{conviteErro}</div>}

              {/* Alternância entre as duas formas de criar acesso */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-container-low border border-outline-variant/60">
                <button
                  type="button"
                  disabled={convidando}
                  onClick={() => setModoAdicionar('convite')}
                  className={`py-2 rounded-lg text-label-md font-semibold transition-colors ${modoAdicionar === 'convite' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant'}`}
                >
                  Enviar convite por e-mail
                </button>
                <button
                  type="button"
                  disabled={convidando}
                  onClick={() => setModoAdicionar('senha')}
                  className={`py-2 rounded-lg text-label-md font-semibold transition-colors ${modoAdicionar === 'senha' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant'}`}
                >
                  Criar com senha temporária
                </button>
              </div>

              {modoAdicionar === 'senha' && (
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                  <input
                    required
                    value={conviteNome}
                    onChange={e => setConviteNome(e.target.value)}
                    placeholder="Nome completo"
                    className={field}
                  />
                </div>
              )}

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail <span className="text-error">*</span></label>
                <input
                  required
                  type="email"
                  value={conviteEmail}
                  onChange={e => setConviteEmail(e.target.value)}
                  placeholder="pessoa@empresa.com"
                  className={field}
                />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Papel</label>
                <Select value={conviteRole} options={ROLE_OPCOES} onChange={v => alterarConviteRole(v as AdminRole)} />
              </div>

              {modoAdicionar === 'convite' ? (
                <p className="text-[12px] text-on-surface-variant">{CONVITE_VALIDADE_DIAS_TEXTO}</p>
              ) : (
                <>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Senha temporária <span className="text-error">*</span></label>
                    <input
                      required
                      type="password"
                      value={conviteSenha}
                      onChange={e => setConviteSenha(e.target.value)}
                      placeholder="Mínimo 8 caracteres, maiúscula, minúscula, número e símbolo"
                      className={field}
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Confirmar senha <span className="text-error">*</span></label>
                    <input
                      required
                      type="password"
                      value={conviteConfirmarSenha}
                      onChange={e => setConviteConfirmarSenha(e.target.value)}
                      className={field}
                    />
                  </div>
                  <p className="text-[12px] text-on-surface-variant">O usuário deverá alterar esta senha no primeiro acesso.</p>
                </>
              )}

              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
                <ToggleSwitch checked={convitePersonalizarPermissoes} onChange={setConvitePersonalizarPermissoes} disabled={convidando} />
                <label
                  onClick={() => !convidando && setConvitePersonalizarPermissoes(v => !v)}
                  className="text-body-md text-on-surface cursor-pointer select-none"
                >
                  {modoAdicionar === 'convite' ? 'Personalizar permissões deste convite' : 'Personalizar permissões deste usuário'}
                </label>
              </div>

              {convitePersonalizarPermissoes && (
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-outline">Módulos</h4>
                  {MODULOS_PAINEL.map(modulo => (
                    <div key={modulo} className="flex items-center justify-between gap-3">
                      <span className="text-body-md text-on-surface">{MODULO_LABEL[modulo]}</span>
                      <div className="w-40 shrink-0">
                        <Select
                          size="sm"
                          value={conviteMatriz[modulo]}
                          options={NIVEL_OPCOES}
                          disabled={convidando}
                          onChange={v => setConviteMatriz(m => ({ ...m, [modulo]: v as NivelAcessoModulo }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setMostrarConvite(false)} variant="ghost" disabled={convidando}>Cancelar</Button>
                <Button type="submit" disabled={convidando} size="md">
                  {modoAdicionar === 'convite'
                    ? (convidando ? 'Enviando…' : 'Enviar convite')
                    : (convidando ? 'Criando…' : 'Criar usuário')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal "Editar acesso" */}
      {editando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Editar acesso</h3>
              <button onClick={() => setEditando(null)} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={salvarEdicao} className="px-5 py-4 space-y-4">
              {edicaoErro && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{edicaoErro}</div>}
              <p className="text-body-md text-on-surface-variant">{editando.email}</p>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                <input
                  required
                  value={editForm.nome}
                  onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                  className={field}
                />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Papel</label>
                <Select value={editForm.role} options={ROLE_OPCOES} onChange={v => setEditForm(f => ({ ...f, role: v as AdminRole }))} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setEditando(null)} variant="ghost" disabled={salvandoEdicao}>Cancelar</Button>
                <Button type="submit" disabled={salvandoEdicao} size="md">{salvandoEdicao ? 'Salvando…' : 'Salvar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {permissoesAlvo && (
        <PermissoesUsuarioModal
          usuario={permissoesAlvo}
          loading={permissoesLoading}
          saving={permissoesSaving}
          error={permissoesError}
          form={permissoesForm}
          onClose={fecharPermissoes}
          onSubmit={salvarPermissoes}
          onTogglePersonalizado={alternarPersonalizado}
          onChangeModulo={alterarNivelModulo}
        />
      )}

      {confirmRemover && (
        <ConfirmDialog
          title={confirmRemover.ativo ? `Remover acesso de "${confirmRemover.nome}"?` : `Reativar acesso de "${confirmRemover.nome}"?`}
          description={confirmRemover.ativo
            ? 'O usuário perde o acesso ao painel imediatamente. Você pode reativar depois.'
            : 'O usuário volta a poder acessar o painel com o papel atual.'}
          confirmLabel={confirmRemover.ativo ? 'Remover' : 'Reativar'}
          variant={confirmRemover.ativo ? 'danger' : 'default'}
          loading={removendo}
          onConfirm={confirmarRemover}
          onCancel={() => setConfirmRemover(null)}
        />
      )}

      {confirmCancelar && (
        <ConfirmDialog
          title={`Cancelar convite para "${confirmCancelar.email}"?`}
          description="O link enviado por e-mail deixa de funcionar."
          confirmLabel="Cancelar convite"
          variant="danger"
          loading={cancelando}
          onConfirm={confirmarCancelarConvite}
          onCancel={() => setConfirmCancelar(null)}
        />
      )}
    </div>
  )
}
