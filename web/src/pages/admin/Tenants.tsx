import { useEffect, useState } from 'react'
import { get, post, put } from '../../services/api'
import type { AdminDoTenant, AdminRole, PlanoAdmin, TenantAdminItem, TenantStatus } from '../../types'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { AdminSaasTabs } from '../../components/admin/AdminSaasTabs'
import { gerarSlug, formatDate, formatDateTime, toInputDate } from '../../utils/campanha'

const STATUS_OPCOES: { value: TenantStatus; label: string }[] = [
  { value: 'TRIAL', label: 'Teste grátis' },
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'EXPIRED', label: 'Expirado' },
  { value: 'SUSPENDED', label: 'Suspenso' },
  { value: 'CANCELED', label: 'Cancelado' },
]

const FILTRO_STATUS_OPCOES = [{ value: '', label: 'Todos' }, ...STATUS_OPCOES]

type Situacao = 'trial_ativo' | 'trial_vencido' | 'licenca_ativa' | 'licenca_vencida' | 'suspenso' | 'cancelado'
type FiltroSituacao = '' | Situacao

const FILTRO_SITUACAO_OPCOES: { value: FiltroSituacao; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'trial_ativo', label: 'Trial ativo' },
  { value: 'trial_vencido', label: 'Trial vencido' },
  { value: 'licenca_ativa', label: 'Licença ativa' },
  { value: 'licenca_vencida', label: 'Licença vencida' },
  { value: 'suspenso', label: 'Suspenso' },
  { value: 'cancelado', label: 'Cancelado' },
]

// Estado comercial derivado (status + datas) — complementar ao filtro de
// Status (valor bruto do enum). TRIAL usa trial_fim; ACTIVE usa licenca_fim;
// EXPIRED representa trial OU licença vencida (licenca_fim preenchido decide
// qual); SUSPENDED/CANCELED vêm direto do status, sem olhar data nenhuma.
// Datas ausentes nunca contam como "vencido" (sem trial_fim/licenca_fim
// definido = ainda sem prazo pra vencer).
function classificarSituacao(tenant: Pick<TenantAdminItem, 'status' | 'trial_fim' | 'licenca_fim'>): Situacao {
  if (tenant.status === 'SUSPENDED') return 'suspenso'
  if (tenant.status === 'CANCELED') return 'cancelado'

  const venceu = (data: string | null) => data != null && new Date(data).getTime() < Date.now()

  if (tenant.status === 'TRIAL') return venceu(tenant.trial_fim) ? 'trial_vencido' : 'trial_ativo'
  if (tenant.status === 'ACTIVE') return venceu(tenant.licenca_fim) ? 'licenca_vencida' : 'licenca_ativa'
  // EXPIRED
  return tenant.licenca_fim ? 'licenca_vencida' : 'trial_vencido'
}

const STATUS_BADGE: Record<TenantStatus, { label: string; className: string }> = {
  TRIAL: { label: 'Teste grátis', className: 'bg-primary/10 text-primary' },
  ACTIVE: { label: 'Ativo', className: 'bg-tertiary/10 text-tertiary' },
  EXPIRED: { label: 'Expirado', className: 'bg-error-container text-error' },
  SUSPENDED: { label: 'Suspenso', className: 'bg-error-container text-error' },
  CANCELED: { label: 'Cancelado', className: 'bg-outline-variant/30 text-outline' },
}

function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const { label, className } = STATUS_BADGE[status]
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase whitespace-nowrap ${className}`}>{label}</span>
}

// Papéis atribuíveis a um usuário DO CLIENTE — SUPER_ADMIN nunca aparece
// aqui de propósito (só existe fora desse fluxo, ver requireSuperAdmin.ts).
const ROLE_ACESSO_OPCOES: { value: AdminRole; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Visualizador' },
]

const ROLE_BADGE: Partial<Record<AdminRole, { label: string; className: string }>> = {
  ADMIN: { label: 'Admin', className: 'bg-primary/10 text-primary' },
  EDITOR: { label: 'Editor', className: 'bg-tertiary/10 text-tertiary' },
  VIEWER: { label: 'Visualizador', className: 'bg-outline-variant/30 text-outline' },
}

function RoleBadge({ role }: { role: AdminRole }) {
  const cfg = ROLE_BADGE[role] ?? { label: role, className: 'bg-outline-variant/30 text-outline' }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>
}

const EMPTY_ACESSO_FORM = { nome: '', email: '', senha: '', role: 'ADMIN' as AdminRole }

const EMPTY_FORM = {
  nome: '',
  slug: '',
  plano_id: '',
  status: 'TRIAL' as TenantStatus,
  trial_inicio: '',
  trial_fim: '',
  licenca_inicio: '',
  licenca_fim: '',
  proxima_cobranca: '',
  ultimo_pagamento_em: '',
  observacao_comercial: '',
  // Administrador inicial — só usado ao criar (ver salvar()); ignorados na
  // edição, mesmo que fiquem preenchidos no estado por algum motivo.
  admin_nome: '',
  admin_email: '',
  admin_password: '',
  admin_password_confirm: '',
}

type FormState = typeof EMPTY_FORM

const field =
  'w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors'

const sectionHeader = 'text-[11px] font-bold uppercase tracking-wider text-outline'

const DIAS_TRIAL_PADRAO = 14

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function maisDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function AdminTenantsIndex() {
  const [tenants, setTenants] = useState<TenantAdminItem[]>([])
  const [planos, setPlanos] = useState<PlanoAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<TenantAdminItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Modal "Acessos" — lista/cria/edita usuários (ADMIN/EDITOR/VIEWER) DO
  // CLIENTE selecionado. Nunca confundir com o próprio SUPER_ADMIN.
  const [acessosModalTenant, setAcessosModalTenant] = useState<TenantAdminItem | null>(null)
  const [acessos, setAcessos] = useState<AdminDoTenant[]>([])
  const [acessosLoading, setAcessosLoading] = useState(false)
  const [acessosError, setAcessosError] = useState<string | null>(null)
  const [togglingAcesso, setTogglingAcesso] = useState<string | null>(null)

  // Formulário de novo acesso / edição de acesso — reaproveitado pros dois
  // casos (editandoAcesso null = criando).
  const [mostrarFormAcesso, setMostrarFormAcesso] = useState(false)
  const [editandoAcesso, setEditandoAcesso] = useState<AdminDoTenant | null>(null)
  const [acessoForm, setAcessoForm] = useState(EMPTY_ACESSO_FORM)
  const [salvandoAcesso, setSalvandoAcesso] = useState(false)
  const [acessoFormError, setAcessoFormError] = useState<string | null>(null)

  // Mini-modal de reset de senha, empilhado por cima do modal de Acessos.
  const [resetandoSenhaDe, setResetandoSenhaDe] = useState<AdminDoTenant | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSucesso, setResetSucesso] = useState<string | null>(null)

  const [copiado, setCopiado] = useState<string | null>(null)
  const [mudandoStatus, setMudandoStatus] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<TenantStatus | ''>('')
  const [filtroPlanoId, setFiltroPlanoId] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('')

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([get<TenantAdminItem[]>('/admin/tenants'), get<PlanoAdmin[]>('/admin/planos')])
      .then(([t, p]) => { setTenants(t); setPlanos(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (key: keyof FormState, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const abrirNovo = () => {
    setEditando(null)
    const inicio = hojeISO()
    setForm({ ...EMPTY_FORM, trial_inicio: inicio, trial_fim: maisDias(inicio, DIAS_TRIAL_PADRAO) })
    setFormError(null)
    setShowForm(true)
  }

  const abrirEditar = (tenant: TenantAdminItem) => {
    setEditando(tenant)
    setForm({
      nome: tenant.nome,
      slug: tenant.slug,
      plano_id: tenant.plano_id ?? '',
      status: tenant.status,
      trial_inicio: toInputDate(tenant.trial_inicio),
      trial_fim: toInputDate(tenant.trial_fim),
      licenca_inicio: toInputDate(tenant.licenca_inicio),
      licenca_fim: toInputDate(tenant.licenca_fim),
      proxima_cobranca: toInputDate(tenant.proxima_cobranca),
      ultimo_pagamento_em: toInputDate(tenant.ultimo_pagamento_em),
      observacao_comercial: tenant.observacao_comercial ?? '',
      admin_nome: '',
      admin_email: '',
      admin_password: '',
      admin_password_confirm: '',
    })
    setFormError(null)
    setShowForm(true)
  }

  const fecharForm = () => {
    setShowForm(false)
    setEditando(null)
    setFormError(null)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()

    // Administrador inicial só é exigido ao criar — edição nunca valida nem
    // envia esses campos (ver payload abaixo).
    if (!editando) {
      if (!form.admin_nome.trim() || !form.admin_email.trim() || !form.admin_password) {
        setFormError('Preencha os dados do administrador inicial.')
        return
      }
      if (form.admin_password.length < 8) {
        setFormError('A senha do administrador precisa ter pelo menos 8 caracteres.')
        return
      }
      if (form.admin_password !== form.admin_password_confirm) {
        setFormError('A confirmação de senha não confere.')
        return
      }
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        nome: form.nome.trim(),
        slug: form.slug.trim(),
        plano_id: form.plano_id || null,
        status: form.status,
        trial_inicio: form.trial_inicio || null,
        trial_fim: form.trial_fim || null,
        licenca_inicio: form.licenca_inicio || null,
        licenca_fim: form.licenca_fim || null,
        proxima_cobranca: form.proxima_cobranca || null,
        ultimo_pagamento_em: form.ultimo_pagamento_em || null,
        observacao_comercial: form.observacao_comercial.trim() || null,
        ...(editando ? {} : {
          admin_nome: form.admin_nome.trim(),
          admin_email: form.admin_email.trim(),
          admin_password: form.admin_password,
        }),
      }
      if (editando) {
        await put(`/admin/tenants/${editando.id}`, payload)
      } else {
        await post('/admin/tenants', payload)
      }
      fecharForm()
      load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const mudarStatus = async (tenant: TenantAdminItem, novoStatus: TenantStatus) => {
    if ((novoStatus === 'SUSPENDED' || novoStatus === 'CANCELED')) {
      const acao = novoStatus === 'SUSPENDED' ? 'suspender' : 'cancelar'
      if (!window.confirm(`Deseja ${acao} o cliente "${tenant.nome}"? Isso bloqueia a escrita no painel dele.`)) return
    }
    setMudandoStatus(tenant.id)
    try {
      // Preserva todos os campos de trial/licença/observação do cliente —
      // omitir qualquer um aqui faria o PUT gravar null neles (validação do
      // backend trata campo ausente como "limpar").
      await put(`/admin/tenants/${tenant.id}`, {
        nome: tenant.nome,
        slug: tenant.slug,
        plano_id: tenant.plano_id,
        status: novoStatus,
        trial_inicio: tenant.trial_inicio,
        trial_fim: tenant.trial_fim,
        licenca_inicio: tenant.licenca_inicio,
        licenca_fim: tenant.licenca_fim,
        proxima_cobranca: tenant.proxima_cobranca,
        ultimo_pagamento_em: tenant.ultimo_pagamento_em,
        observacao_comercial: tenant.observacao_comercial,
      })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar status.')
    } finally {
      setMudandoStatus(null)
    }
  }

  const carregarAcessos = (tenantId: string) => {
    setAcessosLoading(true)
    setAcessosError(null)
    get<AdminDoTenant[]>(`/admin/tenants/${tenantId}/admins`)
      .then(setAcessos)
      .catch(e => setAcessosError(e instanceof Error ? e.message : 'Erro ao carregar acessos.'))
      .finally(() => setAcessosLoading(false))
  }

  const abrirAcessos = (tenant: TenantAdminItem) => {
    setAcessosModalTenant(tenant)
    setAcessos([])
    setMostrarFormAcesso(false)
    setEditandoAcesso(null)
    carregarAcessos(tenant.id)
  }

  const fecharAcessos = () => {
    setAcessosModalTenant(null)
    setMostrarFormAcesso(false)
    setEditandoAcesso(null)
    setAcessoFormError(null)
  }

  const abrirNovoAcesso = () => {
    setEditandoAcesso(null)
    setAcessoForm(EMPTY_ACESSO_FORM)
    setAcessoFormError(null)
    setMostrarFormAcesso(true)
  }

  const abrirEditarAcesso = (acesso: AdminDoTenant) => {
    setEditandoAcesso(acesso)
    setAcessoForm({ nome: acesso.nome, email: acesso.email, senha: '', role: acesso.role })
    setAcessoFormError(null)
    setMostrarFormAcesso(true)
  }

  const fecharFormAcesso = () => {
    setMostrarFormAcesso(false)
    setEditandoAcesso(null)
    setAcessoFormError(null)
  }

  const salvarAcesso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acessosModalTenant) return
    setSalvandoAcesso(true)
    setAcessoFormError(null)
    try {
      if (editandoAcesso) {
        // ativo não muda por aqui — é a ação separada "Ativar/Desativar" na
        // linha (ver alternarAtivoAcesso) que mexe só nesse campo.
        await put(`/admin/tenants/${acessosModalTenant.id}/admins/${editandoAcesso.id}`, {
          nome: acessoForm.nome.trim(),
          role: acessoForm.role,
          ativo: editandoAcesso.ativo,
        })
      } else {
        if (!acessoForm.nome.trim() || !acessoForm.email.trim() || !acessoForm.senha) {
          setAcessoFormError('Preencha nome, e-mail e senha temporária.')
          setSalvandoAcesso(false)
          return
        }
        if (acessoForm.senha.length < 8) {
          setAcessoFormError('A senha precisa ter pelo menos 8 caracteres.')
          setSalvandoAcesso(false)
          return
        }
        await post(`/admin/tenants/${acessosModalTenant.id}/admins`, {
          nome: acessoForm.nome.trim(),
          email: acessoForm.email.trim(),
          senha: acessoForm.senha,
          role: acessoForm.role,
        })
      }
      fecharFormAcesso()
      carregarAcessos(acessosModalTenant.id)
      load()
    } catch (e) {
      setAcessoFormError(e instanceof Error ? e.message : 'Erro ao salvar acesso.')
    } finally {
      setSalvandoAcesso(false)
    }
  }

  const alternarAtivoAcesso = async (acesso: AdminDoTenant) => {
    if (!acessosModalTenant) return
    setTogglingAcesso(acesso.id)
    try {
      await put(`/admin/tenants/${acessosModalTenant.id}/admins/${acesso.id}`, {
        nome: acesso.nome,
        role: acesso.role,
        ativo: !acesso.ativo,
      })
      carregarAcessos(acessosModalTenant.id)
    } catch (e) {
      setAcessosError(e instanceof Error ? e.message : 'Erro ao atualizar acesso.')
    } finally {
      setTogglingAcesso(null)
    }
  }

  const abrirResetSenha = (acesso: AdminDoTenant) => {
    setResetandoSenhaDe(acesso)
    setNovaSenha('')
    setResetError(null)
    setResetSucesso(null)
  }

  const fecharResetSenha = () => {
    setResetandoSenhaDe(null)
    setResetError(null)
    setResetSucesso(null)
  }

  const resetarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acessosModalTenant || !resetandoSenhaDe) return
    if (novaSenha.length < 8) {
      setResetError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setResetSaving(true)
    setResetError(null)
    try {
      await post(`/admin/tenants/${acessosModalTenant.id}/admins/${resetandoSenhaDe.id}/reset-password`, { nova_senha: novaSenha })
      setResetSucesso('Senha redefinida. A senha temporária deve ser enviada manualmente ao cliente. Envio automático será implementado futuramente.')
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Erro ao redefinir senha.')
    } finally {
      setResetSaving(false)
    }
  }

  const copiarPublicKey = (publicKey: string) => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopiado(publicKey)
      setTimeout(() => setCopiado(null), 1500)
    })
  }

  const planoOpcoes = [{ value: '', label: 'Sem plano' }, ...planos.map(p => ({ value: p.id, label: p.nome }))]
  const filtroPlanoOpcoes = [{ value: '', label: 'Todos' }, ...planos.map(p => ({ value: p.id, label: p.nome }))]

  // Lista já vem inteira do backend (painel interno, poucos clientes) — os
  // filtros abaixo são só client-side, sem round-trip extra pro servidor.
  const clientesFiltrados = tenants.filter(tenant => {
    if (busca.trim()) {
      const q = busca.trim().toLowerCase().replace(/^#/, '')
      const bate =
        tenant.nome.toLowerCase().includes(q) ||
        tenant.slug.toLowerCase().includes(q) ||
        String(tenant.codigo).includes(q) ||
        tenant.public_key.toLowerCase().includes(q)
      if (!bate) return false
    }
    if (filtroStatus && tenant.status !== filtroStatus) return false
    if (filtroPlanoId && tenant.plano_id !== filtroPlanoId) return false
    if (filtroSituacao && classificarSituacao(tenant) !== filtroSituacao) return false
    return true
  })

  return (
    <div className="px-4 lg:px-margin-desktop py-5">
      <AdminSaasTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">Clientes</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            Clientes do UserPulse — venda, teste grátis e liberação de acesso.
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-sm hover:opacity-90 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Cliente
        </button>
      </div>

      {/* Filtros — tudo client-side em cima da lista já carregada (painel
          interno, poucos clientes; ver comentário de clientesFiltrados). */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-outline pointer-events-none">search</span>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, slug, código ou public key…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select value={filtroStatus} options={FILTRO_STATUS_OPCOES} onChange={v => setFiltroStatus(v as TenantStatus | '')} placeholder="Status" size="sm" />
        </div>
        <div className="w-full sm:w-44">
          <Select value={filtroPlanoId} options={filtroPlanoOpcoes} onChange={setFiltroPlanoId} placeholder="Plano" size="sm" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={filtroSituacao} options={FILTRO_SITUACAO_OPCOES} onChange={v => setFiltroSituacao(v as FiltroSituacao)} placeholder="Situação" size="sm" />
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <div className="rounded-2xl border border-outline-variant overflow-x-auto">
          <table className="w-full min-w-[1200px] text-body-md">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-left text-[11px] uppercase tracking-wider text-outline">
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Plano</th>
                <th className="px-4 py-3 font-semibold">Trial até</th>
                <th className="px-4 py-3 font-semibold">Licença até</th>
                <th className="px-4 py-3 font-semibold">Próxima cobrança</th>
                <th className="px-4 py-3 font-semibold">Public key</th>
                <th className="px-4 py-3 font-semibold">Criado em</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-on-surface-variant">
                    {tenants.length === 0
                      ? 'Nenhum cliente cadastrado ainda.'
                      : 'Nenhum cliente encontrado para esses filtros.'}
                  </td>
                </tr>
              )}
              {clientesFiltrados.map(tenant => (
                <tr key={tenant.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] text-outline">#{tenant.codigo}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {tenant.nome}
                    <div className="text-[11px] text-on-surface-variant font-normal">{tenant._count.admins} admin(s)</div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.slug}</td>
                  <td className="px-4 py-3"><TenantStatusBadge status={tenant.status} /></td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.plano?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.trial_fim ? formatDate(tenant.trial_fim) : '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.licenca_fim ? formatDate(tenant.licenca_fim) : '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.proxima_cobranca ? formatDate(tenant.proxima_cobranca) : '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copiarPublicKey(tenant.public_key)}
                      title={tenant.public_key}
                      className="flex items-center gap-1.5 font-mono text-[12px] text-outline hover:text-primary transition-colors"
                    >
                      {tenant.public_key.slice(0, 8)}…
                      <span className="material-symbols-outlined text-[14px]">
                        {copiado === tenant.public_key ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{formatDateTime(tenant.criado_em)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5 flex-nowrap">
                      <button
                        onClick={() => abrirEditar(tenant)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => abrirAcessos(tenant)}
                        title="Acessos"
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">group</span>
                      </button>
                      {tenant.status !== 'SUSPENDED' && (
                        <button
                          onClick={() => mudarStatus(tenant, 'SUSPENDED')}
                          disabled={mudandoStatus === tenant.id}
                          title="Suspender"
                          className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">pause_circle</span>
                        </button>
                      )}
                      {(tenant.status === 'SUSPENDED' || tenant.status === 'EXPIRED') && (
                        <button
                          onClick={() => mudarStatus(tenant, 'ACTIVE')}
                          disabled={mudandoStatus === tenant.id}
                          title="Reativar"
                          className="p-1.5 rounded-lg text-tertiary hover:bg-tertiary/10 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">play_circle</span>
                        </button>
                      )}
                      {tenant.status !== 'CANCELED' && (
                        <button
                          onClick={() => mudarStatus(tenant, 'CANCELED')}
                          disabled={mudandoStatus === tenant.id}
                          title="Cancelar"
                          className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">cancel</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar/editar tenant */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">{editando ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button onClick={fecharForm} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="px-5 py-4 space-y-5">
              {formError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{formError}</div>}

              {editando && (
                <div className="flex gap-4 text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                  <span>Código: <strong className="text-on-surface">#{editando.codigo}</strong></span>
                  <span className="font-mono truncate">Public key: <strong className="text-on-surface">{editando.public_key}</strong></span>
                </div>
              )}

              <div className="space-y-4">
                <h4 className={sectionHeader}>Dados do cliente</h4>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                  <input
                    required
                    value={form.nome}
                    onChange={e => {
                      const nome = e.target.value
                      setForm(prev => ({ ...prev, nome, slug: editando ? prev.slug : gerarSlug(nome) }))
                    }}
                    placeholder="Ex: Clínica Acme"
                    className={field}
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Slug <span className="text-error">*</span></label>
                  <input required value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="Ex: clinica-acme" className={field} />
                </div>
              </div>

              <div className="space-y-4 pt-1 border-t border-outline-variant">
                <h4 className={`${sectionHeader} pt-4`}>Licença</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Plano</label>
                    <Select value={form.plano_id} options={planoOpcoes} onChange={v => set('plano_id', v)} />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Status</label>
                    <Select value={form.status} options={STATUS_OPCOES} onChange={v => set('status', v)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Trial início</label>
                    <input type="date" value={form.trial_inicio} onChange={e => set('trial_inicio', e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Trial fim</label>
                    <input type="date" value={form.trial_fim} onChange={e => set('trial_fim', e.target.value)} className={field} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Licença início</label>
                    <input type="date" value={form.licenca_inicio} onChange={e => set('licenca_inicio', e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Licença fim</label>
                    <input type="date" value={form.licenca_fim} onChange={e => set('licenca_fim', e.target.value)} className={field} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Próxima cobrança</label>
                    <input type="date" value={form.proxima_cobranca} onChange={e => set('proxima_cobranca', e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Último pagamento</label>
                    <input type="date" value={form.ultimo_pagamento_em} onChange={e => set('ultimo_pagamento_em', e.target.value)} className={field} />
                  </div>
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Observação comercial</label>
                  <textarea
                    value={form.observacao_comercial}
                    onChange={e => set('observacao_comercial', e.target.value)}
                    rows={2}
                    placeholder="Ex: negociando renovação, pagou via PIX direto…"
                    className={field}
                  />
                </div>
              </div>

              {!editando && (
                <div className="space-y-4 pt-1 border-t border-outline-variant">
                  <h4 className={`${sectionHeader} pt-4`}>Administrador do cliente</h4>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Nome do administrador <span className="text-error">*</span></label>
                    <input required value={form.admin_nome} onChange={e => set('admin_nome', e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail do administrador <span className="text-error">*</span></label>
                    <input required type="email" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} className={field} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Senha temporária <span className="text-error">*</span></label>
                      <input
                        required
                        minLength={8}
                        value={form.admin_password}
                        onChange={e => set('admin_password', e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Confirmar senha <span className="text-error">*</span></label>
                      <input
                        required
                        minLength={8}
                        value={form.admin_password_confirm}
                        onChange={e => set('admin_password_confirm', e.target.value)}
                        className={field}
                      />
                    </div>
                  </div>
                  <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                    A senha temporária deve ser enviada manualmente ao cliente. Envio automático de e-mail será implementado futuramente.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={fecharForm} className="px-4 py-2 rounded-xl border border-outline-variant text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-60">
                  {saving ? 'Salvando…' : editando ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Acessos — usuários (ADMIN/EDITOR/VIEWER) DO CLIENTE. Nunca
          confundir com o painel Gestão SaaS, que é exclusivo do super admin. */}
      {acessosModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Acessos — {acessosModalTenant.nome}</h3>
              <button onClick={fecharAcessos} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {acessosError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{acessosError}</div>}

              {!mostrarFormAcesso && (
                <button
                  onClick={abrirNovoAcesso}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold hover:opacity-90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Novo acesso
                </button>
              )}

              {mostrarFormAcesso && (
                <form onSubmit={salvarAcesso} className="rounded-xl border border-outline-variant p-4 space-y-3">
                  <h4 className={sectionHeader}>{editandoAcesso ? 'Editar acesso' : 'Novo acesso'}</h4>
                  {acessoFormError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{acessoFormError}</div>}

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                    <input
                      required
                      value={acessoForm.nome}
                      onChange={e => setAcessoForm(prev => ({ ...prev, nome: e.target.value }))}
                      className={field}
                    />
                  </div>
                  {!editandoAcesso && (
                    <>
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail <span className="text-error">*</span></label>
                        <input
                          required
                          type="email"
                          value={acessoForm.email}
                          onChange={e => setAcessoForm(prev => ({ ...prev, email: e.target.value }))}
                          className={field}
                        />
                      </div>
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">Senha temporária <span className="text-error">*</span></label>
                        <input
                          required
                          minLength={8}
                          value={acessoForm.senha}
                          onChange={e => setAcessoForm(prev => ({ ...prev, senha: e.target.value }))}
                          placeholder="Mínimo 8 caracteres"
                          className={field}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Papel</label>
                    <Select
                      value={acessoForm.role}
                      options={ROLE_ACESSO_OPCOES}
                      onChange={v => setAcessoForm(prev => ({ ...prev, role: v as AdminRole }))}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={fecharFormAcesso} className="px-4 py-2 rounded-xl border border-outline-variant text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={salvandoAcesso} className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-60">
                      {salvandoAcesso ? 'Salvando…' : editandoAcesso ? 'Salvar' : 'Criar acesso'}
                    </button>
                  </div>
                </form>
              )}

              {acessosLoading && <LoadingSpinner />}

              {!acessosLoading && acessos.length === 0 && (
                <p className="text-body-md text-on-surface-variant text-center py-6">Nenhum usuário do cliente ainda.</p>
              )}

              {!acessosLoading && acessos.map(acesso => (
                <div key={acesso.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-outline-variant">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body-md font-semibold text-on-surface truncate">{acesso.nome}</span>
                      <RoleBadge role={acesso.role} />
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${acesso.ativo ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'}`}>
                        {acesso.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant truncate">{acesso.email}</p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => abrirEditarAcesso(acesso)}
                      title="Editar"
                      className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={() => abrirResetSenha(acesso)}
                      title="Resetar senha"
                      className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                    </button>
                    <button
                      onClick={() => alternarAtivoAcesso(acesso)}
                      disabled={togglingAcesso === acesso.id}
                      title={acesso.ativo ? 'Desativar' : 'Ativar'}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${acesso.ativo ? 'text-error hover:bg-error-container' : 'text-tertiary hover:bg-tertiary/10'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{acesso.ativo ? 'block' : 'check_circle'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mini-modal de reset de senha — empilhado por cima do modal de Acessos. */}
      {resetandoSenhaDe && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Resetar senha</h3>
              <button onClick={fecharResetSenha} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {resetSucesso ? (
              <div className="px-5 py-4 space-y-4">
                <p className="text-body-md text-on-surface bg-tertiary/10 text-tertiary rounded-xl px-3 py-2">{resetSucesso}</p>
                <div className="flex justify-end">
                  <button onClick={fecharResetSenha} className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold hover:opacity-90 transition-all active:scale-95">
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={resetarSenha} className="px-5 py-4 space-y-4">
                <p className="text-body-md text-on-surface-variant">{resetandoSenhaDe.email}</p>
                {resetError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{resetError}</div>}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Nova senha temporária <span className="text-error">*</span></label>
                  <input
                    required
                    minLength={8}
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className={field}
                  />
                </div>
                <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                  A senha temporária deve ser enviada manualmente ao cliente. Envio automático será implementado futuramente.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={fecharResetSenha} className="px-4 py-2 rounded-xl border border-outline-variant text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={resetSaving} className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-60">
                    {resetSaving ? 'Salvando…' : 'Redefinir senha'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
