import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { Campanha, Jornada, Sistema, TipoEtapaJornada, TourGuiado } from '../../types'
import { LoadingSpinner, EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { limiteTrial } from '../../utils/limiteTrial'

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
  // Hostnames puros (sem protocolo/porta/path) — Jornada não tem sistema/tela
  // (ver comentário no topo de widget.ts, seção Jornadas), então o catálogo
  // oferecido aqui é a união de Sistema.dominios de TODOS os sistemas do
  // tenant (ver sistemasDominiosUnificados em JornadaForm), não de um único
  // sistema como em Campanha/Tour.
  segmentar_dominios: string[]
}

const EMPTY: FormState = {
  titulo: '',
  descricao: '',
  ativo: true,
  permitir_refazer: false,
  permitir_pacotes_fora_ordem: true,
  segmentar_cliente_ids: [],
  segmentar_unidade_ids: [],
  segmentar_perfis: [],
  segmentar_usuario_tipos: [],
  segmentar_estados: [],
  segmentar_dominios: [],
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
  titulo: '',
  descricao: '',
  tipo: 'link',
  tour_id: '',
  campanha_id: '',
  url: '',
  texto_cta: 'Abrir',
  abrir_nova_aba: true,
  obrigatoria: true,
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
  titulo: '',
  descricao: '',
  obrigatorio: true,
  ativo: true,
  etapas: [],
}

type Selecionado =
  | { tipo: 'jornada' }
  | { tipo: 'segmentacao' }
  | { tipo: 'bloco'; blocoIndex: number }
  | { tipo: 'etapa'; blocoIndex: number; etapaIndex: number }

const field = 'w-full h-11 rounded-xl border border-[#ced0d4] bg-white px-3 text-body-md text-on-surface outline-none transition-colors focus:border-2 focus:border-primary'
const textarea = `${field} h-auto resize-none py-3`

const TIPOS_ETAPA: { value: TipoEtapaJornada; label: string; icon: string; desc: string }[] = [
  { value: 'tour', label: 'Tour guiado', icon: 'map', desc: 'Inicia um tour a partir da jornada.' },
  { value: 'campanha', label: 'Campanha', icon: 'campaign', desc: 'Mostra uma campanha existente.' },
  { value: 'link', label: 'Link externo', icon: 'link', desc: 'Leva para uma URL de apoio.' },
]

const SEGMENTOS: Array<{ key: keyof Pick<FormState, 'segmentar_cliente_ids' | 'segmentar_unidade_ids' | 'segmentar_perfis' | 'segmentar_usuario_tipos' | 'segmentar_estados'>; label: string; hint: string }> = [
  { key: 'segmentar_cliente_ids', label: 'Cliente IDs', hint: 'cliente_id no init()' },
  { key: 'segmentar_unidade_ids', label: 'Unidade IDs', hint: 'unidade_id no init()' },
  { key: 'segmentar_perfis', label: 'Perfis', hint: 'Perfil no init()' },
  { key: 'segmentar_usuario_tipos', label: 'Tipos de usuário', hint: 'usuario_tipo no init()' },
  { key: 'segmentar_estados', label: 'Estados', hint: 'Estado no init()' },
]

function tipoEtapaConfig(tipo: TipoEtapaJornada) {
  return TIPOS_ETAPA.find(t => t.value === tipo) ?? TIPOS_ETAPA[2]
}

function pendenciasJornada(form: FormState, blocos: BlocoFormState[]): string[] {
  const pendencias: string[] = []
  if (!form.titulo.trim()) pendencias.push('Informe o título da jornada.')
  if (blocos.length === 0) pendencias.push('Adicione pelo menos um pacote.')

  blocos.forEach((bloco, bi) => {
    const pacote = `Pacote ${bi + 1}`
    if (!bloco.titulo.trim()) pendencias.push(`${pacote}: informe o título.`)
    if (bloco.etapas.length === 0) pendencias.push(`${pacote}: adicione pelo menos uma etapa.`)

    bloco.etapas.forEach((etapa, ei) => {
      const rotulo = `${pacote}, etapa ${ei + 1}`
      if (!etapa.titulo.trim()) pendencias.push(`${rotulo}: informe o título.`)
      if (etapa.tipo === 'tour' && !etapa.tour_id) pendencias.push(`${rotulo}: selecione um tour.`)
      if (etapa.tipo === 'campanha' && !etapa.campanha_id) pendencias.push(`${rotulo}: selecione uma campanha.`)
      if (etapa.tipo === 'link' && !etapa.url.trim()) pendencias.push(`${rotulo}: informe a URL.`)
    })
  })

  return pendencias
}

function totalSegmentos(form: FormState): number {
  return SEGMENTOS.reduce((total, segmento) => total + form[segmento.key].length, 0) + form.segmentar_dominios.length
}

export function JornadaForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [slug, setSlug] = useState('')
  const [blocos, setBlocos] = useState<BlocoFormState[]>([])
  const [tours, setTours] = useState<TourGuiado[]>([])
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [todasJornadas, setTodasJornadas] = useState<Jornada[]>([])
  const [loadingJornada, setLoadingJornada] = useState(isEdit)
  const [carregandoLimite, setCarregandoLimite] = useState(!isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<Selecionado>({ tipo: 'jornada' })
  const [previewAberto, setPreviewAberto] = useState(false)
  const [previewBlocoIndex, setPreviewBlocoIndex] = useState<number | null>(null)
  const [previewRealAberto, setPreviewRealAberto] = useState(false)

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

  // Catálogo de domínios pro campo de segmentação abaixo — Jornada não tem
  // sistema/tela (central aberta manualmente pelo usuário), então oferece a
  // união de Sistema.dominios de TODOS os sistemas do tenant, não de um
  // único sistema (diferente de CampanhaForm/tours Form.tsx).
  const [sistemasConfig, setSistemasConfig] = useState<Sistema[]>([])
  useEffect(() => {
    get<Sistema[]>('/sistemas?ativo=true').then(setSistemasConfig).catch(() => {})
  }, [])
  const catalogoDominios = Array.from(new Set(sistemasConfig.flatMap(s => s.dominios)))

  useEffect(() => {
    get<Jornada[]>('/jornadas').then(setTodasJornadas).catch(() => {}).finally(() => setCarregandoLimite(false))
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
          segmentar_dominios: j.segmentar_dominios ?? [],
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

  const addBloco = () => {
    const novoIndex = blocos.length
    setBlocos(prev => [...prev, { ...BLOCO_VAZIO, etapas: [{ ...ETAPA_VAZIA }] }])
    setSelecionado({ tipo: 'bloco', blocoIndex: novoIndex })
    setPreviewAberto(true)
  }

  const removeBloco = (index: number) => {
    setBlocos(prev => prev.filter((_, i) => i !== index))
    setSelecionado({ tipo: 'jornada' })
    setPreviewBlocoIndex(null)
  }

  const moveBloco = (index: number, dir: -1 | 1) => {
    setBlocos(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setSelecionado({ tipo: 'bloco', blocoIndex: index + dir })
  }

  const setEtapa = (blocoIndex: number, etapaIndex: number, patch: Partial<EtapaFormState>) =>
    setBlocos(prev => prev.map((b, bi) => (
      bi !== blocoIndex ? b : { ...b, etapas: b.etapas.map((e, ei) => (ei === etapaIndex ? { ...e, ...patch } : e)) }
    )))

  const addEtapa = (blocoIndex: number, tipo: TipoEtapaJornada = 'link') => {
    const etapaIndex = blocos[blocoIndex]?.etapas.length ?? 0
    setBlocos(prev => prev.map((b, bi) => (bi === blocoIndex ? { ...b, etapas: [...b.etapas, { ...ETAPA_VAZIA, tipo }] } : b)))
    setSelecionado({ tipo: 'etapa', blocoIndex, etapaIndex })
  }

  const removeEtapa = (blocoIndex: number, etapaIndex: number) => {
    setBlocos(prev => prev.map((b, bi) => (
      bi !== blocoIndex ? b : { ...b, etapas: b.etapas.filter((_, ei) => ei !== etapaIndex) }
    )))
    setSelecionado({ tipo: 'bloco', blocoIndex })
  }

  const moveEtapa = (blocoIndex: number, etapaIndex: number, dir: -1 | 1) => {
    setBlocos(prev => prev.map((b, bi) => {
      if (bi !== blocoIndex) return b
      const next = [...b.etapas]
      const target = etapaIndex + dir
      if (target < 0 || target >= next.length) return b
      ;[next[etapaIndex], next[target]] = [next[target], next[etapaIndex]]
      return { ...b, etapas: next }
    }))
    setSelecionado({ tipo: 'etapa', blocoIndex, etapaIndex: etapaIndex + dir })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const pendencias = pendenciasJornada(form, blocos)
    if (pendencias.length > 0) {
      setError(pendencias[0])
      return
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
        segmentar_dominios: form.segmentar_dominios,
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

      if (isEdit) setSuccessMsg('Jornada atualizada com sucesso.')
      else navigate(`/jornadas/${saved.id}/editar`, { state: { justSaved: true } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a jornada. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingJornada || carregandoLimite) return <div className="px-4 lg:px-margin-desktop py-stack-md"><LoadingSpinner /></div>

  if (!isEdit) {
    const limite = limiteTrial(user?.tenant.plano, user?.tenant.plano?.limite_jornadas_ativas, todasJornadas.length, 'jornada')
    if (limite.atingido) {
      return (
        <div className="px-4 lg:px-margin-desktop py-10">
          <EmptyState
            icon="lock"
            title="Limite do teste grátis atingido"
            description={limite.mensagem!}
            action={<Button onClick={() => navigate('/jornadas')}>Voltar para Jornadas</Button>}
          />
        </div>
      )
    }
  }

  const pendencias = pendenciasJornada(form, blocos)
  const segmentos = totalSegmentos(form)
  const selecionadoExiste = selecionado.tipo === 'bloco'
    ? Boolean(blocos[selecionado.blocoIndex])
    : selecionado.tipo === 'etapa'
      ? Boolean(blocos[selecionado.blocoIndex]?.etapas[selecionado.etapaIndex])
      : true
  const selecaoAtual = selecionadoExiste ? selecionado : { tipo: 'jornada' as const }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-surface-container-lowest">
      <div className="border-b border-outline-variant/40 bg-surface/95 backdrop-blur">
        <div className="px-4 lg:px-margin-desktop py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button type="button" onClick={() => navigate('/jornadas')} className="mb-2 inline-flex items-center gap-1 text-label-md font-bold text-on-surface-variant transition-colors hover:text-primary">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Jornadas
              </button>
              <h2 className="text-headline-sm font-semibold text-on-surface">{isEdit ? 'Editar jornada' : 'Criar jornada'}</h2>
              <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">
                Monte uma experiência de onboarding em pacotes. Organize a sequência no centro e edite cada detalhe no painel lateral.
              </p>
              {isEdit && slug && <p className="mt-1 text-label-sm text-outline">Slug: {slug}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => navigate('/jornadas')} variant="ghost">Cancelar</Button>
              <Button form="jornada-form" type="submit" disabled={submitting} size="md" variant="gradient">
                {submitting ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Publicar jornada'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <section className="px-4 lg:px-margin-desktop py-5">
        {successMsg && (
          <div className="mb-5 rounded-2xl border border-tertiary/20 bg-tertiary/10 p-4 text-tertiary">
            <p className="flex items-center gap-2 text-body-md font-bold"><span className="material-symbols-outlined text-[18px]">check_circle</span>{successMsg}</p>
          </div>
        )}
        {error && (
          <div className="mb-5 rounded-2xl bg-error-container p-4 text-on-error-container">
            <p className="flex items-center gap-2 text-body-md font-bold"><span className="material-symbols-outlined text-[18px]">error</span>{error}</p>
          </div>
        )}

        <form id="jornada-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-5 xl:order-2">
            <div className="rounded-[28px] border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
              <div className="border-b border-outline-variant/50 pb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                  <p className="text-label-md font-bold uppercase tracking-wide text-primary">Prévia no produto</p>
                  <h3 className="mt-1 text-title-lg font-bold text-on-surface">Monte a sidebar que o usuário verá</h3>
                  <p className="mt-1 text-body-md text-on-surface-variant">Edite direto na prévia quando fizer sentido. Para ajustes detalhados, selecione um item e use o painel à esquerda.</p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setPreviewRealAberto(true)}
                    variant="secondary"
                    iconLeft={<span className="material-symbols-outlined text-[18px]">visibility</span>}
                  >
                    Preview real
                  </Button>
                </div>
              </div>

              <JornadaProdutoPreview
                form={form}
                blocos={blocos}
                selecionado={selecaoAtual}
                aberto={previewAberto}
                blocoAbertoIndex={previewBlocoIndex}
                onToggleAberto={() => setPreviewAberto(prev => !prev)}
                onFechar={() => setPreviewAberto(false)}
                onVoltarPacotes={() => setPreviewBlocoIndex(null)}
                onEditarJornada={() => setSelecionado({ tipo: 'jornada' })}
                onSetTitulo={value => set('titulo', value)}
                onAddBloco={addBloco}
                onSelectBloco={bi => { setSelecionado({ tipo: 'bloco', blocoIndex: bi }); setPreviewBlocoIndex(bi) }}
                onEditarBloco={bi => setSelecionado({ tipo: 'bloco', blocoIndex: bi })}
                onAddEtapa={(bi, tipo) => addEtapa(bi, tipo)}
                onSelectEtapa={(bi, ei) => setSelecionado({ tipo: 'etapa', blocoIndex: bi, etapaIndex: ei })}
                onMoveBloco={moveBloco}
                onRemoveBloco={removeBloco}
                onMoveEtapa={moveEtapa}
                onRemoveEtapa={removeEtapa}
              />
            </div>
          </div>

          <aside className="xl:sticky xl:top-5 xl:order-1 xl:self-start">
            <div className="overflow-hidden rounded-[28px] border border-outline-variant bg-surface shadow-sm">
              <div className="border-b border-outline-variant/50 bg-surface-container-low/50 p-4">
                <p className="text-label-md font-bold uppercase tracking-wide text-primary">Painel de edição</p>
                <h3 className="mt-1 text-title-md font-bold text-on-surface">{tituloPainel(selecaoAtual, blocos)}</h3>
              </div>
              <div className="p-4">
                {selecaoAtual.tipo === 'jornada' && (
                  <PainelJornada form={form} slug={slug} isEdit={isEdit} segmentos={segmentos} onSet={set} onOpenSegmentacao={() => setSelecionado({ tipo: 'segmentacao' })} />
                )}
                {selecaoAtual.tipo === 'segmentacao' && <PainelSegmentacao form={form} onSet={set} catalogoDominios={catalogoDominios} />}
                {selecaoAtual.tipo === 'bloco' && blocos[selecaoAtual.blocoIndex] && (
                  <PainelBloco
                    bloco={blocos[selecaoAtual.blocoIndex]}
                    index={selecaoAtual.blocoIndex}
                    onPatch={patch => setBloco(selecaoAtual.blocoIndex, patch)}
                    onAddEtapa={tipo => addEtapa(selecaoAtual.blocoIndex, tipo)}
                  />
                )}
                {selecaoAtual.tipo === 'etapa' && blocos[selecaoAtual.blocoIndex]?.etapas[selecaoAtual.etapaIndex] && (
                  <PainelEtapa
                    etapa={blocos[selecaoAtual.blocoIndex].etapas[selecaoAtual.etapaIndex]}
                    blocoIndex={selecaoAtual.blocoIndex}
                    etapaIndex={selecaoAtual.etapaIndex}
                    tours={tours}
                    campanhas={campanhas}
                    onPatch={patch => setEtapa(selecaoAtual.blocoIndex, selecaoAtual.etapaIndex, patch)}
                  />
                )}
              </div>

              <div className="border-t border-outline-variant/50 bg-surface-container-low/40 p-4">
                <p className="mb-2 text-label-md font-bold text-on-surface">Pronto para publicar?</p>
                {pendencias.length === 0 ? (
                  <p className="flex items-start gap-2 text-body-md text-tertiary"><span className="material-symbols-outlined text-[18px]">task_alt</span>A jornada já tem o mínimo necessário.</p>
                ) : (
                  <ul className="space-y-1.5 text-body-md text-on-surface-variant">
                    {pendencias.slice(0, 4).map(p => <li key={p} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-error" />{p}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </aside>
        </form>

        {previewRealAberto && (
          <JornadaPreviewReal
            form={form}
            blocos={blocos}
            onClose={() => setPreviewRealAberto(false)}
          />
        )}
      </section>
    </div>
  )
}

function tituloPainel(selecionado: Selecionado, blocos: BlocoFormState[]): string {
  if (selecionado.tipo === 'segmentacao') return 'Público e segmentação'
  if (selecionado.tipo === 'bloco') return blocos[selecionado.blocoIndex]?.titulo || `Pacote ${selecionado.blocoIndex + 1}`
  if (selecionado.tipo === 'etapa') return blocos[selecionado.blocoIndex]?.etapas[selecionado.etapaIndex]?.titulo || `Etapa ${selecionado.etapaIndex + 1}`
  return 'Informações da jornada'
}

function JornadaPreviewReal({ form, blocos, onClose }: { form: FormState; blocos: BlocoFormState[]; onClose: () => void }) {
  const [painelAberto, setPainelAberto] = useState(true)
  const [blocoAbertoIndex, setBlocoAbertoIndex] = useState<number | null>(null)
  const blocoAberto = blocoAbertoIndex == null ? null : blocos[blocoAbertoIndex]
  const titulo = form.titulo.trim() || 'Jornada de ativação'
  const descricao = form.descricao.trim()

  return (
    <div className="fixed inset-0 z-[2147483000] bg-slate-950/45 backdrop-blur-[2px]">
      <div className="absolute left-4 top-4 z-[2147483010] flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-lg">
        <span className="material-symbols-outlined text-[17px] text-primary">visibility</span>
        <span className="text-label-md font-bold text-on-surface">Preview real</span>
        <button type="button" onClick={onClose} className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high" aria-label="Fechar preview real">
          <span className="material-symbols-outlined text-[17px]">close</span>
        </button>
      </div>

      <div className="h-full w-full bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,.30),transparent_24%),linear-gradient(135deg,#eef4ff,#f8fafc_45%,#e8edf6)] p-8">
        <div className="mx-auto mt-16 max-w-5xl rounded-[32px] border border-white/80 bg-white/70 p-6 shadow-xl backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="h-3 w-36 rounded-full bg-slate-300" />
              <div className="mt-3 h-8 w-72 rounded-full bg-slate-200" />
            </div>
            <div className="h-10 w-32 rounded-full bg-primary/15" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-40 rounded-3xl bg-white shadow-sm" />
            <div className="h-40 rounded-3xl bg-white shadow-sm" />
            <div className="h-40 rounded-3xl bg-white shadow-sm" />
          </div>
          <div className="mt-5 rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 h-3 w-48 rounded-full bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 rounded-full bg-slate-200" />
              <div className="h-3 w-5/6 rounded-full bg-slate-200" />
              <div className="h-3 w-2/3 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      </div>

      {!painelAberto && (
        <button type="button" onClick={() => setPainelAberto(true)} className="fixed bottom-[88px] right-6 z-[2147483030] flex h-11 items-center gap-2 rounded-full bg-[#0058be] px-[18px] pl-3.5 text-[13px] font-extrabold text-white shadow-[0_14px_32px_rgba(0,88,190,.28)] transition-transform hover:-translate-y-0.5">
          <span className="material-symbols-outlined text-[18px]">route</span>
          Ajuda
        </button>
      )}

      {painelAberto && (
        <div className="fixed bottom-0 right-0 top-0 z-[2147483040] flex w-[360px] max-w-[92vw] flex-col border-l border-[#e0e2ef] bg-white shadow-[-12px_0_32px_rgba(11,28,48,.14)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e0e2ef]/70 px-[18px] py-4">
            <h3 className="m-0 text-[16px] font-extrabold text-[#0b1c30]">Central de ajuda</h3>
            <button type="button" onClick={() => setPainelAberto(false)} aria-label="Fechar central de ajuda" className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition-colors hover:bg-[#f1f3fa]">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-4 py-[14px]">
            {blocoAberto ? (
              <div>
                <button type="button" onClick={() => setBlocoAbertoIndex(null)} className="mb-2 flex items-center gap-1 text-[12px] font-bold text-[#0058be] hover:underline">
                  <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                  Voltar para pacotes
                </button>
                <h4 className="m-0 text-[14px] font-extrabold text-[#0b1c30]">{blocoAberto.titulo || `Pacote ${blocoAbertoIndex! + 1}`}</h4>
                {blocoAberto.descricao && <p className="mb-3 mt-1 text-[12.5px] leading-[1.4] text-[#424754]">{blocoAberto.descricao}</p>}
                <div className="flex flex-col gap-2">
                  {blocoAberto.etapas.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[#e0e2ef] bg-[#f8f9ff] p-5 text-center text-[13px] text-[#727785]">Nenhuma etapa neste pacote.</div>
                  ) : blocoAberto.etapas.map((etapa, ei) => {
                    const tipo = tipoEtapaConfig(etapa.tipo)
                    return (
                      <button key={ei} type="button" className="flex w-full items-start gap-2.5 rounded-[12px] border border-[#e0e2ef] bg-white p-3 text-left transition-colors hover:border-[#0058be] hover:bg-[#f6f9ff]">
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#eff4ff] text-[11px] font-extrabold text-[#0058be]">{ei + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-[#0b1c30]">{etapa.titulo || `Etapa ${ei + 1}`}</span>
                          {etapa.descricao && <span className="mt-0.5 block text-[11.5px] leading-[1.35] text-[#424754]">{etapa.descricao}</span>}
                          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[.02em] text-[#8a90a3]">{tipo.label}{etapa.obrigatoria ? '' : ' · opcional'}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="relative shrink-0">
                  <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#8a90a3]">search</span>
                  <input readOnly value="" placeholder="Buscar etapas, pacotes ou jornadas" className="h-9 w-full rounded-[10px] border border-[#e0e2ef] bg-[#f8f9ff] pl-8 pr-3 text-[12.5px] text-[#0b1c30] outline-none" />
                </div>
                <div className="flex flex-col gap-[14px]">
                  <h4 className="m-0 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#8a90a3]">Jornadas</h4>
                  <div>
                    <h4 className="m-0 text-[14px] font-extrabold text-[#0b1c30]">{titulo}</h4>
                    {descricao && <p className="mb-2 mt-1 text-[12.5px] leading-[1.4] text-[#424754]">{descricao}</p>}
                    {blocos.length > 0 && <p className="mb-2 text-[11px] font-bold text-[#727785]">0 de {blocos.length} pacotes concluídos</p>}
                    <div className="flex flex-col gap-2">
                      {blocos.length === 0 ? (
                        <div className="rounded-[14px] border border-dashed border-[#e0e2ef] bg-[#f8f9ff] p-5 text-center text-[13px] text-[#727785]">Nenhum pacote disponível.</div>
                      ) : blocos.map((bloco, bi) => (
                        <button key={bi} type="button" onClick={() => setBlocoAbertoIndex(bi)} className="flex w-full items-center justify-between gap-2 rounded-[12px] border border-[#e0e2ef] bg-white p-3 text-left transition-colors hover:border-[#0058be] hover:bg-[#f6f9ff]">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-bold text-[#0b1c30]">{bloco.titulo || `Pacote ${bi + 1}`}</span>
                              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-[.02em] text-[#8a90a3]"><span className="h-1.5 w-1.5 rounded-full bg-[#8a90a3]" />Não iniciado</span>
                            </span>
                            {bloco.descricao && <span className="mt-1 block text-[11.5px] leading-[1.35] text-[#424754]">{bloco.descricao}</span>}
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#e0e2ef]"><span className="block h-full w-0 rounded-full bg-[#0058be]" /></span>
                            <span className="mt-1 block text-[11px] font-bold text-[#727785]">0 de {bloco.etapas.length} etapas concluídas</span>
                          </span>
                          <span className="text-[11px] font-extrabold text-[#0058be]">Iniciar</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function JornadaProdutoPreview({
  form,
  blocos,
  selecionado,
  aberto,
  blocoAbertoIndex,
  onToggleAberto,
  onFechar,
  onVoltarPacotes,
  onEditarJornada,
  onSetTitulo,
  onAddBloco,
  onSelectBloco,
  onEditarBloco,
  onAddEtapa,
  onSelectEtapa,
  onMoveBloco,
  onRemoveBloco,
  onMoveEtapa,
  onRemoveEtapa,
}: {
  form: FormState
  blocos: BlocoFormState[]
  selecionado: Selecionado
  aberto: boolean
  blocoAbertoIndex: number | null
  onToggleAberto: () => void
  onFechar: () => void
  onVoltarPacotes: () => void
  onEditarJornada: () => void
  onSetTitulo: (value: string) => void
  onAddBloco: () => void
  onSelectBloco: (blocoIndex: number) => void
  onEditarBloco: (blocoIndex: number) => void
  onAddEtapa: (blocoIndex: number, tipo: TipoEtapaJornada) => void
  onSelectEtapa: (blocoIndex: number, etapaIndex: number) => void
  onMoveBloco: (index: number, dir: -1 | 1) => void
  onRemoveBloco: (index: number) => void
  onMoveEtapa: (blocoIndex: number, etapaIndex: number, dir: -1 | 1) => void
  onRemoveEtapa: (blocoIndex: number, etapaIndex: number) => void
}) {
  const blocoAberto = blocoAbertoIndex == null ? null : blocos[blocoAbertoIndex]
  const blocosAtivos = blocos.filter(b => b.ativo).length
  const descricao = form.descricao.trim()

  return (
    <div className="mt-3 overflow-hidden rounded-[24px] border border-outline-variant bg-[#f5f7fb]">
      <div className="relative min-h-[600px] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,100,224,.10),transparent_32%),linear-gradient(135deg,#f8faff,#eef2f8)] p-4">
        <div className="absolute left-4 top-4 z-10 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#727785] shadow-sm backdrop-blur">
          Simulação do produto
        </div>
        <div className="max-w-[620px] space-y-4 pr-0 lg:pr-[380px]">
          <div className="mt-9 rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
            <div className="mb-4 h-3 w-32 rounded-full bg-slate-200" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-24 rounded-2xl bg-white shadow-sm" />
              <div className="h-24 rounded-2xl bg-white shadow-sm" />
              <div className="h-24 rounded-2xl bg-white shadow-sm" />
            </div>
          </div>
          <div className="rounded-3xl border border-white/80 bg-white/65 p-5 shadow-sm backdrop-blur">
            <div className="mb-3 h-3 w-44 rounded-full bg-slate-200" />
            <div className="space-y-2">
              <div className="h-3 rounded-full bg-slate-200" />
              <div className="h-3 w-5/6 rounded-full bg-slate-200" />
              <div className="h-3 w-2/3 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>

        {!aberto && (
          <button type="button" onClick={onToggleAberto} className="absolute bottom-7 right-7 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-extrabold text-white shadow-[0_14px_32px_rgba(0,88,190,.28)] transition-transform hover:-translate-y-0.5">
            <span className="material-symbols-outlined text-[18px]">route</span>
            Ajuda
          </button>
        )}

        {aberto && (
          <div className="absolute inset-y-0 right-0 flex w-[360px] max-w-[92%] flex-col border-l border-[#e0e2ef] bg-white shadow-[-12px_0_32px_rgba(11,28,48,.14)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e0e2ef]/70 px-[18px] py-4">
              <h3 className="m-0 text-[16px] font-extrabold text-[#0b1c30]">Central de ajuda</h3>
              <button type="button" onClick={onFechar} aria-label="Fechar prévia" className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition-colors hover:bg-[#f1f3fa]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-4 py-[14px]">
              {blocoAberto ? (
                <PreviewEtapasPacote
                  bloco={blocoAberto}
                  blocoIndex={blocoAbertoIndex!}
                  selecionado={selecionado}
                  onVoltar={onVoltarPacotes}
                  onEditarBloco={onEditarBloco}
                  onAddEtapa={onAddEtapa}
                  onSelectEtapa={onSelectEtapa}
                  onMoveEtapa={onMoveEtapa}
                  onRemoveEtapa={onRemoveEtapa}
                />
              ) : (
                <>
                  <div className="relative shrink-0">
                    <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#8a90a3]">search</span>
                    <input readOnly value="" placeholder="Buscar etapas, pacotes ou jornadas" className="h-9 w-full rounded-[10px] border border-[#e0e2ef] bg-[#f8f9ff] pl-8 pr-3 text-[12.5px] text-[#0b1c30] outline-none" />
                  </div>

                  <div className="flex flex-col gap-[14px]">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="m-0 text-[11px] font-extrabold uppercase tracking-[.04em] text-[#8a90a3]">Jornadas</h4>
                      <button type="button" onClick={onAddBloco} className="inline-flex items-center gap-1 rounded-full border border-[#bcd6f7] bg-[#eff4ff] px-3 py-1.5 text-[11px] font-extrabold text-[#0058be] transition-colors hover:bg-[#e4efff]">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Novo pacote
                      </button>
                    </div>

                    <div className={`up-jorn-jornada rounded-xl transition-colors ${selecionado.tipo === 'jornada' ? 'ring-2 ring-primary/30' : ''}`}>
                      <div className="w-full rounded-xl text-left">
                        <input
                          value={form.titulo}
                          onFocus={onEditarJornada}
                          onChange={e => onSetTitulo(e.target.value)}
                          placeholder="Jornada de ativação"
                          className="m-0 w-full rounded-lg border border-transparent bg-transparent px-0 py-0 text-[14px] font-extrabold text-[#0b1c30] outline-none transition-colors placeholder:text-[#8a90a3] focus:border-[#bcd6f7] focus:bg-[#f8f9ff] focus:px-2 focus:py-1"
                        />
                        {descricao && <p className="mb-2 mt-1 text-[12.5px] leading-[1.4] text-[#424754]">{descricao}</p>}
                        {blocos.length > 0 && <p className="mb-2 text-[11px] font-bold text-[#727785]">0 de {blocos.length} pacotes concluídos</p>}
                      </div>

                      {blocos.length === 0 ? (
                        <div className="rounded-[14px] border border-dashed border-[#e0e2ef] bg-[#f8f9ff] p-5 text-center">
                          <p className="m-0 text-[13px] text-[#727785]">Nenhum pacote ainda.</p>
                          <button type="button" onClick={onAddBloco} className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-[#0058be] px-4 py-2.5 text-[12px] font-extrabold text-white transition-opacity hover:opacity-90">
                            <span className="material-symbols-outlined text-[15px]">add</span>
                            Criar primeiro pacote
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {blocos.map((bloco, bi) => (
                            <PreviewPacoteCard
                              key={bi}
                              bloco={bloco}
                              index={bi}
                              total={blocos.length}
                              ativo={selecionado.tipo === 'bloco' && selecionado.blocoIndex === bi}
                              onOpen={() => onSelectBloco(bi)}
                              onEditar={() => onEditarBloco(bi)}
                              onMove={dir => onMoveBloco(bi, dir)}
                              onRemove={() => onRemoveBloco(bi)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-[#e0e2ef] bg-white px-4 py-3 text-[11px] font-bold text-[#727785]">
              {blocosAtivos} pacote{blocosAtivos === 1 ? '' : 's'} ativo{blocosAtivos === 1 ? '' : 's'} nesta prévia
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewPacoteCard({ bloco, index, total, ativo, onOpen, onEditar, onMove, onRemove }: { bloco: BlocoFormState; index: number; total: number; ativo: boolean; onOpen: () => void; onEditar: () => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const etapasTotal = bloco.etapas.length
  return (
    <div className={`rounded-[12px] border bg-white transition-colors ${ativo ? 'border-[#0058be] bg-[#f6f9ff] ring-2 ring-primary/15' : 'border-[#e0e2ef]'}`}>
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-bold text-[#0b1c30]">{bloco.titulo || `Pacote ${index + 1}`}</span>
            <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-[.02em] ${bloco.ativo ? 'text-[#8a90a3]' : 'text-[#e65100]'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${bloco.ativo ? 'bg-[#8a90a3]' : 'bg-[#e65100]'}`} />
              {bloco.ativo ? 'Não iniciado' : 'Inativo'}
            </span>
          </span>
          {bloco.descricao && <span className="mt-1 block text-[11.5px] leading-[1.35] text-[#424754]">{bloco.descricao}</span>}
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#e0e2ef]"><span className="block h-full w-0 rounded-full bg-[#0058be]" /></span>
          <span className="mt-1 block text-[11px] font-bold text-[#727785]">0 de {etapasTotal} etapas concluídas</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-extrabold text-[#0058be]">
          Abrir
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-[#e0e2ef]/70 bg-[#fbfcff] px-3 py-2">
        <button type="button" onClick={onEditar} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-extrabold text-[#0058be] transition-colors hover:bg-[#eff4ff]">
          <span className="material-symbols-outlined text-[14px]">edit</span>
          Editar
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Mover para cima" aria-label="Mover pacote para cima" className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition-colors hover:bg-[#eef1f8] disabled:opacity-30"><span className="material-symbols-outlined text-[16px]">arrow_upward</span></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} title="Mover para baixo" aria-label="Mover pacote para baixo" className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition-colors hover:bg-[#eef1f8] disabled:opacity-30"><span className="material-symbols-outlined text-[16px]">arrow_downward</span></button>
          <button type="button" onClick={onRemove} title="Remover pacote" aria-label="Remover pacote" className="flex h-8 w-8 items-center justify-center rounded-full text-error transition-colors hover:bg-error-container"><span className="material-symbols-outlined text-[16px]">delete</span></button>
        </div>
      </div>
    </div>
  )
}

function PreviewEtapasPacote({ bloco, blocoIndex, selecionado, onVoltar, onEditarBloco, onAddEtapa, onSelectEtapa, onMoveEtapa, onRemoveEtapa }: { bloco: BlocoFormState; blocoIndex: number; selecionado: Selecionado; onVoltar: () => void; onEditarBloco: (blocoIndex: number) => void; onAddEtapa: (blocoIndex: number, tipo: TipoEtapaJornada) => void; onSelectEtapa: (blocoIndex: number, etapaIndex: number) => void; onMoveEtapa: (blocoIndex: number, etapaIndex: number, dir: -1 | 1) => void; onRemoveEtapa: (blocoIndex: number, etapaIndex: number) => void }) {
  return (
    <div>
      <button type="button" onClick={onVoltar} className="mb-2 flex items-center gap-1 text-[12px] font-bold text-[#0058be] hover:underline">
        <span className="material-symbols-outlined text-[15px]">arrow_back</span>
        Voltar para pacotes
      </button>
      <button type="button" onClick={() => onEditarBloco(blocoIndex)} className={`mb-3 w-full rounded-xl text-left ${selecionado.tipo === 'bloco' && selecionado.blocoIndex === blocoIndex ? 'ring-2 ring-primary/30' : ''}`}>
        <h4 className="m-0 text-[14px] font-extrabold text-[#0b1c30]">{bloco.titulo || `Pacote ${blocoIndex + 1}`}</h4>
        {bloco.descricao && <p className="mb-0 mt-1 text-[12.5px] leading-[1.4] text-[#424754]">{bloco.descricao}</p>}
      </button>

      <div className="mb-3 grid grid-cols-1 gap-2">
        {TIPOS_ETAPA.map(tipo => (
          <button key={tipo.value} type="button" onClick={() => onAddEtapa(blocoIndex, tipo.value)} className="flex items-center justify-between rounded-[10px] border border-[#dce7fb] bg-[#f6f9ff] px-3 py-2 text-left text-[11.5px] font-extrabold text-[#0058be] transition-colors hover:border-[#bcd6f7] hover:bg-[#eff4ff]">
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px]">{tipo.icon}</span>
              {tipo.label}
            </span>
            <span className="material-symbols-outlined text-[15px]">add</span>
          </button>
        ))}
      </div>

      {bloco.etapas.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[#e0e2ef] bg-[#f8f9ff] p-5 text-center">
          <p className="m-0 text-[13px] text-[#727785]">Nenhuma etapa neste pacote.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bloco.etapas.map((etapa, ei) => {
            const tipo = tipoEtapaConfig(etapa.tipo)
            const ativa = selecionado.tipo === 'etapa' && selecionado.blocoIndex === blocoIndex && selecionado.etapaIndex === ei
            return (
              <div key={ei} className={`rounded-[12px] border bg-white transition-colors ${ativa ? 'border-[#0058be] bg-[#f6f9ff] ring-2 ring-primary/15' : 'border-[#e0e2ef]'}`}>
                <button type="button" onClick={() => onSelectEtapa(blocoIndex, ei)} className="flex w-full items-start gap-2.5 p-3 text-left">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#eff4ff] text-[11px] font-extrabold text-[#0058be]">{ei + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-[#0b1c30]">{etapa.titulo || `Etapa ${ei + 1}`}</span>
                    {etapa.descricao && <span className="mt-0.5 block text-[11.5px] leading-[1.35] text-[#424754]">{etapa.descricao}</span>}
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[.02em] text-[#8a90a3]">{tipo.label}{etapa.obrigatoria ? '' : ' · opcional'}</span>
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 border-t border-[#e0e2ef]/70 bg-[#fbfcff] px-3 py-2">
                  <button type="button" onClick={() => onSelectEtapa(blocoIndex, ei)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-extrabold text-[#0058be] transition-colors hover:bg-[#eff4ff]">
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Editar
                  </button>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onMoveEtapa(blocoIndex, ei, -1)} disabled={ei === 0} title="Mover para cima" aria-label="Mover etapa para cima" className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition-colors hover:bg-[#eef1f8] disabled:opacity-30"><span className="material-symbols-outlined text-[16px]">arrow_upward</span></button>
                    <button type="button" onClick={() => onMoveEtapa(blocoIndex, ei, 1)} disabled={ei === bloco.etapas.length - 1} title="Mover para baixo" aria-label="Mover etapa para baixo" className="flex h-8 w-8 items-center justify-center rounded-full text-[#727785] transition-colors hover:bg-[#eef1f8] disabled:opacity-30"><span className="material-symbols-outlined text-[16px]">arrow_downward</span></button>
                    <button type="button" onClick={() => onRemoveEtapa(blocoIndex, ei)} title="Remover etapa" aria-label="Remover etapa" className="flex h-8 w-8 items-center justify-center rounded-full text-error transition-colors hover:bg-error-container"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PainelJornada({ form, slug, isEdit, segmentos, onSet, onOpenSegmentacao }: { form: FormState; slug: string; isEdit: boolean; segmentos: number; onSet: (key: keyof FormState, value: string | boolean | string[]) => void; onOpenSegmentacao: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Título <span className="text-error">*</span></label>
        <input required value={form.titulo} onChange={e => onSet('titulo', e.target.value)} placeholder="Ex: Primeiros passos na agenda" className={field} />
        {isEdit && slug && <p className="mt-1 text-label-sm text-outline">O slug não muda ao editar o título.</p>}
      </div>
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Descrição</label>
        <textarea rows={4} value={form.descricao} onChange={e => onSet('descricao', e.target.value)} placeholder="Texto de apresentação exibido na central de onboarding." className={textarea} />
      </div>
      <SwitchRow checked={form.ativo} onChange={v => onSet('ativo', v)} title={form.ativo ? 'Jornada ativa' : 'Jornada inativa'} desc="Jornadas inativas não aparecem para os usuários." />
      <SwitchRow checked={form.permitir_refazer} onChange={v => onSet('permitir_refazer', v)} title="Permitir refazer etapas" desc="Etapas concluídas continuam acessíveis para o usuário final." />
      <SwitchRow checked={form.permitir_pacotes_fora_ordem} onChange={v => onSet('permitir_pacotes_fora_ordem', v)} title="Liberar pacotes fora de ordem" desc="Se desligado, o usuário precisa concluir o pacote anterior." />
      <button type="button" onClick={onOpenSegmentacao} className="flex w-full items-center justify-between rounded-2xl border border-outline-variant bg-surface-container-low/60 p-3 text-left transition-colors hover:border-primary">
        <span>
          <span className="block text-body-md font-bold text-on-surface">Público e segmentação</span>
          <span className="block text-label-md text-on-surface-variant">{segmentos === 0 ? 'Exibir para todos' : `${segmentos} regra${segmentos === 1 ? '' : 's'} definida${segmentos === 1 ? '' : 's'}`}</span>
        </span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
      </button>
    </div>
  )
}

function PainelSegmentacao({ form, onSet, catalogoDominios }: { form: FormState; onSet: (key: keyof FormState, value: string | boolean | string[]) => void; catalogoDominios: string[] }) {
  return (
    <div className="space-y-4">
      <p className="text-body-md text-on-surface-variant">Opcional. Deixe tudo vazio para exibir a jornada para todos os usuários.</p>
      {SEGMENTOS.map(({ key, label, hint }) => (
        <div key={key}>
          <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">{label}</label>
          <ChipInput values={form[key]} onChange={v => onSet(key, v)} placeholder={`${hint} — Enter ou vírgula`} />
        </div>
      ))}
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Domínios permitidos</label>
        <CampoDominiosJornada
          catalogo={catalogoDominios}
          value={form.segmentar_dominios}
          onChange={v => onSet('segmentar_dominios', v)}
        />
      </div>
    </div>
  )
}

// Jornada não tem sistema/tela (ver comentário de FormState.segmentar_dominios
// acima) — o catálogo é a união de Sistema.dominios de todos os sistemas do
// tenant, não de um único sistema como em CampanhaForm/tours Form.tsx. Mesmo
// tratamento de preservar valores fora do catálogo atual (drift histórico).
function CampoDominiosJornada({ catalogo, value, onChange }: {
  catalogo: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const foraDoCatalogo = value.filter(v => !catalogo.includes(v))
  const opcoes = [...catalogo, ...foraDoCatalogo]

  function alternar(dominio: string) {
    onChange(value.includes(dominio) ? value.filter(v => v !== dominio) : [...value, dominio])
  }

  if (opcoes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low/60 p-3 text-body-sm text-on-surface-variant">
        Nenhum domínio cadastrado ainda em nenhum sistema (Configurações → Sistemas). Cadastre lá pra poder restringir esta jornada a um ou mais domínios.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(dominio => (
        <label
          key={dominio}
          className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-label-sm font-semibold ${value.includes(dominio) ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-white text-on-surface'}`}
        >
          <input type="checkbox" checked={value.includes(dominio)} onChange={() => alternar(dominio)} className="h-3 w-3 accent-primary" />
          {dominio}
          {!catalogo.includes(dominio) && <span className="text-[10px] font-normal text-on-surface-variant">(fora do catálogo)</span>}
        </label>
      ))}
    </div>
  )
}

function PainelBloco({ bloco, index, onPatch, onAddEtapa }: { bloco: BlocoFormState; index: number; onPatch: (patch: Partial<BlocoFormState>) => void; onAddEtapa: (tipo: TipoEtapaJornada) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Título do pacote <span className="text-error">*</span></label>
        <input required value={bloco.titulo} onChange={e => onPatch({ titulo: e.target.value })} placeholder={`Pacote ${index + 1}`} className={field} />
      </div>
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Descrição</label>
        <textarea rows={3} value={bloco.descricao} onChange={e => onPatch({ descricao: e.target.value })} placeholder="Explique o objetivo deste pacote." className={textarea} />
      </div>
      <SwitchRow checked={bloco.ativo} onChange={v => onPatch({ ativo: v })} title={bloco.ativo ? 'Pacote ativo' : 'Pacote inativo'} desc="Pacotes inativos não aparecem na jornada." />
      <SwitchRow checked={bloco.obrigatorio} onChange={v => onPatch({ obrigatorio: v })} title="Pacote obrigatório" desc="O usuário precisa concluir este pacote para avançar." />
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low/60 p-3">
        <p className="mb-2 text-label-md font-bold text-on-surface">Adicionar etapa rápida</p>
        <div className="grid grid-cols-1 gap-2">
          {TIPOS_ETAPA.map(tipo => (
            <button key={tipo.value} type="button" onClick={() => onAddEtapa(tipo.value)} className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-left transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-[18px]">{tipo.icon}</span>
              <span><span className="block text-label-md font-bold">{tipo.label}</span><span className="block text-label-sm text-on-surface-variant">{tipo.desc}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PainelEtapa({ etapa, blocoIndex, etapaIndex, tours, campanhas, onPatch }: { etapa: EtapaFormState; blocoIndex: number; etapaIndex: number; tours: TourGuiado[]; campanhas: Campanha[]; onPatch: (patch: Partial<EtapaFormState>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-label-md font-bold text-primary">Pacote {blocoIndex + 1} · Etapa {etapaIndex + 1}</p>
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Título da etapa <span className="text-error">*</span></label>
        <input required value={etapa.titulo} onChange={e => onPatch({ titulo: e.target.value })} placeholder="Ex: Conheça a agenda" className={field} />
      </div>
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Descrição</label>
        <textarea rows={3} value={etapa.descricao} onChange={e => onPatch({ descricao: e.target.value })} placeholder="Texto exibido para esta etapa." className={textarea} />
      </div>
      <div>
        <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Tipo <span className="text-error">*</span></label>
        <Select size="sm" value={etapa.tipo} onChange={v => onPatch({ tipo: v as TipoEtapaJornada })} options={TIPOS_ETAPA.map(t => ({ value: t.value, label: t.label }))} />
      </div>
      {etapa.tipo === 'tour' && (
        <div>
          <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Tour guiado <span className="text-error">*</span></label>
          <Select size="sm" value={etapa.tour_id} onChange={v => onPatch({ tour_id: v })} placeholder="Selecione um tour existente" options={tours.map(t => ({ value: t.id, label: t.titulo }))} />
          {tours.length === 0 && <p className="mt-1 text-label-sm text-outline">Nenhum tour guiado cadastrado ainda.</p>}
        </div>
      )}
      {etapa.tipo === 'campanha' && (
        <div>
          <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Campanha <span className="text-error">*</span></label>
          <Select size="sm" value={etapa.campanha_id} onChange={v => onPatch({ campanha_id: v })} placeholder="Selecione uma campanha existente" options={campanhas.map(c => ({ value: c.id, label: `${c.nome_interno} — ${c.titulo}${c.status === 'RASCUNHO' ? ' (rascunho)' : c.status === 'INATIVA' ? ' (inativa)' : ''}` }))} />
          {campanhas.length === 0 && <p className="mt-1 text-label-sm text-outline">Nenhuma campanha cadastrada ainda.</p>}
        </div>
      )}
      {etapa.tipo === 'link' && (
        <>
          <div>
            <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">URL <span className="text-error">*</span></label>
            <input type="url" required value={etapa.url} onChange={e => onPatch({ url: e.target.value })} placeholder="https://..." className={field} />
          </div>
          <div>
            <label className="mb-1.5 block text-label-md font-bold text-on-surface-variant">Texto do botão</label>
            <input value={etapa.texto_cta} onChange={e => onPatch({ texto_cta: e.target.value })} placeholder="Abrir" className={field} />
          </div>
          <SwitchRow checked={etapa.abrir_nova_aba} onChange={v => onPatch({ abrir_nova_aba: v })} title="Abrir em nova aba" desc="Mantém o produto aberto na aba atual." />
        </>
      )}
      <SwitchRow checked={etapa.obrigatoria} onChange={v => onPatch({ obrigatoria: v })} title="Etapa obrigatória" desc="Conta como requisito de conclusão do pacote." />
    </div>
  )
}

function SwitchRow({ checked, onChange, title, desc }: { checked: boolean; onChange: (value: boolean) => void; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-low/50 p-3">
      <ToggleSwitch checked={checked} onChange={onChange} />
      <div>
        <p className="text-body-md font-bold text-on-surface">{title}</p>
        <p className="mt-0.5 text-label-md text-on-surface-variant">{desc}</p>
      </div>
    </div>
  )
}

function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')

  const commit = () => {
    const toAdd = input.split(',').map(s => s.trim()).filter(s => s && !values.includes(s))
    if (toAdd.length) onChange([...values, ...toAdd])
    setInput('')
  }

  return (
    <div
      className="flex min-h-[42px] cursor-text flex-wrap gap-1.5 rounded-xl border border-outline-variant bg-surface-bright px-2.5 py-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      {values.map(v => (
        <span key={v} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
          {v}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(values.filter(x => x !== v)) }} className="ml-0.5 leading-none hover:text-error">
            <span className="material-symbols-outlined text-[12px]">close</span>
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent text-body-md text-on-surface outline-none placeholder:text-outline"
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
