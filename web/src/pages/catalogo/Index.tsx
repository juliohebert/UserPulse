import { useEffect, useState } from 'react'
import { get, post, put } from '../../services/api'
import type { Sistema, TelaCatalogo } from '../../types'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { TooltipIconButton } from '../../components/ui/TooltipIconButton'
import { TelaCatalogoModal, TELA_CATALOGO_EMPTY_FORM, formTelaCatalogoDeTela, normalizarPathUrl, pathUrlValido } from '../../components/catalogo/TelaCatalogoModal'
import { useAuth } from '../../hooks/useAuth'
import { podeGerenciarModulo } from '../../utils/permissions'

const MODO_ICONE: Record<string, string> = {
  url_contem: 'link',
  data_cy: 'tag',
  sistema_tela: 'view_quilt',
}

const MODO_LABEL: Record<string, string> = {
  url_contem: 'Caminho da URL',
  sistema_tela: 'Tela informada pelo sistema',
  data_cy: 'Elemento da tela (data-cy)',
}

function AtivoBadge({ ativo }: { ativo: boolean }) {
  return ativo
    ? <span className="inline-flex w-[76px] justify-center rounded-full bg-tertiary px-3 py-1 text-label-sm font-bold uppercase text-on-tertiary">Ativa</span>
    : <span className="inline-flex w-[76px] justify-center rounded-full bg-surface-dim px-3 py-1 text-label-sm font-bold uppercase text-on-surface-variant">Inativa</span>
}

function nomeSistema(tela: TelaCatalogo): string {
  return tela.sistemaConfig?.nome ?? tela.sistema
}

function alvoTela(tela: TelaCatalogo): string {
  return tela.url_contem ?? tela.tela ?? tela.data_cy ?? '—'
}

export function CatalogoTelasIndex() {
  const { user } = useAuth()
  // Fase 4 de permissões personalizadas — rota exige só VISUALIZAR em
  // CONFIGURACOES (ver App.tsx); escrever (criar/editar/inativar tela)
  // continua exigindo GERENCIAR, checado botão a botão.
  const podeGerenciar = podeGerenciarModulo(user, 'CONFIGURACOES')
  const [telas, setTelas] = useState<TelaCatalogo[]>([])
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<TelaCatalogo | null>(null)
  const [form, setForm] = useState(TELA_CATALOGO_EMPTY_FORM)
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

  const openNova = () => {
    setEditando(null)
    setForm(TELA_CATALOGO_EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const openEditar = (tela: TelaCatalogo) => {
    setEditando(tela)
    setForm(formTelaCatalogoDeTela(tela))
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
      const atualizada = await put<TelaCatalogo>(`/catalogo-telas/${tela.id}`, {
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
      setTelas(prev => prev.map(item => item.id === tela.id ? { ...item, ...atualizada, sistemaConfig: item.sistemaConfig } : item))
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
      (t.url_contem ?? '').toLowerCase().includes(q)
    )
  })

  const telasOrdenadas = [...filtradas].sort((a, b) =>
    nomeSistema(a).localeCompare(nomeSistema(b)) ||
    a.nome.localeCompare(b.nome)
  )

  return (
    <div>
      <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-visible">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-title-lg font-bold text-on-surface">Catálogo de Telas</h3>
              <p className="text-body-md text-on-surface-variant mt-0.5">
                Telas cadastradas para preenchimento automático em campanhas.
              </p>
            </div>
            {podeGerenciar && (
              <Button onClick={openNova} variant="gradient" size="lg" className="shrink-0" iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}>
                Nova Tela
              </Button>
            )}
          </div>

          <div className="p-5">
            {/* Busca */}
            <div className="relative mb-5 max-w-md">
              <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, sistema ou URL…"
                className="h-11 w-full rounded-full border border-outline-variant bg-surface-container-low pl-11 pr-10 text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/10"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  title="Limpar busca"
                  aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">close</span>
                </button>
              )}
            </div>

            {/* Conteúdo */}
            {loading && <LoadingSpinner />}

            {!loading && error && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-body-md bg-error-container text-on-error-container">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                {error}
              </div>
            )}

            {!loading && !error && filtradas.length === 0 && (
              <div className="rounded-2xl border border-outline-variant bg-surface px-6 py-16 text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[24px] leading-none">grid_view</span>
                </span>
                <p className="text-body-md text-on-surface-variant">
                  {busca ? 'Nenhuma tela encontrada para essa busca.' : 'Nenhuma tela cadastrada ainda.'}
                </p>
                {!busca && podeGerenciar && (
                  <Button onClick={openNova} variant="gradient" size="md" className="mt-5" iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}>
                    Nova Tela
                  </Button>
                )}
              </div>
            )}

            {!loading && !error && filtradas.length > 0 && (
              <div className="min-h-[calc(100vh-320px)] overflow-x-auto rounded-2xl border border-outline-variant bg-surface">
                <table className="min-w-full table-fixed text-left">
                  <thead className="bg-surface-container-low/50">
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
                      <th className="w-[15%] px-4 py-3">Sistema</th>
                      <th className="w-[40%] px-4 py-3">Tela (tipo)</th>
                      <th className="w-[30%] px-4 py-3">Alvo</th>
                      <th className="w-[96px] px-4 py-3">Status</th>
                      <th className="w-[100px] px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/40">
                    {telasOrdenadas.map(tela => (
                      <tr key={tela.id} className="group hover:bg-surface-container-low/60 transition-colors">
                        <td className="px-4 py-3 align-middle">
                          <div className="min-w-[150px]">
                            <span className="truncate text-body-md text-on-surface">{nomeSistema(tela)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex min-w-[180px] items-center gap-2">
                            <span className="group/tipo relative flex h-8 w-8 shrink-0 cursor-help items-center justify-center rounded-full bg-primary/10 text-primary" tabIndex={0}>
                              <span className="material-symbols-outlined text-[18px] leading-none">{MODO_ICONE[tela.modo_identificacao] ?? 'link'}</span>
                              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-on-surface px-3 py-2 text-label-sm font-bold text-surface group-hover/tipo:block group-focus/tipo:block">
                                {MODO_LABEL[tela.modo_identificacao] ?? tela.modo_identificacao}
                              </span>
                            </span>
                            <span className="text-body-md text-on-surface">{tela.nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="block truncate font-mono text-label-sm text-on-surface-variant" title={alvoTela(tela)}>{alvoTela(tela)}</span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <AtivoBadge ativo={tela.ativo} />
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          {podeGerenciar && (
                            <div className="flex items-center justify-end gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                              <TooltipIconButton
                                label="Editar"
                                onClick={() => openEditar(tela)}
                                ariaLabel={`Editar ${tela.nome}`}
                                className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-all"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </TooltipIconButton>
                              {tela.ativo ? (
                                <TooltipIconButton
                                  label="Inativar"
                                  onClick={() => toggleAtivo(tela)}
                                  ariaLabel={`Inativar ${tela.nome}`}
                                  className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container rounded-full transition-all"
                                >
                                  <span className={`material-symbols-outlined text-[18px] ${toggling === tela.id ? 'animate-spin' : ''}`}>
                                    {toggling === tela.id ? 'progress_activity' : 'block'}
                                  </span>
                                </TooltipIconButton>
                              ) : (
                                <TooltipIconButton
                                  label="Reativar"
                                  onClick={() => toggleAtivo(tela)}
                                  ariaLabel={`Reativar ${tela.nome}`}
                                  className="p-2 text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10 rounded-full transition-all"
                                >
                                  <span className={`material-symbols-outlined text-[18px] ${toggling === tela.id ? 'animate-spin' : ''}`}>
                                    {toggling === tela.id ? 'progress_activity' : 'check_circle'}
                                  </span>
                                </TooltipIconButton>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {showForm && (
        <TelaCatalogoModal
          form={form}
          sistemas={sistemas}
          editando={editando}
          saving={saving}
          error={formError}
          onClose={fecharForm}
          onSubmit={salvar}
          setForm={setForm}
        />
      )}
    </div>
  )
}
