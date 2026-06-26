import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { Campanha } from '../../types'
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
  intervalo_reexibicao_dias: string
  categoria: string
}

const EMPTY: FormState = {
  titulo: '', subtitulo: '', descricao: '', tipo: 'pesquisa', sistema: '', tela: '',
  imagem_url: '', video_url: '', texto_botao: '', url_botao: '', feedback_habilitado: true,
  modo_exibicao: 'modal_automatica', gatilho: 'ao_abrir_tela', evento: '',
  modo_identificacao: 'sistema_tela', data_cy: '', url_contem: '', atraso_ms: '800',
  mostrar_uma_vez: false, prioridade: '0', ordem: '0',
  ativo: true, data_inicio: '', data_fim: '', pergunta_feedback: '', observacao_obrigatoria: false,
  exige_confirmacao_leitura: false, intervalo_reexibicao_dias: '', categoria: '',
}

const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'
const card = 'bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'

export function CampanhaForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [slug, setSlug] = useState('')
  const [sistemas, setSistemas] = useState<string[]>([])
  const [telas, setTelas] = useState<string[]>([])
  const [loadingCampanha, setLoadingCampanha] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)
  const [previewNota, setPreviewNota] = useState<number | null>(null)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    get<Campanha[]>('/campanhas').then(cs => {
      setSistemas([...new Set(cs.map(c => c.sistema).filter(Boolean))])
      setTelas([...new Set(cs.map(c => c.tela).filter(Boolean))])
    }).catch(() => {})
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
          intervalo_reexibicao_dias: c.intervalo_reexibicao_dias != null ? String(c.intervalo_reexibicao_dias) : '',
          categoria: c.categoria ?? '',
        })
        setSlug(c.slug)
      })
      .catch(() => setError('Campanha não encontrada.'))
      .finally(() => setLoadingCampanha(false))
  }, [id])

  const set = (key: keyof FormState, value: string | boolean) =>
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

  const copySlug = () => {
    navigator.clipboard.writeText(slug).catch(() => {})
    setCopied(true)
    if (copyTimeout.current) clearTimeout(copyTimeout.current)
    copyTimeout.current = setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
        url_contem: form.url_contem || null,
        atraso_ms: Number(form.atraso_ms || 800),
        prioridade: Number(form.prioridade || 0),
        ordem: Number(form.ordem || 0),
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        pergunta_feedback: form.pergunta_feedback || null,
        intervalo_reexibicao_dias: form.intervalo_reexibicao_dias !== '' ? Number(form.intervalo_reexibicao_dias) : null,
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

  const previewQuestion = form.pergunta_feedback.trim() || form.titulo.trim() || 'Como podemos melhorar?'

  return (
    <div className="relative">
      {/* ── Sticky action bar ── */}
      <div className="sticky top-16 z-30 bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-3">
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
                    <select required value={form.tipo} onChange={e => set('tipo', e.target.value)} className={field}>
                      {TIPOS.map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Categoria</label>
                    <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className={field}>
                      <option value="">Sem categoria</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">
                      Sistema <span className="text-error">*</span>
                    </label>
                    <input
                      required
                      list="sistemas-list"
                      value={form.sistema}
                      onChange={e => set('sistema', e.target.value)}
                      placeholder="Ex: portal, crm, mobile"
                      className={field}
                    />
                    <datalist id="sistemas-list">
                      {sistemas.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-label-md text-on-surface-variant mb-2">
                      Modo de identificação <span className="text-error">*</span>
                    </label>
                    <div className="flex flex-wrap gap-5">
                      {[
                        { value: 'sistema_tela', label: 'Sistema / Tela' },
                        { value: 'data_cy', label: 'Data-cy' },
                        { value: 'url_contem', label: 'URL contém' },
                      ].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                          <input
                            type="radio"
                            name="modo_identificacao"
                            value={opt.value}
                            checked={form.modo_identificacao === opt.value}
                            onChange={e => set('modo_identificacao', e.target.value)}
                            className="text-primary focus:ring-primary"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {form.modo_identificacao === 'sistema_tela' && (
                    <div className="md:col-span-2">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Tela <span className="text-error">*</span>
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
                    </div>
                  )}

                  {form.modo_identificacao === 'data_cy' && (
                    <div className="md:col-span-2">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Valor do data-cy <span className="text-error">*</span>
                      </label>
                      <input
                        required
                        value={form.data_cy}
                        onChange={e => set('data_cy', e.target.value)}
                        placeholder="Ex: agenda-page"
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-outline">Widget procura por [data-cy="valor"] no DOM da página</p>
                    </div>
                  )}

                  {form.modo_identificacao === 'url_contem' && (
                    <div className="md:col-span-2">
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        URL contém <span className="text-error">*</span>
                      </label>
                      <input
                        required
                        value={form.url_contem}
                        onChange={e => set('url_contem', e.target.value)}
                        placeholder="Ex: /agenda ou agendamento"
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-outline">Valida se window.location.href ou pathname contém o valor</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Data de Início</label>
                    <input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} className={field} />
                  </div>

                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Data de Término</label>
                    <input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} className={field} />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: 'auto_awesome', color: 'text-primary', bg: 'psychology', label: 'Ajudante de IA', desc: 'Deixe nossa IA otimizar sua pergunta para melhores conversões.' },
                  { icon: 'target', color: 'text-secondary', bg: 'group', label: 'Segmentação', desc: 'Defina exatamente quais usuários verão este Pulse.' },
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
                  <div className="p-3 bg-surface-container rounded-xl space-y-2">
                    <p className="text-label-md font-bold text-on-surface uppercase tracking-wider mb-1">Gatilho</p>
                    {[
                      { value: 'ao_abrir_tela', label: 'Ao abrir tela' },
                      { value: 'apos_evento', label: 'Após evento' },
                    ].map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
                        <input type="radio" name="gatilho" value={opt.value} checked={form.gatilho === opt.value} onChange={e => set('gatilho', e.target.value)} className="text-primary focus:ring-primary" />
                        {opt.label}
                      </label>
                    ))}
                    {form.gatilho === 'apos_evento' && (
                      <div className="pt-1">
                        <label className="block text-label-md text-on-surface-variant mb-1.5">
                          Nome do evento <span className="text-error">*</span>
                        </label>
                        <input
                          required
                          value={form.evento}
                          onChange={e => set('evento', e.target.value)}
                          placeholder="Ex: paciente_agendado"
                          className={field}
                        />
                        <p className="mt-1 text-[11px] text-outline">Disparar via <code>window.UserPulse.track("nome_do_evento")</code></p>
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
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Reexibir após resposta</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={form.intervalo_reexibicao_dias}
                        onChange={e => set('intervalo_reexibicao_dias', e.target.value)}
                        placeholder="Ex: 60"
                        className={field}
                      />
                      <p className="mt-1 text-[11px] text-outline">
                        Informe em quantos dias esta campanha poderá aparecer novamente após o usuário responder. Deixe vazio para não exibir novamente após resposta.
                      </p>
                    </div>
                    <label className="flex items-center gap-3 text-body-md text-on-surface cursor-pointer">
                      <input type="checkbox" checked={form.mostrar_uma_vez} onChange={e => set('mostrar_uma_vez', e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                      Mostrar apenas uma vez
                    </label>
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
                    <span className="material-symbols-outlined text-[18px] text-outline shrink-0">close</span>
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
