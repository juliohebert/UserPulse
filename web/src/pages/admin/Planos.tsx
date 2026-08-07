import { useEffect, useState } from 'react'
import { get, post, put } from '../../services/api'
import type { PlanoAdmin } from '../../types'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
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
}

type FormState = typeof EMPTY_FORM

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

  return (
    <div className="px-4 lg:px-margin-desktop py-5">
      <AdminSaasTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
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

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && planos.length === 0 && (
        <div className="py-16 text-center text-on-surface-variant">Nenhum plano cadastrado ainda.</div>
      )}

      {!loading && !error && planos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {planos.map(plano => (
            <div key={plano.id} className="rounded-2xl border border-outline-variant p-4 bg-surface">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-body-md font-bold text-on-surface">{plano.nome}</p>
                  <p className="text-[11px] text-outline">{plano.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!plano.ativo && (
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
    </div>
  )
}
