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
  permitir_refazer: boolean
  permitir_pacotes_fora_ordem: boolean
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
}

const EMPTY: FormState = {
  titulo: '', descricao: '', ativo: true, permitir_refazer: false, permitir_pacotes_fora_ordem: true,
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

// Nome técnico: BlocoJornada. Nome visual nesta tela e no widget: "Pacote".
interface BlocoFormState {
  titulo: string
  descricao: string
  obrigatorio: boolean
  ativo: boolean
  etapas: EtapaFormState[]
}

const BLOCO_VAZIO: BlocoFormState = {
  titulo: '', descricao: '', obrigatorio: true, ativo: true, etapas: [],
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
  const [blocos, setBlocos] = useState<BlocoFormState[]>([])
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
          permitir_refazer: j.permitir_refazer ?? false,
          permitir_pacotes_fora_ordem: j.permitir_pacotes_fora_ordem ?? true,
          segmentar_cliente_ids: j.segmentar_cliente_ids ?? [],
          segmentar_unidade_ids: j.segmentar_unidade_ids ?? [],
          segmentar_perfis: j.segmentar_perfis ?? [],
          segmentar_usuario_tipos: j.segmentar_usuario_tipos ?? [],
          segmentar_estados: j.segmentar_estados ?? [],
        })
        setSlug(j.slug)
        setBlocos(
          (j.blocos ?? []).map(b => ({
            titulo: b.titulo,
            descricao: b.descricao ?? '',
            obrigatorio: b.obrigatorio,
            ativo: b.ativo,
            etapas: (b.etapas ?? []).map(e => ({
              titulo: e.titulo,
              descricao: e.descricao ?? '',
              tipo: e.tipo,
              tour_id: e.tour_id ?? '',
              campanha_id: e.campanha_id ?? '',
              url: e.url ?? '',
              texto_cta: e.texto_cta ?? 'Abrir',
              abrir_nova_aba: e.abrir_nova_aba,
              obrigatoria: e.obrigatoria,
            })),
          }))
        )
      })
      .catch(() => setError('Jornada não encontrada.'))
      .finally(() => setLoadingJornada(false))
  }, [id])

  const set = (key: keyof FormState, value: string | boolean | string[]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const setBloco = (index: number, patch: Partial<BlocoFormState>) =>
    setBlocos(prev => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))

  const addBloco = () => setBlocos(prev => [...prev, { ...BLOCO_VAZIO, etapas: [] }])

  const removeBloco = (index: number) =>
    setBlocos(prev => prev.filter((_, i) => i !== index))

  const moveBloco = (index: number, dir: -1 | 1) => {
    setBlocos(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const setEtapa = (blocoIndex: number, etapaIndex: number, patch: Partial<EtapaFormState>) =>
    setBlocos(prev => prev.map((b, bi) => (
      bi !== blocoIndex ? b : { ...b, etapas: b.etapas.map((e, ei) => (ei === etapaIndex ? { ...e, ...patch } : e)) }
    )))

  const addEtapa = (blocoIndex: number) =>
    setBlocos(prev => prev.map((b, bi) => (bi === blocoIndex ? { ...b, etapas: [...b.etapas, { ...ETAPA_VAZIA }] } : b)))

  const removeEtapa = (blocoIndex: number, etapaIndex: number) =>
    setBlocos(prev => prev.map((b, bi) => (
      bi !== blocoIndex ? b : { ...b, etapas: b.etapas.filter((_, ei) => ei !== etapaIndex) }
    )))

  const moveEtapa = (blocoIndex: number, etapaIndex: number, dir: -1 | 1) =>
    setBlocos(prev => prev.map((b, bi) => {
      if (bi !== blocoIndex) return b
      const next = [...b.etapas]
      const target = etapaIndex + dir
      if (target < 0 || target >= next.length) return b
      ;[next[etapaIndex], next[target]] = [next[target], next[etapaIndex]]
      return { ...b, etapas: next }
    }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.titulo.trim()) {
      setError('O título da jornada é obrigatório.')
      return
    }
    if (blocos.length === 0) {
      setError('A jornada precisa ter pelo menos um pacote.')
      return
    }
    for (const [bi, bloco] of blocos.entries()) {
      const bn = bi + 1
      if (!bloco.titulo.trim()) { setError(`Pacote ${bn}: título é obrigatório.`); return }
      if (bloco.etapas.length === 0) { setError(`Pacote ${bn}: adicione pelo menos uma etapa.`); return }
      for (const [ei, et] of bloco.etapas.entries()) {
        const rotulo = `Pacote ${bn} - Etapa ${ei + 1}`
        if (!et.titulo.trim()) { setError(`${rotulo}: título é obrigatório.`); return }
        if (!et.tipo) { setError(`${rotulo}: tipo é obrigatório.`); return }
        if (et.tipo === 'tour' && !et.tour_id) { setError(`${rotulo}: selecione um tour.`); return }
        if (et.tipo === 'campanha' && !et.campanha_id) { setError(`${rotulo}: selecione uma campanha.`); return }
        if (et.tipo === 'link' && !et.url.trim()) { setError(`${rotulo}: informe a URL do link.`); return }
      }
    }

    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        ativo: form.ativo,
        permitir_refazer: form.permitir_refazer,
        permitir_pacotes_fora_ordem: form.permitir_pacotes_fora_ordem,
        segmentar_cliente_ids: form.segmentar_cliente_ids,
        segmentar_unidade_ids: form.segmentar_unidade_ids,
        segmentar_perfis: form.segmentar_perfis,
        segmentar_usuario_tipos: form.segmentar_usuario_tipos,
        segmentar_estados: form.segmentar_estados,
        // Só envia os campos compatíveis com o tipo de cada etapa — os demais
        // ficam undefined e somem do JSON, satisfazendo a validação de
        // exclusividade da API (tour_id/campanha_id/url mutuamente exclusivos).
        blocos: blocos.map(b => ({
          titulo: b.titulo.trim(),
          descricao: b.descricao.trim() || null,
          obrigatorio: b.obrigatorio,
          ativo: b.ativo,
          etapas: b.etapas.map(et => ({
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
      <div className="px-4 lg:px-margin-desktop py-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface">
              {isEdit ? 'Editar Jornada' : 'Nova Jornada'}
            </h2>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              {isEdit
                ? 'Ajuste os pacotes e o destino desta jornada de onboarding.'
                : 'Monte uma central de onboarding guiada, organizada em pacotes de etapas.'}
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

      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-5 max-w-[1000px]">
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
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.permitir_refazer} onChange={v => set('permitir_refazer', v)} />
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Permitir que o usuário refaça etapas concluídas</p>
                  <p className="text-label-sm text-on-surface-variant">Quando desativado, etapas concluídas ficam bloqueadas para o usuário final.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <ToggleSwitch checked={form.permitir_pacotes_fora_ordem} onChange={v => set('permitir_pacotes_fora_ordem', v)} />
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Permitir acessar pacotes fora de ordem</p>
                  <p className="text-label-sm text-on-surface-variant">Quando desativado, o usuário precisa concluir o pacote anterior para acessar o próximo.</p>
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

          {/* Pacotes (BlocoJornada) */}
          <div className={card}>
            <CardHeader
              number={nextStep()}
              icon="folder_open"
              iconBg="bg-secondary-fixed"
              iconColor="text-secondary"
              title="Pacotes da jornada"
              description="Agrupe as etapas em pacotes — o usuário navega pacote por pacote."
              action={
                <button
                  type="button"
                  onClick={addBloco}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-sm font-bold hover:opacity-90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar pacote
                </button>
              }
            />

            {blocos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center border border-dashed border-outline-variant rounded-xl">
                <span className="material-symbols-outlined text-[32px] text-outline">folder_open</span>
                <p className="text-body-md text-on-surface-variant max-w-sm">
                  Nenhum pacote adicionado ainda. Cada pacote agrupa um conjunto de etapas (tour, campanha ou link).
                </p>
                <button
                  type="button"
                  onClick={addBloco}
                  className="px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold"
                >
                  Adicionar pacote
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {blocos.map((bloco, bi) => (
                  <div key={bi} className="rounded-xl border border-outline-variant bg-surface-container-low/60 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-label-md font-bold text-on-surface flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-secondary-fixed text-secondary flex items-center justify-center text-[12px] font-bold">{bi + 1}</span>
                        Pacote {bi + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveBloco(bi, -1)}
                          disabled={bi === 0}
                          title="Mover para cima"
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBloco(bi, 1)}
                          disabled={bi === blocos.length - 1}
                          title="Mover para baixo"
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                        >
                          <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBloco(bi)}
                          title="Remover pacote"
                          className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <div className="md:col-span-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">
                          Título do pacote <span className="text-error">*</span>
                        </label>
                        <input
                          required
                          value={bloco.titulo}
                          onChange={e => setBloco(bi, { titulo: e.target.value })}
                          placeholder="Ex: Configurações"
                          className={`${field} text-[13px] py-2`}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">Descrição</label>
                        <textarea
                          rows={2}
                          value={bloco.descricao}
                          onChange={e => setBloco(bi, { descricao: e.target.value })}
                          placeholder="Texto exibido ao usuário para este pacote"
                          className={`${field} text-[13px] py-2 resize-none`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bloco.obrigatorio}
                            onChange={e => setBloco(bi, { obrigatorio: e.target.checked })}
                            className="rounded text-primary focus:ring-primary"
                          />
                          Pacote obrigatório
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={bloco.ativo} onChange={v => setBloco(bi, { ativo: v })} />
                        <span className="text-body-md text-on-surface">{bloco.ativo ? 'Ativo' : 'Inativo'}</span>
                      </div>
                    </div>

                    {/* Etapas do pacote */}
                    <div className="pl-3 border-l-2 border-outline-variant/60 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">Etapas deste pacote</p>
                        <button
                          type="button"
                          onClick={() => addEtapa(bi)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-surface-bright border border-outline-variant rounded-lg text-label-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Adicionar etapa
                        </button>
                      </div>

                      {bloco.etapas.length === 0 ? (
                        <p className="text-label-sm text-on-surface-variant py-2">Nenhuma etapa neste pacote ainda.</p>
                      ) : (
                        <div className="space-y-3">
                          {bloco.etapas.map((et, ei) => (
                            <div key={ei} className="rounded-xl border border-outline-variant bg-surface-bright p-4">
                              <div className="flex items-center justify-between gap-2 mb-3">
                                <span className="text-label-md font-bold text-on-surface flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-primary-fixed text-primary flex items-center justify-center text-[12px] font-bold">{ei + 1}</span>
                                  Etapa {ei + 1}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveEtapa(bi, ei, -1)}
                                    disabled={ei === 0}
                                    title="Mover para cima"
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveEtapa(bi, ei, 1)}
                                    disabled={ei === bloco.etapas.length - 1}
                                    title="Mover para baixo"
                                    className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeEtapa(bi, ei)}
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
                                    onChange={e => setEtapa(bi, ei, { titulo: e.target.value })}
                                    placeholder="Ex: Conheça a agenda"
                                    className={`${field} text-[13px] py-2`}
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-label-sm text-on-surface-variant mb-1">Descrição</label>
                                  <textarea
                                    rows={2}
                                    value={et.descricao}
                                    onChange={e => setEtapa(bi, ei, { descricao: e.target.value })}
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
                                    onChange={v => setEtapa(bi, ei, { tipo: v as TipoEtapaJornada })}
                                    options={TIPOS_ETAPA.map(t => ({ value: t.value, label: t.label }))}
                                  />
                                </div>
                                <div className="flex items-end pb-2.5">
                                  <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={et.obrigatoria}
                                      onChange={e => setEtapa(bi, ei, { obrigatoria: e.target.checked })}
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
                                      onChange={v => setEtapa(bi, ei, { tour_id: v })}
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
                                      onChange={v => setEtapa(bi, ei, { campanha_id: v })}
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
                                        onChange={e => setEtapa(bi, ei, { url: e.target.value })}
                                        placeholder="https://..."
                                        className={`${field} text-[13px] py-2`}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-label-sm text-on-surface-variant mb-1">Texto do botão</label>
                                      <input
                                        value={et.texto_cta}
                                        onChange={e => setEtapa(bi, ei, { texto_cta: e.target.value })}
                                        placeholder="Abrir"
                                        className={`${field} text-[13px] py-2`}
                                      />
                                    </div>
                                    <div className="flex items-end pb-2.5">
                                      <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={et.abrir_nova_aba}
                                          onChange={e => setEtapa(bi, ei, { abrir_nova_aba: e.target.checked })}
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
