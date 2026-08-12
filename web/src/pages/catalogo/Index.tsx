import { useEffect, useRef, useState } from 'react'
import { get, post, put } from '../../services/api'
import type { Sistema, TelaCatalogo } from '../../types'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Button } from '../../components/ui/Button'

const MODOS = [
  { value: 'url_contem', label: 'Caminho da URL' },
  { value: 'sistema_tela', label: 'Tela informada pelo sistema' },
  { value: 'data_cy', label: 'Elemento da tela (data-cy)' },
]

const MODO_ICONE: Record<string, string> = {
  url_contem: 'link',
  data_cy: 'tag',
  sistema_tela: 'view_quilt',
}

const EMPTY_FORM = {
  nome: '',
  sistema_id: '',
  sistema: '',
  categoria: '',
  modo_identificacao: 'url_contem',
  tela: '',
  url_contem: '',
  data_cy: '',
  ativo: true,
}

type FormState = typeof EMPTY_FORM

const field =
  'w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors'

function FormSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface flex justify-between items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors hover:border-outline"
      >
        <span>{selected?.label ?? '—'}</span>
        <span className={`material-symbols-outlined text-outline text-[18px] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-outline-variant bg-surface shadow-lg overflow-hidden">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-body-md text-left transition-colors ${
                value === o.value
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-on-surface hover:bg-surface-container-low'
              }`}
            >
              {o.label}
              {value === o.value && (
                <span className="material-symbols-outlined text-[16px]">check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AtivoBadge({ ativo }: { ativo: boolean }) {
  return ativo
    ? <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-tertiary/10 text-tertiary">Ativa</span>
    : <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-outline-variant/30 text-outline">Inativa</span>
}

function nomeSistema(tela: TelaCatalogo): string {
  return tela.sistemaConfig?.nome ?? tela.sistema
}

function alvoTela(tela: TelaCatalogo): string {
  return tela.url_contem ?? tela.tela ?? tela.data_cy ?? '—'
}

function pathUrlValido(valor: string): boolean {
  const limpo = valor.trim()
  return limpo === '' || (limpo.startsWith('/') && !/^https?:\/\//i.test(limpo) && !/[\s,]/.test(limpo))
}

function normalizarPathUrl(valor: string): string {
  const limpo = valor.trim()
  if (!/^https?:\/\//i.test(limpo)) return limpo
  try {
    const url = new URL(limpo)
    return `${url.pathname}${url.search}${url.hash}` || '/'
  } catch {
    return limpo
  }
}

export function CatalogoTelasIndex() {
  const [telas, setTelas] = useState<TelaCatalogo[]>([])
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<TelaCatalogo | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([get<TelaCatalogo[]>('/catalogo-telas'), get<Sistema[]>('/sistemas?ativo=true')])
      .then(([telas, sistemas]) => { setTelas(telas); setSistemas(sistemas) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const openNova = () => {
    setEditando(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const openEditar = (tela: TelaCatalogo) => {
    setEditando(tela)
    setForm({
      nome: tela.nome,
      sistema_id: tela.sistema_id,
      sistema: tela.sistema,
      categoria: tela.categoria,
      modo_identificacao: tela.modo_identificacao,
      tela: tela.tela ?? '',
      url_contem: tela.url_contem ?? '',
      data_cy: tela.data_cy ?? '',
      ativo: tela.ativo,
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
      const urlConterNormalizada = normalizarPathUrl(form.url_contem)
      if (form.modo_identificacao === 'url_contem' && !pathUrlValido(urlConterNormalizada)) {
        setFormError('Informe apenas um caminho relativo, como /app/faturamento. A URL completa vem do embed do widget no sistema.')
        return
      }
      const payload = {
        ...form,
        sistema: sistemas.find(s => s.id === form.sistema_id)?.identificador ?? form.sistema,
        tela: form.tela.trim() || null,
        url_contem: urlConterNormalizada || null,
        data_cy: form.data_cy.trim() || null,
      }
      if (editando) {
        await put(`/catalogo-telas/${editando.id}`, payload)
      } else {
        await post('/catalogo-telas', payload)
      }
      fecharForm()
      load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const toggleAtivo = async (tela: TelaCatalogo) => {
    setToggling(tela.id)
    try {
      await put(`/catalogo-telas/${tela.id}`, {
        nome: tela.nome,
        sistema_id: tela.sistema_id,
        sistema: tela.sistema,
        categoria: tela.categoria,
        modo_identificacao: tela.modo_identificacao,
        tela: tela.tela,
        url_contem: tela.url_contem,
        data_cy: tela.data_cy,
        ativo: !tela.ativo,
      })
      load()
    } catch {
      // ignore — visual permanece sem alteração
    } finally {
      setToggling(null)
    }
  }

  const filtradas = telas.filter(t => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return (
      t.nome.toLowerCase().includes(q) ||
      t.sistema.toLowerCase().includes(q) ||
      (t.sistemaConfig?.nome ?? '').toLowerCase().includes(q) ||
      t.categoria.toLowerCase().includes(q) ||
      (t.url_contem ?? '').toLowerCase().includes(q)
    )
  })

  const telasOrdenadas = [...filtradas].sort((a, b) =>
    nomeSistema(a).localeCompare(nomeSistema(b)) ||
    a.categoria.localeCompare(b.categoria) ||
    a.nome.localeCompare(b.nome)
  )

  return (
    <div className="px-4 lg:px-margin-desktop py-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">Catálogo de Telas</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            Telas cadastradas para preenchimento automático em campanhas.
          </p>
        </div>
        <Button
          onClick={openNova}
          variant="gradient"
          size="lg"
          className="shrink-0"
          iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
        >
          Nova Tela
        </Button>
      </div>

      {/* Busca */}
      <div className="relative mb-5 max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-outline pointer-events-none">search</span>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, sistema, categoria ou URL…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            title="Limpar busca"
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="p-4 bg-error-container text-on-error-container rounded-xl text-body-md">{error}</div>
      )}

      {!loading && !error && filtradas.length === 0 && (
        <div className="py-16 text-center">
          <span className="material-symbols-outlined text-[40px] text-outline mb-3 block">grid_view</span>
          <p className="text-body-md text-on-surface-variant">
            {busca ? 'Nenhuma tela encontrada para essa busca.' : 'Nenhuma tela cadastrada ainda.'}
          </p>
          {!busca && (
            <Button
              onClick={openNova}
              className="mt-4"
              iconLeft={<span className="material-symbols-outlined text-[16px]">add</span>}
            >
              Nova Tela
            </Button>
          )}
        </div>
      )}

      {!loading && !error && filtradas.length > 0 && (
        <div className="overflow-x-auto rounded-3xl border border-outline-variant bg-surface shadow-sm">
          <table className="min-w-full divide-y divide-outline-variant text-left">
            <thead className="bg-surface-container-lowest">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-outline">
                <th className="px-4 py-3">Sistema</th>
                <th className="px-4 py-3">Tela</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Identificação</th>
                <th className="px-4 py-3">Alvo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {telasOrdenadas.map(tela => (
                <tr key={tela.id} className="bg-surface transition-colors hover:bg-surface-container-lowest">
                  <td className="px-4 py-3 align-middle">
                    <div className="min-w-[150px]">
                      <span className="truncate text-body-md font-bold text-on-surface">{nomeSistema(tela)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex min-w-[180px] items-center gap-3">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">
                        {MODO_ICONE[tela.modo_identificacao] ?? 'link'}
                      </span>
                      <span className="text-body-md font-semibold text-on-surface">{tela.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span className="inline-flex rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-bold text-on-surface-variant">
                      {tela.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-body-md text-on-surface-variant">
                    {MODOS.find(m => m.value === tela.modo_identificacao)?.label ?? tela.modo_identificacao}
                  </td>
                  <td className="max-w-[320px] px-4 py-3 align-middle">
                    <span className="block truncate font-mono text-[12px] text-outline" title={alvoTela(tela)}>{alvoTela(tela)}</span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <AtivoBadge ativo={tela.ativo} />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center justify-end gap-3">
                      <ToggleSwitch
                        checked={tela.ativo}
                        onChange={() => toggleAtivo(tela)}
                        disabled={toggling === tela.id}
                      />
                      <button
                        onClick={() => openEditar(tela)}
                        title="Editar"
                        aria-label={`Editar ${tela.nome}`}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">
                {editando ? 'Editar Tela' : 'Nova Tela'}
              </h3>
              <button
                onClick={fecharForm}
                title="Fechar"
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="px-5 py-4 space-y-4">
              {formError && (
                <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{formError}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Nome <span className="text-error">*</span>
                  </label>
                  <input
                    required
                    value={form.nome}
                    onChange={e => set('nome', e.target.value)}
                    placeholder="Ex: Agendamentos"
                    className={field}
                  />
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Sistema <span className="text-error">*</span>
                  </label>
                  <select
                    required
                    value={form.sistema_id}
                    onChange={e => {
                      const selecionado = sistemas.find(s => s.id === e.target.value)
                      setForm(prev => ({ ...prev, sistema_id: e.target.value, sistema: selecionado?.identificador ?? '' }))
                    }}
                    className={field}
                  >
                    <option value="">Selecione...</option>
                    {sistemas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Categoria <span className="text-error">*</span>
                  </label>
                  <input
                    required
                    value={form.categoria}
                    onChange={e => set('categoria', e.target.value)}
                    placeholder="Ex: Atendimento"
                    className={field}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-label-md text-on-surface-variant mb-1.5">
                    Modo de identificação <span className="text-error">*</span>
                  </label>
                  <FormSelect
                    value={form.modo_identificacao}
                    options={MODOS}
                    onChange={v => set('modo_identificacao', v)}
                  />
                </div>

                {form.modo_identificacao === 'sistema_tela' && (
                  <div className="col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Nome da tela</label>
                    <input
                      value={form.tela}
                      onChange={e => set('tela', e.target.value)}
                      placeholder="Ex: agendamentos"
                      className={field}
                    />
                  </div>
                )}
                {form.modo_identificacao === 'url_contem' && (
                  <div className="col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Caminho da URL</label>
                    <input
                      value={form.url_contem}
                      onChange={e => set('url_contem', e.target.value)}
                      onBlur={e => set('url_contem', normalizarPathUrl(e.target.value))}
                      onPaste={e => {
                        const texto = e.clipboardData.getData('text')
                        if (!/^https?:\/\//i.test(texto.trim())) return
                        e.preventDefault()
                        set('url_contem', normalizarPathUrl(texto))
                      }}
                      placeholder="Ex: /app/faturamento"
                      className={`${field} ${form.url_contem.trim() && !pathUrlValido(form.url_contem) ? 'border-error focus:border-error focus:ring-error/20' : ''}`}
                    />
                    <p className="mt-1.5 text-[11px] text-outline">
                      Informe apenas o caminho, como /app/faturamento. A URL completa é lida pelo embed do widget no sistema onde ele está instalado.
                    </p>
                  </div>
                )}
                {form.modo_identificacao === 'data_cy' && (
                  <div className="col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Valor do data-cy</label>
                    <input
                      value={form.data_cy}
                      onChange={e => set('data_cy', e.target.value)}
                      placeholder="Ex: agenda-page"
                      className={field}
                    />
                  </div>
                )}

                <div className="col-span-2 flex items-center gap-3 pt-1">
                  <ToggleSwitch checked={form.ativo} onChange={v => set('ativo', v)} />
                  <label
                    onClick={() => set('ativo', !form.ativo)}
                    className="text-body-md text-on-surface cursor-pointer select-none"
                  >
                    {form.ativo ? 'Tela ativa' : 'Tela inativa'}
                    <span className="text-on-surface-variant ml-1 text-[12px]">(aparece no catálogo de campanhas se ativa)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={fecharForm}
                  variant="ghost"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  size="md"
                >
                  {saving ? 'Salvando…' : editando ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
