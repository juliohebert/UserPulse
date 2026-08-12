import { useEffect, useState, type FormEvent } from 'react'
import { del, get, post, put } from '../services/api'
import type { Sistema } from '../types'
import { LoadingSpinner } from '../components/ui/EmptyState'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import { Button } from '../components/ui/Button'

const EMPTY_FORM = {
  nome: '',
  slug: '',
  identificador: '',
  descricao: '',
  url_base: '',
  ativo: true,
}

type FormState = typeof EMPTY_FORM

const field = 'w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors'

function sugerirSlug(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function SistemasPage() {
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Sistema | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [salvando, setSalvando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    get<Sistema[]>('/sistemas')
      .then(setSistemas)
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (key: keyof FormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const openNovo = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const openEditar = (sistema: Sistema) => {
    setEditando(sistema)
    setForm({
      nome: sistema.nome,
      slug: sistema.slug,
      identificador: sistema.identificador,
      descricao: sistema.descricao ?? '',
      url_base: sistema.url_base ?? '',
      ativo: sistema.ativo,
    })
    setFormError(null)
    setShowForm(true)
  }

  const fecharForm = () => {
    setShowForm(false)
    setEditando(null)
    setFormError(null)
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setFormError(null)
    try {
      const payload = {
        ...form,
        descricao: form.descricao.trim() || null,
        url_base: form.url_base.trim() || null,
      }
      if (editando) await put(`/sistemas/${editando.id}`, payload)
      else await post('/sistemas', payload)
      fecharForm()
      load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtivo = async (sistema: Sistema) => {
    setToggling(sistema.id)
    try {
      if (sistema.ativo) await del(`/sistemas/${sistema.id}`)
      else await put(`/sistemas/${sistema.id}`, { ...sistema, ativo: true })
      load()
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="px-4 lg:px-margin-desktop py-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">Sistemas</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            Cadastre os produtos ou aplicações usados por campanhas, tours, catálogo e widget.
          </p>
        </div>
        <Button onClick={openNovo} variant="gradient" size="lg" className="shrink-0" iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}>
          Novo Sistema
        </Button>
      </div>

      {loading && <LoadingSpinner />}
      {!loading && erro && <div className="p-4 bg-error-container text-on-error-container rounded-xl text-body-md">{erro}</div>}

      {!loading && !erro && sistemas.length === 0 && (
        <div className="py-16 text-center">
          <span className="material-symbols-outlined text-[40px] text-outline mb-3 block">dns</span>
          <p className="text-body-md text-on-surface-variant">Nenhum sistema cadastrado ainda.</p>
          <Button onClick={openNovo} className="mt-4" iconLeft={<span className="material-symbols-outlined text-[16px]">add</span>}>
            Novo Sistema
          </Button>
        </div>
      )}

      {!loading && !erro && sistemas.length > 0 && (
        <div className="rounded-2xl border border-outline-variant overflow-hidden divide-y divide-outline-variant">
          {sistemas.map(sistema => (
            <div key={sistema.id} className="flex items-center gap-4 px-4 py-3 bg-surface hover:bg-surface-container-lowest transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0">dns</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-body-md font-semibold text-on-surface leading-tight">{sistema.nome}</span>
                  <span className="text-[11px] text-outline bg-surface-container px-2 py-0.5 rounded-full leading-tight">{sistema.identificador}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${sistema.ativo ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'}`}>
                    {sistema.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-[12px] text-outline font-mono leading-tight truncate">/{sistema.slug}</p>
                {sistema.descricao && <p className="text-[12px] text-on-surface-variant mt-0.5 truncate">{sistema.descricao}</p>}
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-outline shrink-0">
                <span>{sistema._count?.telas ?? 0} telas</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <ToggleSwitch checked={sistema.ativo} onChange={() => toggleAtivo(sistema)} disabled={toggling === sistema.id} />
                <button onClick={() => openEditar(sistema)} title="Editar" aria-label={`Editar ${sistema.nome}`} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">{editando ? 'Editar Sistema' : 'Novo Sistema'}</h3>
              <button onClick={fecharForm} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="px-5 py-4 space-y-4">
              {formError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{formError}</div>}

              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                <input required value={form.nome} onChange={e => {
                  const nome = e.target.value
                  setForm(prev => ({ ...prev, nome, slug: editando ? prev.slug : sugerirSlug(nome), identificador: editando ? prev.identificador : sugerirSlug(nome) }))
                }} placeholder="Ex: Portal do Paciente" className={field} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Slug <span className="text-error">*</span></label>
                  <input required value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="portal-paciente" className={field} />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Identificador técnico <span className="text-error">*</span></label>
                  <input required value={form.identificador} onChange={e => set('identificador', e.target.value)} placeholder="portal-paciente" className={field} />
                </div>
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">URL base</label>
                <input value={form.url_base} onChange={e => set('url_base', e.target.value)} placeholder="https://app.cliente.com" className={field} />
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Descrição</label>
                <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={3} placeholder="Uso interno para orientar o time." className={field} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.ativo} onChange={v => set('ativo', v)} />
                <label onClick={() => set('ativo', !form.ativo)} className="text-body-md text-on-surface cursor-pointer select-none">{form.ativo ? 'Sistema ativo' : 'Sistema inativo'}</label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" onClick={fecharForm} variant="ghost">Cancelar</Button>
                <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
