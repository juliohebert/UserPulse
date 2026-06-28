import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { Campanha, TelaCatalogo } from '../../types'
import { gerarSlug, toInputDate } from '../../utils/campanha'
import { NpsScale } from '../../components/widget/NpsScale'
import { LoadingSpinner } from '../../components/ui/EmptyState'
import { TEMPLATES } from '../../utils/templates'

const TIPOS = ['comunicado', 'melhoria', 'pesquisa']
const CATEGORIAS = ['Novidade', 'Melhoria', 'Treinamento', 'Pesquisa', 'Comunicado', 'Obrigatório']

interface FormState {
  titulo: string
  subtitulo: string
  descricao: string
  tipo: string
  sistema: string
  tela: string
  imagem_url: string
  video_url: string
  texto_botao: string
  url_botao: string
  feedback_habilitado: boolean
  modo_exibicao: string
  gatilho: string
  evento: string
  modo_identificacao: string
  data_cy: string
  url_contem: string
  atraso_ms: string
  mostrar_uma_vez: boolean
  prioridade: string
  ordem: string
  ativo: boolean
  data_inicio: string
  data_fim: string
  pergunta_feedback: string
  observacao_obrigatoria: boolean
  exige_confirmacao_leitura: boolean
  permitir_fechar_modal: boolean
  intervalo_reexibicao_dias: string
  politica_reexibicao: string
  reexibir_apos_dias: string
  encerrar_apos_evento: boolean
  evento_conclusao: string
  categoria: string
  segmentar_cliente_ids: string[]
  segmentar_unidade_ids: string[]
  segmentar_perfis: string[]
  segmentar_usuario_tipos: string[]
  segmentar_estados: string[]
}

const EMPTY: FormState = {
  titulo: '', subtitulo: '', descricao: '', tipo: 'pesquisa', sistema: '', tela: '',
  imagem_url: '', video_url: '', texto_botao: '', url_botao: '', feedback_habilitado: true,
  modo_exibicao: 'modal_automatica', gatilho: 'ao_abrir_tela', evento: '',
  modo_identificacao: 'sistema_tela', data_cy: '', url_contem: '', atraso_ms: '800',
  mostrar_uma_vez: false, prioridade: '0', ordem: '0',
  ativo: true, data_inicio: '', data_fim: '', pergunta_feedback: '', observacao_obrigatoria: false,
  exige_confirmacao_leitura: false, permitir_fechar_modal: true, intervalo_reexibicao_dias: '',
  politica_reexibicao: 'uma_vez_apos_visualizacao', reexibir_apos_dias: '',
  encerrar_apos_evento: false, evento_conclusao: '', categoria: '',
  segmentar_cliente_ids: [], segmentar_unidade_ids: [], segmentar_perfis: [],
  segmentar_usuario_tipos: [], segmentar_estados: [],
}

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

function normalizeUrlContem(value: string): string {
  const v = value.trim()
  if (!v) return v
  try {
    return new URL(v).pathname
  } catch {
    return v
  }
}

function buildResumo(f: FormState): string {
  const tela = f.tela ? `"${f.tela}"` : 'tela configurada'
  const dataCy = f.data_cy ? `"${f.data_cy}"` : 'data-cy configurado'
  const url = f.url_contem ? `"${f.url_contem}"` : 'caminho configurado'
  const evento = f.evento ? `"${f.evento}"` : 'evento configurado'

  let base: string
  if (f.modo_identificacao === 'sistema_tela') {
    base = f.gatilho === 'ao_abrir_tela'
      ? `A campanha será exibida assim que o usuário acessar a tela ${tela}.`
      : `A campanha será exibida quando o usuário estiver na tela ${tela} e o sistema disparar o evento ${evento}.`
  } else if (f.modo_identificacao === 'data_cy') {
    base = f.gatilho === 'ao_abrir_tela'
      ? `A campanha será exibida quando a página tiver o elemento data-cy ${dataCy}.`
      : `A campanha será exibida quando a página tiver o elemento data-cy ${dataCy} e o sistema disparar o evento ${evento}.`
  } else {
    base = f.gatilho === 'ao_abrir_tela'
      ? `A campanha será exibida quando o caminho da URL corresponder a ${url} ou às suas subrotas.`
      : `A campanha será exibida quando o caminho da URL corresponder a ${url} e o sistema disparar o evento ${evento}.`
  }

  const recorrencia = f.politica_reexibicao === 'ate_responder_ou_confirmar'
    ? 'A campanha reaparece até o usuário responder ou confirmar leitura.'
    : f.politica_reexibicao === 'reexibir_apos_dias' && f.reexibir_apos_dias
    ? `A campanha pode reaparecer após ${f.reexibir_apos_dias} dias da última interação.`
    : 'Cada usuário verá esta campanha apenas uma vez.'

  const fechamento = !f.permitir_fechar_modal
    ? ' Esta campanha só poderá ser fechada após resposta ou confirmação de leitura.'
    : ''

  return `${base} ${recorrencia}${fechamento}`
}

export function CampanhaForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [slug, setSlug] = useState('')
  const [sistemas, setSistemas] = useState<string[]>([])
  const [telas, setTelas] = useState<string[]>([])
  const [todasCampanhas, setTodasCampanhas] = useState<Campanha[]>([])
  const [loadingCampanha, setLoadingCampanha] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null)
  const [catalogoTelas, setCatalogoTelas] = useState<TelaCatalogo[]>([])
  const [previewNota, setPreviewNota] = useState<number | null>(null)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    get<Campanha[]>('/campanhas').then(cs => {
      setTodasCampanhas(cs)
      setSistemas([...new Set(cs.map(c => c.sistema).filter(Boolean))])
      setTelas([...new Set(cs.map(c => c.tela).filter(Boolean))])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    get<TelaCatalogo[]>('/catalogo-telas?ativo=true').then(setCatalogoTelas).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    get<Campanha>(`/campanhas/${id}`)
      .then(c => {
        setForm({
          titulo: c.titulo,
          subtitulo: c.subtitulo ?? '',
          descricao: c.descricao,
          tipo: c.tipo,
          sistema: c.sistema,
          tela: c.tela,
          imagem_url: c.imagem_url ?? '',
          video_url: c.video_url ?? '',
          texto_botao: c.texto_botao ?? '',
          url_botao: c.url_botao ?? '',
          feedback_habilitado: c.feedback_habilitado,
          modo_exibicao: c.modo_exibicao ?? 'modal_automatica',
          gatilho: c.gatilho ?? 'ao_abrir_tela',
          evento: c.evento ?? '',
          modo_identificacao: c.modo_identificacao ?? 'sistema_tela',
          data_cy: c.data_cy ?? '',
          url_contem: c.url_contem ?? '',
          atraso_ms: String(c.atraso_ms ?? 800),
          mostrar_uma_vez: c.mostrar_uma_vez ?? false,
          prioridade: String(c.prioridade ?? 0),
          ordem: String(c.ordem ?? 0),
          ativo: c.ativo,
          data_inicio: toInputDate(c.data_inicio),
          data_fim: toInputDate(c.data_fim),
          pergunta_feedback: c.pergunta_feedback ?? '',
          observacao_obrigatoria: c.observacao_obrigatoria,
          exige_confirmacao_leitura: c.exige_confirmacao_leitura,
          permitir_fechar_modal: c.permitir_fechar_modal ?? true,
          intervalo_reexibicao_dias: c.intervalo_reexibicao_dias != null ? String(c.intervalo_reexibicao_dias) : '',
          politica_reexibicao: c.politica_reexibicao ?? 'uma_vez_apos_visualizacao',
          reexibir_apos_dias: c.reexibir_apos_dias != null ? String(c.reexibir_apos_dias) : '',
          encerrar_apos_evento: c.encerrar_apos_evento ?? false,
          evento_conclusao: c.evento_conclusao ?? '',
          categoria: c.categoria ?? '',
          segmentar_cliente_ids: c.segmentar_cliente_ids ?? [],
          segmentar_unidade_ids: c.segmentar_unidade_ids ?? [],
          segmentar_perfis: c.segmentar_perfis ?? [],
          segmentar_usuario_tipos: c.segmentar_usuario_tipos ?? [],
          segmentar_estados: c.segmentar_estados ?? [],
        })
        setSlug(c.slug)
      })
      .catch(() => setError('Campanha não encontrada.'))
      .finally(() => setLoadingCampanha(false))
  }, [id])

  const set = (key: keyof FormState, value: string | boolean | string[]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleTitulo = (v: string) => {
    set('titulo', v)
    if (!isEdit) setSlug(gerarSlug(v))
  }

  const applyTemplate = (templateId: string) => {
    const tpl = TEMPLATES.find(t => t.id === templateId)
    if (!tpl) return
    setForm(prev => ({
      ...prev,
      tipo: tpl.fields.tipo,
      titulo: tpl.fields.titulo,
      subtitulo: tpl.fields.subtitulo,
      descricao: tpl.fields.descricao,
      texto_botao: tpl.fields.texto_botao,
      url_botao: tpl.fields.url_botao,
      pergunta_feedback: tpl.fields.pergunta_feedback,
      feedback_habilitado: tpl.fields.feedback_habilitado,
      categoria: tpl.fields.categoria,
    }))
    if (!isEdit) setSlug(gerarSlug(tpl.fields.titulo))
    setAppliedTemplate(templateId)
  }

  const applyScreen = (screenId: string) => {
    const screen = catalogoTelas.find(s => s.id === screenId)
    if (!screen) return
    setForm(prev => ({
      ...prev,
      sistema: screen.sistema,
      modo_identificacao: screen.modo_identificacao,
      url_contem: screen.url_contem ?? '',
      tela: screen.tela ?? '',
      data_cy: screen.data_cy ?? '',
    }))
    setSelectedScreen(screenId)
  }

  const copySlug = () => {
    navigator.clipboard.writeText(slug).catch(() => {})
    setCopied(true)
    if (copyTimeout.current) clearTimeout(copyTimeout.current)
    copyTimeout.current = setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.permitir_fechar_modal && !form.feedback_habilitado && !form.exige_confirmacao_leitura) {
      setError('Para impedir o fechamento da modal, habilite feedback ou confirmação de leitura.')
      return
    }
    if (!form.permitir_fechar_modal && form.politica_reexibicao === 'uma_vez_apos_visualizacao') {
      setError('Campanhas obrigatórias não podem usar a política "Uma vez após visualização".')
      return
    }
    if (form.politica_reexibicao === 'reexibir_apos_dias' && (!form.reexibir_apos_dias || Number(form.reexibir_apos_dias) <= 0)) {
      setError('Informe quantos dias antes de reexibir.')
      return
    }
    if (form.encerrar_apos_evento && !form.evento_conclusao.trim()) {
      setError('Informe o nome do evento de conclusão.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        ...form,
        subtitulo: form.subtitulo || null,
        imagem_url: form.imagem_url || null,
        video_url: form.video_url || null,
        texto_botao: form.texto_botao || null,
        url_botao: form.url_botao || null,
        evento: form.evento || null,
        tela: form.modo_identificacao === 'sistema_tela' ? form.tela : '',
        data_cy: form.data_cy || null,
        url_contem: normalizeUrlContem(form.url_contem) || null,
        atraso_ms: Number(form.atraso_ms || 800),
        prioridade: Number(form.prioridade || 0),
        ordem: Number(form.ordem || 0),
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        pergunta_feedback: form.pergunta_feedback || null,
        intervalo_reexibicao_dias: form.intervalo_reexibicao_dias !== '' ? Number(form.intervalo_reexibicao_dias) : null,
        reexibir_apos_dias: form.reexibir_apos_dias !== '' ? Number(form.reexibir_apos_dias) : null,
        encerrar_apos_evento: form.encerrar_apos_evento,
        evento_conclusao: form.evento_conclusao.trim() || null,
        categoria: form.categoria || null,
      }
      const saved = isEdit
        ? await put<Campanha>(`/campanhas/${id}`, payload)
        : await post<Campanha>('/campanhas', payload)
      navigate(`/campanhas/${saved.id}/preview`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar campanha.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingCampanha) return <div className="px-4 lg:px-margin-desktop py-stack-md"><LoadingSpinner /></div>

  const urlNorm = normalizeUrlContem(form.url_contem)
  const campanhaConflitante =
    form.modo_identificacao === 'url_contem' && urlNorm && form.ativo
      ? todasCampanhas.find(c =>
          c.ativo &&
          c.modo_identificacao === 'url_contem' &&
          c.sistema === form.sistema &&
          normalizeUrlContem(c.url_contem ?? '') === urlNorm &&
          c.id !== id
        ) ?? null
      : null

  const previewQuestion = form.pergunta_feedback.trim() || form.titulo.trim() || 'Como podemos melhorar?'
  const isSegmented = (
    form.segmentar_cliente_ids.length > 0 ||
    form.segmentar_unidade_ids.length > 0 ||
    form.segmentar_perfis.length > 0 ||
    form.segmentar_usuario_tipos.length > 0 ||
    form.segmentar_estados.length > 0
  )

  return (
    <div className="relative">
      {/* ── Page action bar ── */}
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <nav className="flex gap-2 text-label-md text-outline mb-0.5">
              <button onClick={() => navigate('/campanhas')} className="hover:text-primary transition-colors">
                Campanhas
              </button>
              <span>/</span>
              <span className="text-on-surface">{isEdit ? 'Editar' : 'Criar Nova'}</span>
            </nav>
            <h2 className="text-title-lg font-bold text-on-surface leading-tight">
              {isEdit ? 'Editar Campanha' : 'Nova Campanha'}
            </h2>
          </div>
          <div className="flex gap-2 shrink-0">
            {id && (
              <button
                type="button"
                onClick={() => navigate(`/campanhas/${id}/preview`)}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2 border border-primary text-primary rounded-xl text-label-md font-bold hover:bg-primary-fixed transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
                Preview
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/campanhas')}
              className="px-4 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-all"
            >
              Cancelar
            </button>
            <button
              form="campaign-form"
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <section className="px-4 lg:px-margin-desktop py-5">
        {error && (
          <div className="mb-5 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">
            {error}
          </div>
        )}

        <form id="campaign-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-4 lg:gap-6 items-start">

            {/* ── Left column (7/12) ── */}
            <div className="col-span-12 lg:col-span-7 space-y-4">

              {/* Template da Campanha */}
              {!isEdit && (
                <div className={card}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="p-1.5 bg-tertiary-fixed rounded-lg text-tertiary material-symbols-outlined text-[20px]">auto_awesome</span>
                    <div>
                      <h3 className="text-title-lg font-bold text-on-surface leading-tight">Template da Campanha</h3>
                      <p className="text-label-md text-on-surface-variant">Escolha um ponto de partida e edite à vontade</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {TEMPLATES.map(tpl => {
                      const active = appliedTemplate === tpl.id
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => applyTemplate(tpl.id)}
                          className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all hover:border-primary hover:bg-primary-fixed/40 ${
                            active
                              ? 'border-primary bg-primary-fixed shadow-sm'
                              : 'border-outline-variant bg-surface-container-low'
                          }`}
                        >
                          {active && (
                            <span className="absolute top-1.5 right-1.5 material-symbols-outlined text-primary text-[14px]">check_circle</span>
                          )}
                          <span className={`material-symbols-outlined text-[28px] ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
                            {tpl.icon}
                          </span>
                          <span className={`text-label-md font-bold leading-tight ${active ? 'text-primary' : 'text-on-surface'}`}>
                            {tpl.label}
                          </span>
                          <span className="text-[11px] text-on-surface-variant leading-tight">
                            {tpl.descricaoBreve}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {appliedTemplate && (
                    <p className="mt-3 text-[11px] text-outline flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">info</span>
                      Template aplicado — todos os campos podem ser editados livremente.
                    </p>
                  )}
                </div>
              )}

              {/* Parâmetros Gerais */}
              <div className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="p-1.5 bg-primary-fixed rounded-lg text-primary material-symbols-outlined text-[20px]">tune</span>
                  <h3 className="text-title-lg font-bold text-on-surface">Parâmetros Gerais</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">
                      Título da Campanha <span className="text-error">*</span>
                    </label>
                    <input
                      required
                      value={form.titulo}
                      onChange={e => handleTitulo(e.target.value)}
                      placeholder="Ex: Pesquisa de Satisfação Q4"
                      className={field}
                    />
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">
                      Tipo <span className="text-error">*</span>
                    </label>
                    <FormSelect
                      value={form.tipo}
                      options={TIPOS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                      onChange={v => set('tipo', v)}
                    />
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Categoria</label>
                    <FormSelect
                      value={form.categoria}
                      options={[
                        { value: '', label: 'Sem categoria' },
                        ...CATEGORIAS.map(c => ({ value: c, label: c })),
                      ]}
                      onChange={v => set('categoria', v)}
                    />
                  </div>

                  {/* Catálogo de telas */}
                  {catalogoTelas.length > 0 && (
                    <div className="md:col-span-2 rounded-xl border border-outline-variant/60 bg-surface-container-low/40 p-3">
                      {/* Header */}
                      <div className="flex items-start gap-2 mb-3">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant mt-0.5 shrink-0">grid_view</span>
                        <div>
                          <p className="text-label-md font-semibold text-on-surface leading-tight">Catálogo de telas</p>
                          <p className="text-[11px] text-outline mt-0.5 leading-snug">
                            Selecione uma tela para preencher sistema, modo e URL automaticamente.
                          </p>
                        </div>
                      </div>

                      {/* Grupos por categoria */}
                      <div className="space-y-2.5">
                        {[...new Set(catalogoTelas.map(s => s.categoria))].sort().map(cat => (
                          <div key={cat}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-outline mb-1.5">{cat}</p>
                            <div className="flex flex-wrap gap-2">
                              {catalogoTelas.filter(s => s.categoria === cat).map(screen => {
                                const active = selectedScreen === screen.id
                                return (
                                  <button
                                    key={screen.id}
                                    type="button"
                                    onClick={() => active ? setSelectedScreen(null) : applyScreen(screen.id)}
                                    className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-all w-full sm:w-auto sm:min-w-[160px] sm:max-w-[240px] hover:border-primary hover:bg-primary-fixed/30 ${
                                      active
                                        ? 'border-primary bg-primary-fixed/60 shadow-sm'
                                        : 'border-outline-variant bg-surface'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-label-sm font-semibold leading-tight truncate ${active ? 'text-primary' : 'text-on-surface'}`}>
                                        {screen.nome}
                                      </span>
                                      {active && (
                                        <span className="inline-flex items-center gap-0.5 bg-primary text-on-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">
                                          <span className="material-symbols-outlined text-[9px]">check</span>
                                          Selecionado
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-on-surface-variant leading-tight">{screen.categoria}</span>
                                    {(screen.url_contem || screen.tela || screen.data_cy) && (
                                      <span className="text-[10px] text-outline font-mono leading-tight truncate">
                                        {screen.url_contem ?? screen.tela ?? screen.data_cy}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">
                      Sistema <span className="text-error">*</span>
                    </label>
                    <input
                      required
                      list="sistemas-list"
                      value={form.sistema}
                      onChange={e => { set('sistema', e.target.value); setSelectedScreen(null) }}
                      placeholder="Ex: portal, crm, mobile"
                      className={field}
                    />
                    <datalist id="sistemas-list">
                      {sistemas.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-2">
                      Onde essa campanha deve aparecer? <span className="text-error">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { value: 'sistema_tela', label: 'Tela informada pelo sistema', desc: 'Use quando o sistema hospedeiro envia o nome da tela.' },
                        { value: 'data_cy', label: 'Elemento da tela', desc: 'Use quando a tela possui um data-cy estável.' },
                        { value: 'url_contem', label: 'Caminho da URL', desc: 'Use quando a página possui uma rota ou caminho conhecido.' },
                      ].map(opt => {
                        const active = form.modo_identificacao === opt.value
                        return (
                          <label key={opt.value} className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? 'border-primary bg-primary-fixed' : 'border-outline-variant bg-surface-container-low hover:border-primary/50'}`}>
                            <input
                              type="radio"
                              name="modo_identificacao"
                              value={opt.value}
                              checked={active}
                              onChange={e => { set('modo_identificacao', e.target.value); setSelectedScreen(null) }}
                              className="mt-0.5 text-primary focus:ring-primary shrink-0"
                            />
                            <div>
                              <p className={`text-body-md font-semibold ${active ? 'text-primary' : 'text-on-surface'}`}>{opt.label}</p>
                              <p className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {form.modo_identificacao === 'sistema_tela' && (
                    <div className="md:col-span-2">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Nome da tela <span className="text-error">*</span>
                      </label>
                      <input
                        required
                        list="telas-list"
                        value={form.tela}
                        onChange={e => set('tela', e.target.value)}
                        placeholder="Ex: home, checkout, dashboard"
                        className={field}
                      />
                      <datalist id="telas-list">
                        {telas.map(t => <option key={t} value={t} />)}
                      </datalist>
                      <p className="mt-1 text-[11px] text-outline">Deve ser o mesmo valor enviado pelo sistema no UserPulse.init.</p>
                    </div>
                  )}

                  {form.modo_identificacao === 'data_cy' && (
                    <div className="md:col-span-2">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Data-cy da tela <span className="text-error">*</span>
                      </label>
                      <input
                        required
                        value={form.data_cy}
                        onChange={e => set('data_cy', e.target.value)}
                        placeholder="Ex: agenda-page"
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-outline">Informe apenas o valor do data-cy, exemplo: agenda-page.</p>
                    </div>
                  )}

                  {form.modo_identificacao === 'url_contem' && (
                    <div className="md:col-span-2">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        URL da tela no Clinic <span className="text-error">*</span>
                      </label>
                      <input
                        required
                        value={form.url_contem}
                        onChange={e => { set('url_contem', normalizeUrlContem(e.target.value)); setSelectedScreen(null) }}
                        placeholder="https://clinic.exemplo.com/app/atendimento/agendamentos"
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-outline">
                        Cole a URL completa da tela onde a campanha deve aparecer. O UserPulse usará apenas o caminho da URL para funcionar em diferentes ambientes.
                      </p>
                      {form.url_contem && !form.url_contem.startsWith('/') && (
                        <p className="mt-1 text-[11px] text-amber-600">
                          O caminho deve começar com "/". Exemplo: /app/atendimento/agendamentos
                        </p>
                      )}
                      {form.url_contem && (
                        <p className="mt-1.5 text-[11px] text-primary font-medium bg-primary/5 px-2.5 py-1.5 rounded-lg">
                          Esta campanha será exibida nesta rota e em suas subrotas: <strong>{form.url_contem}</strong>
                        </p>
                      )}
                      {campanhaConflitante && (
                        <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5">
                          <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
                          <div className="text-[12px] leading-snug">
                            <p className="font-semibold">Já existe uma campanha ativa para esta URL neste sistema.</p>
                            <p className="mt-0.5 text-amber-700">Se mantiver as duas ativas, apenas uma poderá ser exibida por vez para o usuário final.</p>
                            <p className="mt-1 font-medium">Campanha existente: <span className="font-bold">{campanhaConflitante.titulo}</span></p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="md:col-span-2 p-3 bg-primary-fixed/50 rounded-xl border border-primary/20">
                    <p className="text-label-md font-bold text-primary mb-1.5 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">summarize</span>
                      Resumo da configuração
                    </p>
                    <p className="text-body-md text-on-surface leading-snug">{buildResumo(form)}</p>
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Data de Início</label>
                    <input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} className={field} />
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Data de Término</label>
                    <input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} className={field} />
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Prioridade</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.prioridade}
                      onChange={e => set('prioridade', e.target.value)}
                      placeholder="Ex: 10"
                      className={field}
                    />
                    <p className="mt-1 text-[11px] text-outline">
                      Quando mais de uma campanha for elegível ao mesmo tempo, a campanha com maior prioridade será exibida primeiro.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Status</label>
                    <label className="relative inline-flex items-center cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={form.ativo}
                        onChange={e => set('ativo', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative" />
                      <span className="ml-3 text-body-md text-on-surface">{form.ativo ? 'Ativa' : 'Inativa'}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Conteúdo da Campanha */}
              <div className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="p-1.5 bg-secondary-fixed rounded-lg text-secondary material-symbols-outlined text-[20px]">edit_note</span>
                  <h3 className="text-title-lg font-bold text-on-surface">Conteúdo da Campanha</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Subtítulo</label>
                    <input
                      value={form.subtitulo}
                      onChange={e => set('subtitulo', e.target.value)}
                      placeholder="Ex: Novidade disponível para sua equipe"
                      className={field}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-1.5">
                      Texto principal <span className="text-error">*</span>
                    </label>
                    <textarea
                      required
                      rows={6}
                      value={form.descricao}
                      onChange={e => set('descricao', e.target.value)}
                      placeholder="Escreva a mensagem que o usuário verá…"
                      className={`${field} resize-none`}
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">URL da Imagem</label>
                    <input type="url" value={form.imagem_url} onChange={e => set('imagem_url', e.target.value)} placeholder="https://..." className={field} />
                    <p className="mt-1 text-[11px] text-outline">Exibida se não houver vídeo</p>
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">URL do Vídeo</label>
                    <input type="url" value={form.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://..." className={field} />
                    <p className="mt-1 text-[11px] text-outline">Tem prioridade sobre a imagem</p>
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Texto do Botão CTA</label>
                    <input value={form.texto_botao} onChange={e => set('texto_botao', e.target.value)} placeholder="Ex: Ver novidade" className={field} />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">URL do CTA</label>
                    <input type="url" value={form.url_botao} onChange={e => set('url_botao', e.target.value)} placeholder="https://..." className={field} />
                  </div>
                </div>
              </div>

              {/* Feature cards */}
              <div className="grid grid-cols-1 gap-4">
                {[
                  { icon: 'auto_awesome', color: 'text-primary', bg: 'psychology', label: 'Ajudante de IA', desc: 'Deixe nossa IA otimizar sua pergunta para melhores conversões.' },
                ].map(c => (
                  <div key={c.label} className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/50 relative overflow-hidden min-h-28 cursor-not-allowed opacity-70">
                    <div className="relative z-10">
                      <span className={`material-symbols-outlined ${c.color} mb-2`}>{c.icon}</span>
                      <h4 className="text-body-lg font-bold mb-1">{c.label}</h4>
                      <p className="text-body-md text-on-surface-variant">{c.desc}</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-10">
                      <span className="material-symbols-outlined text-[96px]">{c.bg}</span>
                    </div>
                    <span className="absolute top-3 right-3 text-[10px] font-bold text-outline bg-surface-container px-2 py-0.5 rounded-full uppercase tracking-wider">Em breve</span>
                  </div>
                ))}
              </div>

              {/* Segmentação */}
              <div className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="p-1.5 bg-secondary-fixed rounded-lg text-secondary material-symbols-outlined text-[20px]">target</span>
                  <div>
                    <h3 className="text-title-lg font-bold text-on-surface">Segmentação</h3>
                    <p className="text-label-md text-on-surface-variant">Deixe em branco para exibir para todos.</p>
                  </div>
                </div>
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
                  {isSegmented && (
                    <p className="text-[11px] text-amber-700 flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
                      <span className="material-symbols-outlined text-[14px] shrink-0">info</span>
                      Esta campanha só será exibida para usuários que correspondam a todos os filtros ativos.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right column (5/12) sticky ── */}
            <div className="col-span-12 lg:col-span-5 space-y-4 lg:sticky lg:top-[136px] lg:self-start">

              {/* Lógica de Feedback */}
              <div className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="p-1.5 bg-secondary-fixed rounded-lg text-secondary material-symbols-outlined text-[20px]">quiz</span>
                  <h3 className="text-title-lg font-bold text-on-surface">Lógica de Feedback</h3>
                </div>
                <div className="space-y-4">
                  {/* Exibição */}
                  <div className="p-3 bg-surface-container rounded-xl space-y-2">
                    <p className="text-label-md font-bold text-on-surface uppercase tracking-wider mb-1">Exibição</p>
                    {[
                      { value: 'modal_automatica', label: 'Modal automática', disabled: false },
                      { value: 'botao_flutuante', label: 'Botão flutuante', disabled: true },
                      { value: 'banner', label: 'Banner', disabled: true },
                      { value: 'toast', label: 'Toast', disabled: true },
                    ].map(opt => (
                      <label key={opt.value} className={`flex items-center gap-2 text-body-md ${opt.disabled ? 'text-outline cursor-not-allowed opacity-60' : 'text-on-surface cursor-pointer'}`}>
                        <input type="radio" name="modo_exibicao" value={opt.value} checked={form.modo_exibicao === opt.value} disabled={opt.disabled} onChange={e => set('modo_exibicao', e.target.value)} className="text-primary focus:ring-primary" />
                        {opt.label}
                        {opt.disabled && <span className="text-[10px] uppercase font-bold">em breve</span>}
                      </label>
                    ))}
                  </div>

                  {/* Gatilho */}
                  <div className="p-3 bg-surface-container rounded-xl space-y-3">
                    <p className="text-label-md font-bold text-on-surface uppercase tracking-wider">Quando exibir a campanha?</p>
                    <div className="space-y-2">
                      {[
                        { value: 'ao_abrir_tela', label: 'Assim que a tela abrir', desc: 'A campanha aparece automaticamente quando a tela for identificada.' },
                        { value: 'apos_evento', label: 'Depois de uma ação do usuário', desc: 'A campanha aparece somente quando o sistema disparar um evento.' },
                      ].map(opt => {
                        const active = form.gatilho === opt.value
                        return (
                          <label key={opt.value} className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all ${active ? 'border-primary bg-primary-fixed' : 'border-outline-variant bg-surface-bright hover:border-primary/50'}`}>
                            <input type="radio" name="gatilho" value={opt.value} checked={active} onChange={e => set('gatilho', e.target.value)} className="mt-0.5 text-primary focus:ring-primary shrink-0" />
                            <div>
                              <p className={`text-body-md font-semibold ${active ? 'text-primary' : 'text-on-surface'}`}>{opt.label}</p>
                              <p className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    {form.gatilho === 'apos_evento' && (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">
                          Nome da ação/evento <span className="text-error">*</span>
                        </label>
                        <input
                          required
                          value={form.evento}
                          onChange={e => set('evento', e.target.value)}
                          placeholder="Ex: paciente_agendado"
                          className={field}
                        />
                        <p className="mt-1 text-[11px] text-outline">Exemplo: paciente_agendado, consulta_finalizada, fila_reordenada.</p>
                      </div>
                    )}
                  </div>

                  {/* Config */}
                  <div className="p-3 bg-surface-container rounded-xl space-y-3">
                    <p className="text-label-md font-bold text-on-surface uppercase tracking-wider">Configurações</p>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Atraso para abrir (ms)</label>
                      <input type="number" min={0} value={form.atraso_ms} onChange={e => set('atraso_ms', e.target.value)} className={field} />
                    </div>
                    <label className="flex items-start gap-3 text-body-md text-on-surface cursor-pointer">
                      <input type="checkbox" checked={form.permitir_fechar_modal} onChange={e => set('permitir_fechar_modal', e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary mt-0.5 shrink-0" />
                      <span>
                        Permitir fechar sem responder
                        <span className="block text-[11px] text-outline font-normal mt-0.5">Desative quando o usuário precisar responder ou confirmar leitura para concluir a campanha.</span>
                      </span>
                    </label>
                    {!form.permitir_fechar_modal && !form.feedback_habilitado && !form.exige_confirmacao_leitura && (
                      <p className="text-[11px] text-error flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">error</span>
                        Habilite feedback ou confirmação de leitura na seção abaixo.
                      </p>
                    )}
                  </div>

                  {/* Feedback */}
                  <div className="p-3 bg-surface-container rounded-xl space-y-3">
                    <label className="flex items-center gap-3 text-body-md text-on-surface cursor-pointer">
                      <input id="feedback-enabled" type="checkbox" checked={form.feedback_habilitado} onChange={e => set('feedback_habilitado', e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                      Feedback habilitado
                    </label>
                    {form.feedback_habilitado && (
                      <>
                        <div>
                          <label className="block text-label-md text-on-surface-variant mb-1.5">Pergunta de feedback</label>
                          <input value={form.pergunta_feedback} onChange={e => set('pergunta_feedback', e.target.value)} placeholder="O que você achou?" className={field} />
                        </div>
                        <label className="flex items-center gap-3 text-body-md text-on-surface cursor-pointer">
                          <input id="obs-required" type="checkbox" checked={form.observacao_obrigatoria} onChange={e => set('observacao_obrigatoria', e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                          Observação obrigatória
                        </label>
                      </>
                    )}
                    <label className="flex items-center gap-3 text-body-md text-on-surface cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.exige_confirmacao_leitura}
                        onChange={e => set('exige_confirmacao_leitura', e.target.checked)}
                        className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                      />
                      <span>
                        Exigir confirmação de leitura
                        <span className="block text-[11px] text-outline font-normal mt-0.5">Exibe botão "Li e entendi" no lugar do NPS</span>
                      </span>
                    </label>
                  </div>

                  {/* Slug */}
                  {isEdit && (
                    <div className="pt-3 border-t border-outline-variant">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Slug (somente leitura)</label>
                      <div className="relative">
                        <div className="flex items-center bg-surface-container-high rounded-xl px-3 py-2 border border-outline-variant/30 overflow-hidden pr-10">
                          <span className="text-outline-variant text-code select-none shrink-0">slug: </span>
                          <span className="text-primary font-bold text-code truncate ml-1">{slug || '—'}</span>
                        </div>
                        {slug && (
                          <button type="button" onClick={copySlug} title="Copiar slug" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-container-highest rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-outline text-[18px]">{copied ? 'check' : 'content_copy'}</span>
                          </button>
                        )}
                      </div>
                      {copied && <p className="text-[11px] text-tertiary mt-1">Copiado!</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Reexibição */}
              <div className={card}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="p-1.5 bg-tertiary-fixed rounded-lg text-tertiary material-symbols-outlined text-[20px]">repeat</span>
                  <div>
                    <h3 className="text-title-lg font-bold text-on-surface">Reexibição</h3>
                    <p className="text-label-md text-on-surface-variant">Defina quando esta campanha poderá aparecer novamente para o mesmo usuário.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {([
                    {
                      value: 'uma_vez_apos_visualizacao',
                      label: 'Uma vez após visualização',
                      desc: 'Ideal para novidades, melhorias e comunicados simples. Depois que o usuário visualizar, a campanha não aparece novamente.',
                    },
                    {
                      value: 'ate_responder_ou_confirmar',
                      label: 'Até responder/confirmar',
                      desc: 'Ideal para campanhas obrigatórias. A campanha reaparece até o usuário responder ou confirmar leitura.',
                    },
                    {
                      value: 'reexibir_apos_dias',
                      label: 'Reexibir após X dias',
                      desc: 'Ideal para NPS e pesquisas recorrentes. A campanha pode aparecer novamente após o intervalo definido.',
                    },
                  ] as const).map(opt => {
                    const active = form.politica_reexibicao === opt.value
                    const incompativel = opt.value === 'uma_vez_apos_visualizacao' && !form.permitir_fechar_modal
                    return (
                      <label
                        key={opt.value}
                        className={`flex gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          incompativel
                            ? 'border-error/40 bg-error-container/30'
                            : active
                            ? 'border-primary bg-primary-fixed'
                            : 'border-outline-variant bg-surface-bright hover:border-primary/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="politica_reexibicao"
                          value={opt.value}
                          checked={active}
                          onChange={e => {
                            set('politica_reexibicao', e.target.value)
                            if (e.target.value !== 'reexibir_apos_dias') set('reexibir_apos_dias', '')
                          }}
                          className="mt-0.5 text-primary focus:ring-primary shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-body-md font-semibold ${active && !incompativel ? 'text-primary' : incompativel ? 'text-error' : 'text-on-surface'}`}>
                            {opt.label}
                            {incompativel && (
                              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-error">Incompatível</span>
                            )}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">{opt.desc}</p>
                          {active && opt.value === 'reexibir_apos_dias' && (
                            <div className="mt-3">
                              <label className="block text-label-md text-on-surface-variant mb-1.5">
                                Intervalo em dias <span className="text-error">*</span>
                              </label>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={form.reexibir_apos_dias}
                                onChange={e => set('reexibir_apos_dias', e.target.value)}
                                placeholder="Ex: 30"
                                className={`${field} max-w-[160px]`}
                              />
                              <p className="mt-1 text-[11px] text-outline">
                                A campanha poderá reaparecer após esse número de dias desde a última interação.
                              </p>
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                  {!form.permitir_fechar_modal && form.politica_reexibicao === 'uma_vez_apos_visualizacao' && (
                    <p className="text-[11px] text-error flex items-center gap-1.5 bg-error-container/40 px-3 py-2 rounded-lg">
                      <span className="material-symbols-outlined text-[14px] shrink-0">error</span>
                      Campanhas obrigatórias não podem usar esta política. Selecione "Até responder/confirmar".
                    </p>
                  )}

                  {/* Encerrar após evento */}
                  <div className="border-t border-outline-variant pt-3 mt-1">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.encerrar_apos_evento}
                        onChange={e => {
                          set('encerrar_apos_evento', e.target.checked)
                          if (!e.target.checked) set('evento_conclusao', '')
                        }}
                        className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary mt-0.5 shrink-0"
                      />
                      <span>
                        <span className="text-body-md font-semibold text-on-surface">Encerrar após evento realizado</span>
                        <span className="block text-[11px] text-on-surface-variant mt-0.5">
                          Quando o sistema integrado disparar este evento para o usuário, a campanha não será exibida novamente.
                        </span>
                      </span>
                    </label>
                    {form.encerrar_apos_evento && (
                      <div className="mt-3 ml-7">
                        <label className="block text-label-md text-on-surface-variant mb-1.5">
                          Nome do evento <span className="text-error">*</span>
                        </label>
                        <input
                          value={form.evento_conclusao}
                          onChange={e => set('evento_conclusao', e.target.value)}
                          placeholder="usou_nova_agenda"
                          className={`${field} max-w-xs`}
                        />
                        <p className="mt-1 text-[11px] text-outline">
                          Use o mesmo nome passado para <span className="font-mono">UserPulse.track("nome_do_evento")</span>.
                        </p>
                        {form.encerrar_apos_evento && !form.evento_conclusao.trim() && (
                          <p className="mt-1 text-[11px] text-error flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">error</span>
                            Informe o nome do evento.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              <div className={card}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-error shrink-0" />
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                  <span className="text-label-md font-bold text-on-surface-variant uppercase tracking-widest">Preview ao vivo</span>
                </div>

                {/* Modal mockup */}
                <div className="border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/40 bg-surface-container-low">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                      </div>
                      <span className="text-label-md font-bold text-on-surface truncate">
                        {form.titulo || 'Título da campanha'}
                      </span>
                    </div>
                    {form.permitir_fechar_modal && (
                      <span className="material-symbols-outlined text-[18px] text-outline shrink-0" title="Fechar">close</span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-3 bg-surface-container-lowest">
                    {form.subtitulo && (
                      <p className="text-label-md font-bold text-primary">{form.subtitulo}</p>
                    )}

                    {form.video_url ? (
                      <div className="aspect-video rounded-lg overflow-hidden bg-surface-container">
                        <iframe src={form.video_url} title="" className="w-full h-full border-0" />
                      </div>
                    ) : form.imagem_url ? (
                      <img src={form.imagem_url} alt="" className="w-full max-h-44 object-cover rounded-lg" />
                    ) : null}

                    <p className="text-body-md text-on-surface-variant leading-snug">
                      {form.descricao || <span className="italic opacity-40">Texto principal aparecerá aqui…</span>}
                    </p>

                    {form.texto_botao && form.url_botao && (
                      <div className="w-full py-2.5 bg-secondary rounded-lg text-center text-label-md font-bold text-on-secondary">
                        {form.texto_botao}
                      </div>
                    )}

                    {form.exige_confirmacao_leitura ? (
                      <div className="border-t border-outline-variant/40 pt-3">
                        <button
                          type="button"
                          disabled
                          className="w-full py-2.5 bg-primary text-on-primary rounded-lg text-label-md font-bold disabled:opacity-60"
                        >
                          Li e entendi
                        </button>
                      </div>
                    ) : form.feedback_habilitado && (
                      <div className="border-t border-outline-variant/40 pt-3">
                        <p className="text-body-md font-semibold text-on-surface mb-2">{previewQuestion}</p>
                        <NpsScale value={previewNota} onChange={setPreviewNota} />
                        <button
                          type="button"
                          disabled={previewNota === null}
                          className="mt-2 w-full py-2.5 bg-primary text-on-primary rounded-lg text-label-md font-bold disabled:opacity-40 transition-opacity"
                        >
                          Enviar Feedback
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}

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
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full h-11 rounded-xl border border-outline-variant bg-surface-bright px-4 text-body-md flex justify-between items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors hover:border-outline text-left"
      >
        <span className="text-on-surface">{selected?.label ?? options[0]?.label}</span>
        <span className={`material-symbols-outlined text-outline text-[18px] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-outline-variant bg-surface-bright shadow-lg overflow-hidden">
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
