import { useEffect, useState } from 'react'
import { get, post, put, del } from '../../services/api'
import type { PlanoAdmin } from '../../types'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Select } from '../../components/ui/Select'
import { ConfirmDialog, type ConfirmDialogVariant } from '../../components/ui/ConfirmDialog'
import { AdminSaasTabs } from '../../components/admin/AdminSaasTabs'
import { gerarSlug } from '../../utils/campanha'

const EMPTY_FORM = {
  nome: '',
  slug: '',
  descricao: '',
  preco_mensal: '',
  limite_campanhas_ativas: '',
  limite_tours_ativos: '',
  limite_eventos_mes: '',
  limite_usuarios_admin: '',
  permite_tours: true,
  permite_jornadas: true,
  permite_white_label: false,
  ativo: true,
  // Nunca exposto como checkbox no formulário (só "Interno (Quark)" usa
  // isso, gerido pelo seed) — só faz round-trip aqui pra editar outros
  // campos do plano interno (ex.: descrição) não resetar o flag pra false.
  interno: false,
  // Config da assinatura Asaas correspondente (fundação/sandbox, ver
  // server/src/services/asaasClient.ts) — todos opcionais.
  asaas_external_reference: '',
  asaas_subscription_value: '',
  asaas_billing_cycle: '',
}

const CICLO_ASAAS_OPCOES = [
  { value: '', label: 'Não definido' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'BIWEEKLY', label: 'Quinzenal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'BIMONTHLY', label: 'Bimestral' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUALLY', label: 'Semestral' },
  { value: 'YEARLY', label: 'Anual' },
]

type FormState = typeof EMPTY_FORM

type FiltroPlano = 'ativos' | 'inativos' | 'internos' | 'todos'

const FILTRO_OPCOES: { key: FiltroPlano; label: string; icon: string }[] = [
  { key: 'ativos', label: 'Ativos', icon: 'play_circle' },
  { key: 'inativos', label: 'Inativos', icon: 'pause_circle' },
  { key: 'internos', label: 'Internos', icon: 'shield' },
  { key: 'todos', label: 'Todos', icon: 'apps' },
]

function pertenceAoFiltro(plano: PlanoAdmin, filtro: FiltroPlano): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'internos') return plano.interno
  if (filtro === 'ativos') return plano.ativo && !plano.interno
  return !plano.ativo && !plano.interno // inativos
}

// Planos comerciais padrão do UserPulse (ver server/prisma/seedPlanos.ts) —
// nunca removíveis, mesmo sem cliente vinculado, só editáveis/inativáveis.
// Mantido em sincronia manual com SLUGS_PLANOS_OFICIAIS em
// server/src/controllers/adminPlanos.ts — isso aqui é só UX (esconder o
// botão Remover); o backend é quem de fato bloqueia a exclusão.
const PLANOS_OFICIAIS = new Set(['teste-gratis', 'starter', 'growth', 'scale', 'enterprise'])

function podeRemover(plano: PlanoAdmin): boolean {
  return !plano.interno && !PLANOS_OFICIAIS.has(plano.slug)
}

type TipoAcaoPlano = 'inativar' | 'reativar' | 'remover'

// Textos do ConfirmDialog por ação — nunca window.confirm (ver
// ConfirmDialog.tsx e o mesmo padrão já usado em Tenants.tsx).
const ACAO_CFG: Record<TipoAcaoPlano, { titulo: string; descricao: string; confirmLabel: string; variant: ConfirmDialogVariant }> = {
  inativar: {
    titulo: 'Inativar',
    descricao: 'O plano deixa de aparecer como opção para novos clientes. Quem já está nesse plano continua normalmente, nada muda para eles.',
    confirmLabel: 'Inativar',
    variant: 'warning',
  },
  reativar: {
    titulo: 'Reativar',
    descricao: 'O plano volta a aparecer como opção para novos clientes.',
    confirmLabel: 'Reativar',
    variant: 'default',
  },
  remover: {
    titulo: 'Remover',
    descricao: 'Esta ação não pode ser desfeita. Só é possível remover planos sem nenhum cliente vinculado.',
    confirmLabel: 'Remover',
    variant: 'danger',
  },
}

const field =
  'w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors'

function formatarLimite(valor: number | null): string {
  return valor == null ? 'Ilimitado' : String(valor)
}

function formatarPreco(valor: string | null): string {
  if (valor == null) return 'Sem preço definido'
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AdminPlanosIndex() {
  const [planos, setPlanos] = useState<PlanoAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<PlanoAdmin | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [filtro, setFiltro] = useState<FiltroPlano>('ativos')

  // Inativar/reativar/remover — pendura a ação até confirmar no ConfirmDialog.
  const [confirmAcao, setConfirmAcao] = useState<{ plano: PlanoAdmin; tipo: TipoAcaoPlano } | null>(null)
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [confirmErro, setConfirmErro] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    get<PlanoAdmin[]>('/admin/planos')
      .then(setPlanos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const abrirNovo = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const abrirEditar = (plano: PlanoAdmin) => {
    setEditando(plano)
    setForm({
      nome: plano.nome,
      slug: plano.slug,
      descricao: plano.descricao ?? '',
      preco_mensal: plano.preco_mensal ?? '',
      limite_campanhas_ativas: plano.limite_campanhas_ativas != null ? String(plano.limite_campanhas_ativas) : '',
      limite_tours_ativos: plano.limite_tours_ativos != null ? String(plano.limite_tours_ativos) : '',
      limite_eventos_mes: plano.limite_eventos_mes != null ? String(plano.limite_eventos_mes) : '',
      limite_usuarios_admin: plano.limite_usuarios_admin != null ? String(plano.limite_usuarios_admin) : '',
      permite_tours: plano.permite_tours,
      permite_jornadas: plano.permite_jornadas,
      permite_white_label: plano.permite_white_label,
      ativo: plano.ativo,
      interno: plano.interno,
      asaas_external_reference: plano.asaas_external_reference ?? '',
      asaas_subscription_value: plano.asaas_subscription_value ?? '',
      asaas_billing_cycle: plano.asaas_billing_cycle ?? '',
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
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        nome: form.nome.trim(),
        slug: form.slug.trim(),
        descricao: form.descricao.trim() || null,
        preco_mensal: form.preco_mensal.trim() || null,
        limite_campanhas_ativas: form.limite_campanhas_ativas.trim() || null,
        limite_tours_ativos: form.limite_tours_ativos.trim() || null,
        limite_eventos_mes: form.limite_eventos_mes.trim() || null,
        limite_usuarios_admin: form.limite_usuarios_admin.trim() || null,
        permite_tours: form.permite_tours,
        permite_jornadas: form.permite_jornadas,
        permite_white_label: form.permite_white_label,
        ativo: form.ativo,
        interno: form.interno,
        asaas_external_reference: form.asaas_external_reference.trim() || null,
        asaas_subscription_value: form.asaas_subscription_value.trim() || null,
        asaas_billing_cycle: form.asaas_billing_cycle || null,
      }
      if (editando) {
        await put(`/admin/planos/${editando.id}`, payload)
      } else {
        await post('/admin/planos', payload)
      }
      fecharForm()
      load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // Só abre o ConfirmDialog — a chamada de fato fica em confirmarAcaoPlano.
  const pedirAcaoPlano = (plano: PlanoAdmin, tipo: TipoAcaoPlano) => {
    setConfirmAcao({ plano, tipo })
    setConfirmErro(null)
  }

  const fecharConfirmAcao = () => {
    setConfirmAcao(null)
    setConfirmErro(null)
  }

  const confirmarAcaoPlano = async () => {
    if (!confirmAcao) return
    const { plano, tipo } = confirmAcao
    setConfirmSaving(true)
    setConfirmErro(null)
    try {
      if (tipo === 'remover') {
        await del(`/admin/planos/${plano.id}`)
      } else {
        // PUT substitui o registro inteiro (ver validarCamposPlano no
        // backend) — reenvia todos os campos do plano já carregado,
        // trocando só `ativo`. Mesmo cuidado de Tenants.tsx/mudarStatus.
        await put(`/admin/planos/${plano.id}`, {
          nome: plano.nome,
          slug: plano.slug,
          descricao: plano.descricao,
          preco_mensal: plano.preco_mensal,
          limite_campanhas_ativas: plano.limite_campanhas_ativas,
          limite_tours_ativos: plano.limite_tours_ativos,
          limite_eventos_mes: plano.limite_eventos_mes,
          limite_usuarios_admin: plano.limite_usuarios_admin,
          permite_tours: plano.permite_tours,
          permite_jornadas: plano.permite_jornadas,
          permite_white_label: plano.permite_white_label,
          interno: plano.interno,
          asaas_external_reference: plano.asaas_external_reference,
          asaas_subscription_value: plano.asaas_subscription_value,
          asaas_billing_cycle: plano.asaas_billing_cycle,
          ativo: tipo === 'reativar',
        })
      }
      setConfirmAcao(null)
      load()
    } catch (e) {
      // Fica com o dialog aberto mostrando o motivo (ex.: "vinculado a
      // clientes") — não fecha sozinho num erro esperado como esse.
      setConfirmErro(e instanceof Error ? e.message : 'Erro ao executar ação.')
    } finally {
      setConfirmSaving(false)
    }
  }

  // Sempre client-side, em cima da lista já carregada (painel interno,
  // poucos planos) — mesmo padrão dos filtros de Clientes em Tenants.tsx.
  const planosFiltrados = planos.filter(p => pertenceAoFiltro(p, filtro))

  return (
    <div className="px-4 lg:px-margin-desktop py-5">
      <AdminSaasTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">Planos</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">Planos comerciais disponíveis para vincular a um cliente.</p>
        </div>
        <button
          onClick={abrirNovo}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-sm hover:opacity-90 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Novo Plano
        </button>
      </div>

      {/* Filtro — client-side sobre a lista já carregada, mesmo padrão dos
          filtros de status em Tenants.tsx/tours/jornadas Index. */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-surface-container rounded-xl w-fit mb-5">
        {FILTRO_OPCOES.map(opcao => {
          const count = planos.filter(p => pertenceAoFiltro(p, opcao.key)).length
          return (
            <button
              key={opcao.key}
              onClick={() => setFiltro(opcao.key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-label-md font-bold transition-all ${
                filtro === opcao.key ? 'bg-surface-bright text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{opcao.icon}</span>
              {opcao.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                filtro === opcao.key ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && planosFiltrados.length === 0 && (
        <div className="py-16 text-center text-on-surface-variant">
          {planos.length === 0 ? 'Nenhum plano cadastrado ainda.' : 'Nenhum plano encontrado para este filtro.'}
        </div>
      )}

      {!loading && !error && planosFiltrados.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {planosFiltrados.map(plano => (
            <div key={plano.id} className="rounded-2xl border border-outline-variant p-4 bg-surface">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-body-md font-bold text-on-surface">{plano.nome}</p>
                  <p className="text-[11px] text-outline">{plano.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {plano.interno && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary">Plano interno</span>
                  )}
                  {!plano.ativo && !plano.interno && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-outline-variant/30 text-outline">Inativo</span>
                  )}
                  <button onClick={() => abrirEditar(plano)} title="Editar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </div>
              </div>
              {plano.descricao && <p className="text-[12px] text-on-surface-variant mb-3">{plano.descricao}</p>}
              <p className="text-title-md font-bold text-primary mb-3">{formatarPreco(plano.preco_mensal)}<span className="text-[11px] text-on-surface-variant font-normal">/mês</span></p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-on-surface-variant mb-3">
                <span>Campanhas ativas: <strong className="text-on-surface">{formatarLimite(plano.limite_campanhas_ativas)}</strong></span>
                <span>Tours ativos: <strong className="text-on-surface">{formatarLimite(plano.limite_tours_ativos)}</strong></span>
                {/* Rótulo comercial "Volume mensal de uso" — campo técnico
                    continua limite_eventos_mes (payload/schema/backend
                    inalterados, só o texto exibido mudou). */}
                <span>Volume mensal de uso: <strong className="text-on-surface">{formatarLimite(plano.limite_eventos_mes)}</strong></span>
                <span>Admins: <strong className="text-on-surface">{formatarLimite(plano.limite_usuarios_admin)}</strong></span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${plano.permite_tours ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'}`}>Tours</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${plano.permite_jornadas ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'}`}>Jornadas</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${plano.permite_white_label ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'}`}>White label</span>
              </div>
              {/* Inativar/Reativar/Remover — nunca pro plano interno (ver
                  comentário no schema.prisma: Interno (Quark) é permanente,
                  tratado à parte de qualquer plano comercial). */}
              {!plano.interno && (
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-outline-variant/40">
                  {plano.ativo ? (
                    <button
                      onClick={() => pedirAcaoPlano(plano, 'inativar')}
                      title="Inativar plano"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">pause_circle</span>
                      Inativar
                    </button>
                  ) : (
                    <button
                      onClick={() => pedirAcaoPlano(plano, 'reativar')}
                      title="Reativar plano"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-tertiary hover:bg-tertiary/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">play_circle</span>
                      Reativar
                    </button>
                  )}
                  {podeRemover(plano) && (
                    <button
                      onClick={() => pedirAcaoPlano(plano, 'remover')}
                      title="Remover plano"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-error hover:bg-error-container transition-colors ml-auto"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Remover
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">{editando ? 'Editar Plano' : 'Novo Plano'}</h3>
              <button onClick={fecharForm} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="px-5 py-4 space-y-4">
              {formError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{formError}</div>}

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                <input
                  required
                  value={form.nome}
                  onChange={e => {
                    const nome = e.target.value
                    setForm(prev => ({ ...prev, nome, slug: editando ? prev.slug : gerarSlug(nome) }))
                  }}
                  placeholder="Ex: Plano Pro"
                  className={field}
                />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Slug <span className="text-error">*</span></label>
                <input required value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="Ex: pro" className={field} />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Descrição</label>
                <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} className={field} />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Preço mensal (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.preco_mensal}
                  onChange={e => set('preco_mensal', e.target.value)}
                  placeholder="Vazio = sem preço definido"
                  className={field}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([
                  ['limite_campanhas_ativas', 'Limite campanhas ativas'],
                  ['limite_tours_ativos', 'Limite tours ativos'],
                  ['limite_eventos_mes', 'Limite de volume mensal de uso'],
                  ['limite_usuarios_admin', 'Limite usuários admin'],
                ] as const).map(([campo, label]) => (
                  <div key={campo}>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">{label}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form[campo]}
                      onChange={e => set(campo, e.target.value)}
                      placeholder="Ilimitado"
                      className={field}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-1">
                {([
                  ['permite_tours', 'Permite Tours guiados'],
                  ['permite_jornadas', 'Permite Jornadas'],
                  ['permite_white_label', 'Permite White label'],
                  ['ativo', 'Plano ativo'],
                ] as const).map(([campo, label]) => (
                  <div key={campo} className="flex items-center gap-3">
                    <ToggleSwitch checked={form[campo]} onChange={v => set(campo, v)} />
                    <label onClick={() => set(campo, !form[campo])} className="text-body-md text-on-surface cursor-pointer select-none">
                      {label}
                    </label>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-outline-variant/60 p-4 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-outline">Assinatura Asaas (sandbox)</h4>
                <p className="text-[12px] text-on-surface-variant">
                  Usado só ao criar uma assinatura Asaas pra um cliente neste plano (ver Gestão SaaS &gt; Clientes &gt; Cobrança Asaas). Sem valor definido, não é possível criar a assinatura.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Valor da assinatura (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.asaas_subscription_value}
                      onChange={e => set('asaas_subscription_value', e.target.value)}
                      placeholder="Vazio = não configurado"
                      className={field}
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Ciclo de cobrança</label>
                    <Select value={form.asaas_billing_cycle} options={CICLO_ASAAS_OPCOES} onChange={v => set('asaas_billing_cycle', v)} />
                  </div>
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Referência externa (externalReference)</label>
                  <input
                    value={form.asaas_external_reference}
                    onChange={e => set('asaas_external_reference', e.target.value)}
                    placeholder="Opcional"
                    className={field}
                  />
                </div>
              </div>

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

      {/* ConfirmDialog padrão (ver components/ui/ConfirmDialog.tsx) — nunca
          window.confirm, mesmo padrão já usado em Tenants.tsx. */}
      {confirmAcao && (
        <ConfirmDialog
          title={`${ACAO_CFG[confirmAcao.tipo].titulo} "${confirmAcao.plano.nome}"?`}
          description={ACAO_CFG[confirmAcao.tipo].descricao}
          confirmLabel={ACAO_CFG[confirmAcao.tipo].confirmLabel}
          variant={ACAO_CFG[confirmAcao.tipo].variant}
          loading={confirmSaving}
          erro={confirmErro}
          onConfirm={confirmarAcaoPlano}
          onCancel={fecharConfirmAcao}
        />
      )}
    </div>
  )
}
