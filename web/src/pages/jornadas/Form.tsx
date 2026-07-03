import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { Campanha, Jornada, TipoEtapaJornada, TourGuiado } from '../../types'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { CardHeader } from '../../components/ui/CardHeader'
import { Select } from '../../components/ui/Select'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'

interface FormState {
  titulo: string
  descricao: string
  ativo: boolean
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
}

const EMPTY: FormState = {
  titulo: '', descricao: '', ativo: true,
  segmentar_cliente_ids: [], segmentar_unidade_ids: [], segmentar_perfis: [],
  segmentar_usuario_tipos: [], segmentar_estados: [],
}

interface EtapaFormState {
  titulo: string
  descricao: string
  tipo: TipoEtapaJornada
  tour_id: string
  campanha_id: string
  url: string
  texto_cta: string
  abrir_nova_aba: boolean
  obrigatoria: boolean
}

const ETAPA_VAZIA: EtapaFormState = {
  titulo: '', descricao: '', tipo: 'link', tour_id: '', campanha_id: '',
  url: '', texto_cta: 'Abrir', abrir_nova_aba: true, obrigatoria: true,
}

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

const TIPOS_ETAPA: { value: TipoEtapaJornada; label: string; icon: string }[] = [
  { value: 'tour', label: 'Tour guiado', icon: 'map' },
  { value: 'campanha', label: 'Campanha', icon: 'campaign' },
  { value: 'link', label: 'Link externo', icon: 'link' },
]

export function JornadaForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [slug, setSlug] = useState('')
  const [etapas, setEtapas] = useState<EtapaFormState[]>([])
  const [tours, setTours] = useState<TourGuiado[]>([])
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loadingJornada, setLoadingJornada] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Feedback de "salvo com sucesso" sobrevive ao redirecionamento pós-criação
  // (de /jornadas/novo para /jornadas/:id/editar) via router state, mesmo
  // padrão usado em tours/Form.tsx — evita timer artificial e não reaparece
  // em navegações futuras (voltar, atualizar a página).
  useEffect(() => {
    if (isEdit && (location.state as { justSaved?: boolean } | null)?.justSaved) {
      setSuccessMsg('Jornada criada com sucesso.')
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, location.state])

  useEffect(() => {
    get<TourGuiado[]>('/tours').then(setTours).catch(() => {})
    get<Campanha[]>('/campanhas').then(setCampanhas).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    get<Jornada>(`/jornadas/${id}`)
      .then(j => {
        setForm({
          titulo: j.titulo,
          descricao: j.descricao ?? '',
          ativo: j.ativo,
          segmentar_cliente_ids: j.segmentar_cliente_ids ?? [],
          segmentar_unidade_ids: j.segmentar_unidade_ids ?? [],
          segmentar_perfis: j.segmentar_perfis ?? [],
          segmentar_usuario_tipos: j.segmentar_usuario_tipos ?? [],
          segmentar_estados: j.segmentar_estados ?? [],
        })
        setSlug(j.slug)
        setEtapas(
          (j.etapas ?? []).map(e => ({
            titulo: e.titulo,
            descricao: e.descricao ?? '',
            tipo: e.tipo,
            tour_id: e.tour_id ?? '',
            campanha_id: e.campanha_id ?? '',
            url: e.url ?? '',
            texto_cta: e.texto_cta ?? 'Abrir',
            abrir_nova_aba: e.abrir_nova_aba,
            obrigatoria: e.obrigatoria,
          }))
        )
      })
      .catch(() => setError('Jornada não encontrada.'))
      .finally(() => setLoadingJornada(false))
  }, [id])

  const set = (key: keyof FormState, value: string | boolean | string[]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const setEtapa = (index: number, patch: Partial<EtapaFormState>) =>
    setEtapas(prev => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))

  const addEtapa = () => setEtapas(prev => [...prev, { ...ETAPA_VAZIA }])

  const removeEtapa = (index: number) =>
    setEtapas(prev => prev.filter((_, i) => i !== index))

  const moveEtapa = (index: number, dir: -1 | 1) => {
    setEtapas(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.titulo.trim()) {
      setError('O título da jornada é obrigatório.')
      return
    }
    for (const [i, et] of etapas.entries()) {
      const n = i + 1
      if (!et.titulo.trim()) { setError(`Etapa ${n}: título é obrigatório.`); return }
      if (!et.tipo) { setError(`Etapa ${n}: tipo é obrigatório.`); return }
      if (et.tipo === 'tour' && !et.tour_id) { setError(`Etapa ${n}: selecione um tour.`); return }
      if (et.tipo === 'campanha' && !et.campanha_id) { setError(`Etapa ${n}: selecione uma campanha.`); return }
      if (et.tipo === 'link' && !et.url.trim()) { setError(`Etapa ${n}: informe a URL do link.`); return }
    }

    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        ativo: form.ativo,
        segmentar_cliente_ids: form.segmentar_cliente_ids,
        segmentar_unidade_ids: form.segmentar_unidade_ids,
        segmentar_perfis: form.segmentar_perfis,
        segmentar_usuario_tipos: form.segmentar_usuario_tipos,
        segmentar_estados: form.segmentar_estados,
        // Só envia os campos compatíveis com o tipo de cada etapa — os demais
        // ficam undefined e somem do JSON, satisfazendo a validação de
        // exclusividade da API (tour_id/campanha_id/url mutuamente exclusivos).
        etapas: etapas.map(et => ({
          titulo: et.titulo.trim(),
          descricao: et.descricao.trim() || null,
          tipo: et.tipo,
          tour_id: et.tipo === 'tour' ? et.tour_id : undefined,
          campanha_id: et.tipo === 'campanha' ? et.campanha_id : undefined,
          url: et.tipo === 'link' ? et.url.trim() : undefined,
          texto_cta: et.tipo === 'link' ? (et.texto_cta.trim() || 'Abrir') : undefined,
          abrir_nova_aba: et.tipo === 'link' ? et.abrir_nova_aba : undefined,
          obrigatoria: et.obrigatoria,
        })),
      }

      const saved = isEdit
        ? await put<Jornada>(`/jornadas/${id}`, payload)
        : await post<Jornada>('/jornadas', payload)

      if (isEdit) {
        setSuccessMsg('Jornada atualizada com sucesso.')
      } else {
        navigate(`/jornadas/${saved.id}/editar`, { state: { justSaved: true } })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a jornada. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingJornada) return <div className="px-4 lg:px-margin-desktop py-stack-md"><LoadingSpinner /></div>

  let stepCounter = 0
  const nextStep = () => ++stepCounter

  return (
    <div className="relative">
      {/* Page action bar */}
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <nav className="flex gap-2 text-label-md text-outline mb-0.5">
              <button onClick={() => navigate('/jornadas')} className="hover:text-primary transition-colors">
                Jornadas
              </button>
              <span>/</span>
              <span className="text-on-surface">{isEdit ? 'Editar' : 'Criar Nova'}</span>
            </nav>
            <h2 className="text-headline-md font-bold text-on-surface leading-tight">
              {isEdit ? 'Editar Jornada' : 'Nova Jornada'}
            </h2>
            <p className="text-body-md text-on-surface-variant mt-0.5 hidden sm:block">
              {isEdit
                ? 'Ajuste as etapas e o destino desta jornada de onboarding.'
                : 'Monte uma central de onboarding guiada, com etapas que apontam para tours, campanhas ou links.'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/jornadas')}
              className="px-4 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-all"
            >
              Cancelar
            </button>
            <button
              form="jornada-form"
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop py-5 max-w-[1000px]">
        {successMsg && (
          <div className="mb-5 p-4 bg-tertiary/10 rounded-xl">
            <p className="text-body-md text-tertiary font-semibold flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {successMsg}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/jornadas')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-bright border border-outline-variant rounded-lg text-label-md font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Voltar para listagem
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="mb-5 p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            {error}
          </div>
        )}

        <form id="jornada-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Informações gerais */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="info"
              iconBg="bg-primary-fixed"
              iconColor="text-primary"
              title="Informações gerais"
            />
            <div className="space-y-3">
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">
                  Título <span className="text-error">*</span>
                </label>
                <input
                  required
                  value={form.titulo}
                  onChange={e => set('titulo', e.target.value)}
                  placeholder="Ex: Primeiros passos na agenda"
                  className={field}
                />
                {isEdit && slug && (
                  <p className="mt-1 text-[11px] text-outline">Slug: {slug} (não muda ao editar o título)</p>
                )}
              </div>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Descrição</label>
                <textarea
                  rows={3}
                  value={form.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  placeholder="Texto de apresentação exibido no início da central de onboarding"
                  className={`${field} resize-none`}
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.ativo} onChange={v => set('ativo', v)} />
                <div>
                  <p className="text-body-md font-semibold text-on-surface">{form.ativo ? 'Ativa' : 'Inativa'}</p>
                  <p className="text-label-sm text-on-surface-variant">Jornadas inativas não aparecem para os usuários.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Público e segmentação */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="target"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Público e segmentação"
              description="Opcional — deixe em branco para exibir a jornada para todos os usuários."
            />
            <div className="space-y-3">
              {[
                { key: 'segmentar_cliente_ids' as const, label: 'Cliente IDs', hint: 'cliente_id no init()' },
                { key: 'segmentar_unidade_ids' as const, label: 'Unidade IDs', hint: 'unidade_id no init()' },
                { key: 'segmentar_perfis' as const, label: 'Perfis', hint: 'Perfil no init()' },
                { key: 'segmentar_usuario_tipos' as const, label: 'Tipos de usuário', hint: 'usuario_tipo no init()' },
                { key: 'segmentar_estados' as const, label: 'Estados', hint: 'Estado no init()' },
              ].map(({ key, label, hint }) => (
                <div key={key}>
                  <label className="block text-label-md text-on-surface-variant mb-1">{label}</label>
                  <ChipInput
                    values={form[key]}
                    onChange={v => set(key, v)}
                    placeholder={`${hint} — Enter ou vírgula`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Etapas */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="checklist"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Etapas da jornada"
              description="Defina a sequência de conteúdos que compõem o onboarding."
              action={
                <button
                  type="button"
                  onClick={addEtapa}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-sm font-bold hover:opacity-90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar etapa
                </button>
              }
            />

            {etapas.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center border border-dashed border-outline-variant rounded-xl">
                <span className="material-symbols-outlined text-[32px] text-outline">checklist</span>
                <p className="text-body-md text-on-surface-variant max-w-sm">
                  Nenhuma etapa adicionada ainda. Cada etapa pode apontar para um tour guiado, uma campanha ou um link externo.
                </p>
                <button
                  type="button"
                  onClick={addEtapa}
                  className="px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold"
                >
                  Adicionar etapa
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {etapas.map((et, i) => (
                  <div key={i} className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-label-md font-bold text-on-surface flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-[12px] font-bold">{i + 1}</span>
                        Etapa {i + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveEtapa(i, -1)}
                          disabled={i === 0}
                          title="Mover para cima"
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveEtapa(i, 1)}
                          disabled={i === etapas.length - 1}
                          title="Mover para baixo"
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEtapa(i)}
                          title="Remover etapa"
                          className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">
                          Título da etapa <span className="text-error">*</span>
                        </label>
                        <input
                          required
                          value={et.titulo}
                          onChange={e => setEtapa(i, { titulo: e.target.value })}
                          placeholder="Ex: Conheça a agenda"
                          className={`${field} text-[13px] py-2`}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">Descrição</label>
                        <textarea
                          rows={2}
                          value={et.descricao}
                          onChange={e => setEtapa(i, { descricao: e.target.value })}
                          placeholder="Texto exibido ao usuário para esta etapa"
                          className={`${field} text-[13px] py-2 resize-none`}
                        />
                      </div>

                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">
                          Tipo <span className="text-error">*</span>
                        </label>
                        <Select
                          size="sm"
                          value={et.tipo}
                          onChange={v => setEtapa(i, { tipo: v as TipoEtapaJornada })}
                          options={TIPOS_ETAPA.map(t => ({ value: t.value, label: t.label }))}
                        />
                      </div>
                      <div className="flex items-end pb-2.5">
                        <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={et.obrigatoria}
                            onChange={e => setEtapa(i, { obrigatoria: e.target.checked })}
                            className="rounded text-primary focus:ring-primary"
                          />
                          Etapa obrigatória
                        </label>
                      </div>

                      {et.tipo === 'tour' && (
                        <div className="md:col-span-2">
                          <label className="block text-label-sm text-on-surface-variant mb-1">
                            Tour guiado <span className="text-error">*</span>
                          </label>
                          <Select
                            size="sm"
                            value={et.tour_id}
                            onChange={v => setEtapa(i, { tour_id: v })}
                            placeholder="Selecione um tour existente"
                            options={tours.map(t => ({ value: t.id, label: `${t.titulo}${t.ativo ? '' : ' (inativo)'}` }))}
                          />
                          {tours.length === 0 && (
                            <p className="mt-1 text-[11px] text-outline">Nenhum tour guiado cadastrado ainda.</p>
                          )}
                        </div>
                      )}

                      {et.tipo === 'campanha' && (
                        <div className="md:col-span-2">
                          <label className="block text-label-sm text-on-surface-variant mb-1">
                            Campanha <span className="text-error">*</span>
                          </label>
                          <Select
                            size="sm"
                            value={et.campanha_id}
                            onChange={v => setEtapa(i, { campanha_id: v })}
                            placeholder="Selecione uma campanha existente"
                            options={campanhas.map(c => ({ value: c.id, label: `${c.titulo}${c.ativo ? '' : ' (inativa)'}` }))}
                          />
                          {campanhas.length === 0 && (
                            <p className="mt-1 text-[11px] text-outline">Nenhuma campanha cadastrada ainda.</p>
                          )}
                        </div>
                      )}

                      {et.tipo === 'link' && (
                        <>
                          <div className="md:col-span-2">
                            <label className="block text-label-sm text-on-surface-variant mb-1">
                              URL <span className="text-error">*</span>
                            </label>
                            <input
                              type="url"
                              required
                              value={et.url}
                              onChange={e => setEtapa(i, { url: e.target.value })}
                              placeholder="https://..."
                              className={`${field} text-[13px] py-2`}
                            />
                          </div>
                          <div>
                            <label className="block text-label-sm text-on-surface-variant mb-1">Texto do botão</label>
                            <input
                              value={et.texto_cta}
                              onChange={e => setEtapa(i, { texto_cta: e.target.value })}
                              placeholder="Abrir"
                              className={`${field} text-[13px] py-2`}
                            />
                          </div>
                          <div className="flex items-end pb-2.5">
                            <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                              <input
                                type="checkbox"
                                checked={et.abrir_nova_aba}
                                onChange={e => setEtapa(i, { abrir_nova_aba: e.target.checked })}
                                className="rounded text-primary focus:ring-primary"
                              />
                              Abrir em nova aba
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}

// Mesmo componente usado em /campanhas/nova para os campos de segmentação
// (não existe como componente compartilhado ainda — replicado aqui de forma
// simples, igual ao original).
function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')

  const commit = () => {
    const toAdd = input.split(',').map(s => s.trim()).filter(s => s && !values.includes(s))
    if (toAdd.length) onChange([...values, ...toAdd])
    setInput('')
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-[42px] px-2.5 py-2 rounded-lg border border-outline-variant bg-surface-bright focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-colors cursor-text"
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      {values.map(v => (
        <span key={v} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[12px] font-medium px-2 py-0.5 rounded-md shrink-0">
          {v}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(values.filter(x => x !== v)) }}
            className="hover:text-error ml-0.5 leading-none"
          >
            <span className="material-symbols-outlined text-[12px]">close</span>
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[120px] bg-transparent text-body-md text-on-surface outline-none placeholder:text-outline"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !input && values.length > 0) {
            onChange(values.slice(0, -1))
          }
        }}
        onBlur={commit}
        placeholder={values.length === 0 ? (placeholder ?? 'Separar por vírgula ou Enter') : ''}
      />
    </div>
  )
}
