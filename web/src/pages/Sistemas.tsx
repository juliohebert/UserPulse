import { useEffect, useState, type FormEvent } from 'react'
import { del, get, post, put } from '../services/api'
import type { Sistema } from '../types'
import { LoadingSpinner } from '../components/ui/EmptyState'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'

const EMPTY_FORM = {
  nome: '',
  slug: '',
  identificador: '',
  descricao: '',
  url_base: '',
  ativo: true,
  padrao: false,
}

type FormState = typeof EMPTY_FORM

const field = 'h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] outline-none placeholder:text-[#8595a4] focus:border-2 focus:border-[#0064e0]'
const textareaField = 'w-full rounded-lg border border-[#ced0d4] bg-white px-3 py-3 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] outline-none placeholder:text-[#8595a4] focus:border-2 focus:border-[#0064e0]'
const botaoPrimario = 'inline-flex items-center justify-center gap-2 rounded-[100px] bg-[#0064e0] px-[30px] py-[14px] text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white active:bg-[#0457cb] disabled:bg-[#bcc0c4]'
const botaoGhost = 'inline-flex items-center justify-center rounded-[100px] border-2 border-[rgba(10,19,23,0.12)] px-6 py-3 text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317] active:bg-[#f1f4f7]'

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
      padrao: sistema.padrao,
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
      if (sistema.padrao) {
        setErro('Sistema padrão não pode ser removido. Defina outro sistema como padrão antes.')
        return
      }
      if (sistema.ativo) await del(`/sistemas/${sistema.id}`)
      else await put(`/sistemas/${sistema.id}`, { ...sistema, ativo: true })
      load()
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="bg-white px-4 py-6 text-[#1c1e21] lg:px-margin-desktop lg:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[28px] font-semibold leading-[1.21] text-[#0a1317]">Sistemas</h2>
          <p className="mt-1 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">
            Cadastre os produtos ou aplicações usados por campanhas, tours, catálogo e widget.
          </p>
        </div>
        <button type="button" onClick={openNovo} className={botaoPrimario}>
          <span className="material-symbols-outlined text-[18px] leading-none">add</span>
          Novo Sistema
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {!loading && erro && <div className="rounded-[24px] border border-[#f0284a] bg-white p-4 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#e41e3f]">{erro}</div>}

      {!loading && !erro && sistemas.length === 0 && (
        <div className="rounded-[32px] border border-[#dee3e9] bg-white px-6 py-16 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
            <span className="material-symbols-outlined text-[24px] leading-none">dns</span>
          </span>
          <p className="text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">Nenhum sistema cadastrado ainda.</p>
          <button type="button" onClick={openNovo} className={`${botaoPrimario} mt-5`}>
            <span className="material-symbols-outlined text-[18px] leading-none">add</span>
            Novo Sistema
          </button>
        </div>
      )}

      {!loading && !erro && sistemas.length > 0 && (
        <div className="space-y-3">
          {sistemas.map(sistema => (
            <div key={sistema.id} className="flex flex-col gap-4 rounded-[24px] border border-[#dee3e9] bg-white p-5 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
                <span className="material-symbols-outlined text-[22px] leading-none">dns</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[18px] font-bold leading-[1.44] text-[#0a1317]">{sistema.nome}</span>
                  <span className="rounded-[100px] bg-[#f1f4f7] px-3 py-1 text-[12px] leading-[1.33] text-[#5d6c7b]">{sistema.identificador}</span>
                  <span className={`rounded-[100px] px-3 py-1 text-[12px] font-bold uppercase leading-[1.33] ${sistema.ativo ? 'bg-[#31a24c] text-white' : 'bg-[#ced0d4] text-[#444950]'}`}>
                    {sistema.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  {sistema.padrao && (
                    <span className="inline-flex items-center gap-1 rounded-[100px] bg-[#e8f2ff] px-3 py-1 text-[12px] font-bold uppercase leading-[1.33] text-[#0064e0]">
                      <span className="material-symbols-outlined text-[14px] leading-none">star</span>
                      Padrão
                    </span>
                  )}
                </div>
                <p className="truncate font-mono text-[12px] leading-[1.33] text-[#5d6c7b]">/{sistema.slug}</p>
                {sistema.descricao && <p className="mt-1 truncate text-[14px] leading-[1.43] tracking-[-0.14px] text-[#444950]">{sistema.descricao}</p>}
              </div>
              <div className="hidden shrink-0 items-center gap-2 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#5d6c7b] sm:flex">
                <span>{sistema._count?.telas ?? 0} telas</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ToggleSwitch checked={sistema.ativo} onChange={() => toggleAtivo(sistema)} disabled={toggling === sistema.id || sistema.padrao} />
                <button onClick={() => openEditar(sistema)} title="Editar" aria-label={`Editar ${sistema.nome}`} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dee3e9] text-[#1c1e21] active:bg-[#f1f4f7]">
                  <span className="material-symbols-outlined text-[18px] leading-none">edit</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1317]/45 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[32px] border border-[#dee3e9] bg-white">
            <div className="flex items-center justify-between border-b border-[#dee3e9] px-6 py-5">
              <h3 className="text-[24px] font-semibold leading-[1.25] text-[#0a1317]">{editando ? 'Editar Sistema' : 'Novo Sistema'}</h3>
              <button onClick={fecharForm} title="Fechar" aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dee3e9] text-[#1c1e21] active:bg-[#f1f4f7]">
                <span className="material-symbols-outlined text-[20px] leading-none">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="space-y-5 px-6 py-5">
              {formError && <div className="rounded-[16px] border border-[#f0284a] p-3 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#e41e3f]">{formError}</div>}

              <div>
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Nome <span className="text-[#e41e3f]">*</span></label>
                <input required value={form.nome} onChange={e => {
                  const nome = e.target.value
                  setForm(prev => ({ ...prev, nome, slug: editando ? prev.slug : sugerirSlug(nome), identificador: editando ? prev.identificador : sugerirSlug(nome) }))
                }} placeholder="Ex: Portal do Paciente" className={field} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Slug <span className="text-[#e41e3f]">*</span></label>
                  <input required value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="portal-paciente" className={field} />
                </div>
                <div>
                  <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Identificador técnico <span className="text-[#e41e3f]">*</span></label>
                  <input required value={form.identificador} onChange={e => set('identificador', e.target.value)} placeholder="portal-paciente" className={field} />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">URL base</label>
                <input value={form.url_base} onChange={e => set('url_base', e.target.value)} placeholder="https://app.cliente.com" className={field} />
              </div>
              <div>
                <label className="mb-2 block text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-[#0a1317]">Descrição</label>
                <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={3} placeholder="Uso interno para orientar o time." className={textareaField} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.ativo} onChange={v => set('ativo', v)} disabled={editando?.padrao} />
                <label onClick={() => { if (!editando?.padrao) set('ativo', !form.ativo) }} className={`select-none text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] ${editando?.padrao ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>{form.ativo ? 'Sistema ativo' : 'Sistema inativo'}</label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.padrao} onChange={v => set('padrao', v)} disabled={editando?.padrao} />
                <label onClick={() => { if (!editando?.padrao) set('padrao', !form.padrao) }} className={`select-none text-[16px] leading-[1.5] tracking-[-0.16px] text-[#1c1e21] ${editando?.padrao ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                  Sistema padrão
                  <span className="ml-1 text-[12px] leading-[1.33] text-[#5d6c7b]">{editando?.padrao ? '(para trocar, marque outro sistema como padrão)' : '(pré-selecionado em novos cadastros)'}</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={fecharForm} className={botaoGhost}>Cancelar</button>
                <button type="submit" disabled={salvando} className={botaoPrimario}>{salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
