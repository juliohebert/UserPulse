import { useEffect, useState } from 'react'
import { get, post, put } from '../../services/api'
import type { Sistema, TelaCatalogo } from '../../types'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { TelaCatalogoModal, TELA_CATALOGO_EMPTY_FORM, formTelaCatalogoDeTela, normalizarPathUrl, pathUrlValido } from '../../components/catalogo/TelaCatalogoModal'

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

const botaoPrimario = 'inline-flex items-center justify-center gap-2 rounded-[100px] bg-[#0064e0] px-[30px] py-[14px] text-[14px] font-bold leading-[1.43] tracking-[-0.14px] text-white active:bg-[#0457cb] disabled:bg-[#bcc0c4]'

function AtivoBadge({ ativo }: { ativo: boolean }) {
  return ativo
    ? <span className="inline-flex w-[76px] justify-center rounded-[100px] bg-[#31a24c] px-3 py-1 text-[12px] font-bold uppercase leading-[1.33] text-white">Ativa</span>
    : <span className="inline-flex w-[76px] justify-center rounded-[100px] bg-[#ced0d4] px-3 py-1 text-[12px] font-bold uppercase leading-[1.33] text-[#444950]">Inativa</span>
}

function nomeSistema(tela: TelaCatalogo): string {
  return tela.sistemaConfig?.nome ?? tela.sistema
}

function alvoTela(tela: TelaCatalogo): string {
  return tela.url_contem ?? tela.tela ?? tela.data_cy ?? '—'
}

export function CatalogoTelasIndex() {
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
    <div className="bg-white px-4 py-6 text-[#1c1e21] lg:px-margin-desktop lg:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[28px] font-semibold leading-[1.21] text-[#0a1317]">Catálogo de Telas</h2>
          <p className="mt-1 text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">
            Telas cadastradas para preenchimento automático em campanhas.
          </p>
        </div>
        <button type="button" onClick={openNova} className={botaoPrimario}>
          <span className="material-symbols-outlined text-[18px] leading-none">add</span>
          Nova Tela
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-5 max-w-md">
        <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-[#5d6c7b]">search</span>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, sistema ou URL…"
          className="h-11 w-full rounded-[100px] border border-[#dee3e9] bg-[#f1f4f7] pl-11 pr-10 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#1c1e21] outline-none placeholder:text-[#5d6c7b] focus:border-[#1876f2] focus:bg-white focus:ring-2 focus:ring-[#1876f2]/10"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            title="Limpar busca"
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#5d6c7b] active:bg-[#dee3e9]"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">close</span>
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="rounded-[24px] border border-[#f0284a] bg-white p-4 text-[14px] leading-[1.43] tracking-[-0.14px] text-[#e41e3f]">{error}</div>
      )}

      {!loading && !error && filtradas.length === 0 && (
        <div className="rounded-[32px] border border-[#dee3e9] bg-white px-6 py-16 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]">
            <span className="material-symbols-outlined text-[24px] leading-none">grid_view</span>
          </span>
          <p className="text-[16px] leading-[1.5] tracking-[-0.16px] text-[#4b4c4f]">
            {busca ? 'Nenhuma tela encontrada para essa busca.' : 'Nenhuma tela cadastrada ainda.'}
          </p>
          {!busca && (
            <button type="button" onClick={openNova} className={`${botaoPrimario} mt-5`}>
              <span className="material-symbols-outlined text-[18px] leading-none">add</span>
              Nova Tela
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtradas.length > 0 && (
        <div className="min-h-[calc(100vh-220px)] overflow-x-auto rounded-[32px] border border-[#dee3e9] bg-white">
          <table className="min-w-full table-fixed text-left">
            <thead className="bg-[#f1f4f7]">
              <tr className="text-[12px] font-bold uppercase leading-[1.33] tracking-[0.08em] text-[#5d6c7b]">
                <th className="w-[15%] px-4 py-3">Sistema</th>
                <th className="w-[40%] px-4 py-3">Tela (tipo)</th>
                <th className="w-[30%] px-4 py-3">Alvo</th>
                <th className="w-[96px] px-4 py-3">Status</th>
                <th className="w-[100px] px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dee3e9]">
              {telasOrdenadas.map(tela => (
                <tr key={tela.id} className="bg-white">
                  <td className="px-4 py-3 align-middle">
                    <div className="min-w-[150px]">
                      <span className="truncate text-[16px] leading-[1.5] tracking-[-0.16px] text-[#0a1317]">{nomeSistema(tela)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex min-w-[180px] items-center gap-2">
                      <span className="group/tipo relative flex h-8 w-8 shrink-0 cursor-help items-center justify-center rounded-full bg-[#e8f2ff] text-[#0064e0]" tabIndex={0}>
                        <span className="material-symbols-outlined text-[18px] leading-none">{MODO_ICONE[tela.modo_identificacao] ?? 'link'}</span>
                        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[100px] bg-[#0a1317] px-3 py-2 text-[12px] font-bold leading-[1.33] text-white group-hover/tipo:block group-focus/tipo:block">
                          {MODO_LABEL[tela.modo_identificacao] ?? tela.modo_identificacao}
                        </span>
                      </span>
                      <span className="text-[16px] leading-[1.5] tracking-[-0.16px] text-[#0a1317]">{tela.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span className="block truncate font-mono text-[12px] leading-[1.33] text-[#5d6c7b]" title={alvoTela(tela)}>{alvoTela(tela)}</span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <AtivoBadge ativo={tela.ativo} />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex w-[80px] items-center justify-end gap-2">
                      <button
                        onClick={() => openEditar(tela)}
                        title="Editar"
                        aria-label={`Editar ${tela.nome}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dee3e9] text-[#1c1e21] active:bg-[#f1f4f7]"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">edit</span>
                      </button>
                      <button
                        onClick={() => toggleAtivo(tela)}
                        disabled={toggling === tela.id}
                        title={tela.ativo ? 'Inativar' : 'Reativar'}
                        aria-label={`${tela.ativo ? 'Inativar' : 'Reativar'} ${tela.nome}`}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border border-[#dee3e9] active:bg-[#f1f4f7] disabled:opacity-50 ${tela.ativo ? 'text-[#e41e3f]' : 'text-[#31a24c]'}`}
                      >
                        <span className={`material-symbols-outlined text-[18px] leading-none ${toggling === tela.id ? 'animate-spin' : ''}`}>
                          {toggling === tela.id ? 'progress_activity' : tela.ativo ? 'block' : 'check_circle'}
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
