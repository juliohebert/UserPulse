import { useEffect, useState, type FormEvent } from 'react'
import { del, get, post, put } from '../services/api'
import type { Sistema } from '../types'
import { LoadingSpinner } from '../components/ui/EmptyState'
import { ToggleSwitch } from '../components/ui/ToggleSwitch'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { podeGerenciarModulo } from '../utils/permissions'

const EMPTY_FORM = {
  nome: '',
  slug: '',
  identificador: '',
  descricao: '',
  url_base: '',
  ativo: true,
  padrao: false,
  dominios: '',
}

type FormState = typeof EMPTY_FORM

// String[] <-> texto separado por vírgula, mesmo padrão de edição usado nas
// listas de segmentação de Campanha/Tour/Jornada — normalização real
// (hostname puro, lowercase) acontece no backend (ver normalizarDominio em
// lib/dominio.ts), aqui só faz split/trim.
function dominiosParaTexto(dominios: string[] | null | undefined): string {
  return (dominios ?? []).join(', ')
}

function textoParaDominios(texto: string): string[] {
  return texto.split(',').map(item => item.trim()).filter(Boolean)
}

const field = 'h-11 w-full rounded-lg border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface outline-none placeholder:text-outline focus:border-2 focus:border-primary'
const textareaField = 'w-full rounded-lg border border-[#ced0d4] bg-white px-3 py-3 text-body-md text-on-surface outline-none placeholder:text-outline focus:border-2 focus:border-primary'

function sugerirSlug(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function SistemasPage() {
  const { user } = useAuth()
  // Fase 4 de permissões personalizadas — a rota exige só VISUALIZAR em
  // CONFIGURACOES (ver App.tsx), então EDITOR/VIEWER podem chegar aqui em
  // modo leitura agora; escrever (criar/editar sistema) continua exigindo
  // GERENCIAR, checado botão a botão (evita mostrar controle que o backend
  // já bloquearia com 403 — ver requireGerenciarModuloConfiguracoes).
  const podeGerenciar = podeGerenciarModulo(user, 'CONFIGURACOES')
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
      dominios: dominiosParaTexto(sistema.dominios),
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
        dominios: textoParaDominios(form.dominios),
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
    <div>
      <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Sistemas</h3>
              <p className="text-body-md text-on-surface-variant mt-0.5">
                Cadastre os produtos ou aplicações usados por campanhas, tours, catálogo e widget.
              </p>
            </div>
            {podeGerenciar && (
              <Button onClick={openNovo} variant="gradient" size="lg" className="shrink-0" iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}>
                Novo Sistema
              </Button>
            )}
          </div>

          <div className="p-5">
            {loading && <LoadingSpinner />}
            {!loading && erro && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-body-md bg-error-container text-on-error-container">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                {erro}
              </div>
            )}

            {!loading && !erro && sistemas.length === 0 && (
              <div className="rounded-2xl border border-outline-variant bg-surface px-6 py-16 text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[24px] leading-none">dns</span>
                </span>
                <p className="text-body-md text-on-surface-variant">Nenhum sistema cadastrado ainda.</p>
                {podeGerenciar && (
                  <Button onClick={openNovo} variant="gradient" size="md" className="mt-5" iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}>
                    Novo Sistema
                  </Button>
                )}
              </div>
            )}

            {!loading && !erro && sistemas.length > 0 && (
              <div className="space-y-3">
                {sistemas.map(sistema => (
                  <div key={sistema.id} className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface p-5 sm:flex-row sm:items-center">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="material-symbols-outlined text-[22px] leading-none">dns</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-body-md font-bold text-on-surface">{sistema.nome}</span>
                        <span className="rounded-full bg-surface-container-low px-3 py-1 text-label-sm text-on-surface-variant">{sistema.identificador}</span>
                        <span className={`rounded-full px-3 py-1 text-label-sm font-bold uppercase ${sistema.ativo ? 'bg-tertiary text-on-tertiary' : 'bg-surface-dim text-on-surface-variant'}`}>
                          {sistema.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                        {sistema.padrao && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-label-sm font-bold uppercase text-primary">
                            <span className="material-symbols-outlined text-[14px] leading-none">star</span>
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-label-sm text-on-surface-variant">/{sistema.slug}</p>
                      {sistema.descricao && <p className="mt-1 truncate text-body-sm text-on-surface-variant">{sistema.descricao}</p>}
                    </div>
                    <div className="hidden shrink-0 items-center gap-2 text-body-sm text-on-surface-variant sm:flex">
                      <span>{sistema._count?.telas ?? 0} telas</span>
                    </div>
                    {podeGerenciar && (
                      <div className="flex shrink-0 items-center gap-3">
                        <ToggleSwitch checked={sistema.ativo} onChange={() => toggleAtivo(sistema)} disabled={toggling === sistema.id || sistema.padrao} />
                        <button onClick={() => openEditar(sistema)} title="Editar" aria-label={`Editar ${sistema.nome}`} className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-high">
                          <span className="material-symbols-outlined text-[18px] leading-none">edit</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-5">
              <h3 className="text-title-md font-bold text-on-surface">{editando ? 'Editar Sistema' : 'Novo Sistema'}</h3>
              <button onClick={fecharForm} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="space-y-5 px-6 py-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-xl text-body-md bg-error-container text-on-error-container">
                  <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-label-md text-on-surface-variant">Nome <span className="text-error">*</span></label>
                <input required value={form.nome} onChange={e => {
                  const nome = e.target.value
                  setForm(prev => ({ ...prev, nome, slug: editando ? prev.slug : sugerirSlug(nome), identificador: editando ? prev.identificador : sugerirSlug(nome) }))
                }} placeholder="Ex: Portal do Paciente" className={field} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-label-md text-on-surface-variant">Slug <span className="text-error">*</span></label>
                  <input required value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="portal-paciente" className={field} />
                </div>
                <div>
                  <label className="mb-1.5 block text-label-md text-on-surface-variant">Identificador técnico <span className="text-error">*</span></label>
                  <input required value={form.identificador} onChange={e => set('identificador', e.target.value)} placeholder="portal-paciente" className={field} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-label-md text-on-surface-variant">URL base</label>
                <input value={form.url_base} onChange={e => set('url_base', e.target.value)} placeholder="https://app.cliente.com" className={field} />
              </div>
              <div>
                <label className="mb-1.5 block text-label-md text-on-surface-variant">Domínios</label>
                <input value={form.dominios} onChange={e => set('dominios', e.target.value)} placeholder="ng.quarkclinic.com.br, gng.quarkclinic.com.br" className={field} />
                <p className="mt-1.5 text-label-sm text-on-surface-variant">
                  Separe múltiplos domínios por vírgula. Use quando este mesmo sistema roda em várias URLs — as campanhas, tours e jornadas passam a poder restringir a exibição a um ou mais destes domínios.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-label-md text-on-surface-variant">Descrição</label>
                <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={3} placeholder="Uso interno para orientar o time." className={textareaField} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.ativo} onChange={v => set('ativo', v)} disabled={editando?.padrao} />
                <label onClick={() => { if (!editando?.padrao) set('ativo', !form.ativo) }} className={`select-none text-body-md text-on-surface ${editando?.padrao ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>{form.ativo ? 'Sistema ativo' : 'Sistema inativo'}</label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.padrao} onChange={v => set('padrao', v)} disabled={editando?.padrao} />
                <label onClick={() => { if (!editando?.padrao) set('padrao', !form.padrao) }} className={`select-none text-body-md text-on-surface ${editando?.padrao ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                  Sistema padrão
                  <span className="ml-1 text-label-sm text-on-surface-variant">{editando?.padrao ? '(para trocar, marque outro sistema como padrão)' : '(pré-selecionado em novos cadastros)'}</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" onClick={fecharForm} variant="ghost">Cancelar</Button>
                <Button type="submit" disabled={salvando} variant="gradient">{salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
