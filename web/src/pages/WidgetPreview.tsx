import { useEffect, useState } from 'react'
import { get } from '../services/api'
import type { Campanha } from '../types'
import { NpsScale } from '../components/widget/NpsScale'

type Device = 'desktop' | 'tablet' | 'mobile'


interface FeedbackForm {
  nota: number | null
  observacao: string
}

function jsString(value: string) {
  return JSON.stringify(value)
}

function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  const n = d.length
  if (n === 0) return ''
  if (n <= 2) return '(' + d
  if (n <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2)
  if (n <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
}

export function WidgetPreview() {
  const [searchSlug, setSearchSlug] = useState('')
  const [searchSistema, setSearchSistema] = useState('')
  const [searchTela, setSearchTela] = useState('')
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [device, setDevice] = useState<Device>('desktop')
  const [widgetOpen, setWidgetOpen] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackForm>({ nota: null, observacao: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [telefone, setTelefone] = useState('')
  const [phoneDone, setPhoneDone] = useState(false)

  useEffect(() => {
    if (!campanha) return
    if (campanha.modo_exibicao !== 'modal_automatica' || campanha.gatilho !== 'ao_abrir_tela') return

    setWidgetOpen(false)
    const timer = window.setTimeout(() => setWidgetOpen(true), Math.max(0, campanha.atraso_ms ?? 800))
    return () => window.clearTimeout(timer)
  }, [campanha])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearching(true)
    setSearchError(null)
    setCampanha(null)
    setWidgetOpen(false)
    setSubmitted(false)
    setFeedback({ nota: null, observacao: '' })
    setTelefone('')
    setPhoneDone(false)

    try {
      let url = '/widget/campanha?'
      if (searchSlug.trim()) {
        url += `slug=${encodeURIComponent(searchSlug.trim())}`
      } else {
        url += `sistema=${encodeURIComponent(searchSistema.trim())}&tela=${encodeURIComponent(searchTela.trim())}`
      }
      const c = await get<Campanha>(url)
      setCampanha(c)
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Campanha não encontrada.')
    } finally {
      setSearching(false)
    }
  }

  const handleSubmitFeedback = () => {
    if (!campanha || feedback.nota === null) return
    if (!campanha.feedback_habilitado) return
    if (campanha.observacao_obrigatoria && !feedback.observacao.trim()) {
      setSubmitError('A observação é obrigatória para esta campanha.')
      return
    }
    setSubmitted(true)
  }

  const widgetSrc = typeof window === 'undefined' ? 'https://seu-dominio.com/widget-loader.js' : `${window.location.origin}/widget-loader.js`
  const embedCode = campanha
    ? `<script src="${widgetSrc}"></script>
<script>
  window.UserPulse.init({
    sistema: ${jsString(campanha.sistema)},
    tela: ${jsString(campanha.tela)},
    usuario_id: "123",
    usuario_nome: "Maria Silva",
    usuario_email: "maria@quarkclinic.com"
  });
</script>`
    : ''

  return (
    <section className="px-4 lg:px-margin-desktop py-5">
      {/* Header */}
      <div className="mb-5">
        <nav className="flex gap-2 text-label-md text-outline mb-1">
          <span>UserPulse</span><span>/</span>
          <span className="text-on-surface font-bold">Widget Preview</span>
        </nav>
        <h2 className="text-headline-lg font-bold text-on-surface">Preview do Widget</h2>
        <p className="text-body-md text-on-surface-variant mt-0.5">Teste e visualize o widget de feedback como um usuário final veria.</p>
      </div>

      {/* Search Panel */}
      <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm mb-5">
        <h3 className="text-title-lg font-bold text-on-surface mb-5">Buscar Campanha</h3>
        <form onSubmit={handleSearch}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-5">
            <div className="md:col-span-3">
              <label className="block text-label-md text-on-surface-variant mb-2">Por Slug</label>
              <input
                value={searchSlug}
                onChange={e => setSearchSlug(e.target.value)}
                placeholder="ex: pesquisa-satisfacao-q4"
                className="w-full bg-surface-bright border border-outline-variant rounded-xl p-3 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-2">Ou por Sistema</label>
              <input
                value={searchSistema}
                onChange={e => setSearchSistema(e.target.value)}
                placeholder="ex: portal"
                className="w-full bg-surface-bright border border-outline-variant rounded-xl p-3 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-label-md text-on-surface-variant mb-2">E Tela</label>
              <input
                value={searchTela}
                onChange={e => setSearchTela(e.target.value)}
                placeholder="ex: home"
                className="w-full bg-surface-bright border border-outline-variant rounded-xl p-3 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={searching || (!searchSlug.trim() && (!searchSistema.trim() || !searchTela.trim()))}
                className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold text-label-md hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-95"
              >
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
          </div>
          {searchError && (
            <div className="p-4 bg-error-container text-on-error-container rounded-xl text-body-md">
              {searchError}
            </div>
          )}
          {campanha && (
            <div className="p-4 bg-surface-container-low rounded-xl flex items-center justify-between">
              <div>
                <p className="text-body-md font-bold text-on-surface">{campanha.titulo}</p>
                <p className="text-label-md text-outline">{campanha.sistema} · {campanha.tela} · slug: {campanha.slug}</p>
              </div>
              <span className="px-3 py-1 bg-tertiary/10 text-tertiary rounded-full text-label-md font-bold">Encontrada</span>
            </div>
          )}
        </form>
      </div>

      {campanha && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Preview Canvas */}
          <div className="lg:col-span-8">
            {/* Device selector */}
            <div className="flex items-center gap-2 mb-4">
              {(['desktop', 'tablet', 'mobile'] as Device[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-label-md font-bold transition-all ${
                    device === d
                      ? 'bg-primary text-on-primary shadow'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {d === 'desktop' ? 'desktop_windows' : d === 'tablet' ? 'tablet' : 'smartphone'}
                  </span>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>

            {/* Canvas */}
            <div className="relative bg-gradient-to-br from-surface-container-lowest to-surface-container rounded-xl border border-outline-variant overflow-hidden"
              style={{ minHeight: '480px' }}>
              {/* Blurred background "content" */}
              <div className={`absolute inset-0 p-8 transition-all ${widgetOpen ? 'blur-sm scale-[0.98] opacity-70' : ''}`}>
                <div className="space-y-4">
                  <div className="h-8 bg-surface-container rounded-xl w-2/3" />
                  <div className="h-4 bg-surface-container-low rounded-lg w-full" />
                  <div className="h-4 bg-surface-container-low rounded-lg w-4/5" />
                  <div className="h-32 bg-surface-container rounded-xl w-full mt-4" />
                  <div className="grid grid-cols-3 gap-3">
                    {[1,2,3].map(i => <div key={i} className="h-20 bg-surface-container-low rounded-xl" />)}
                  </div>
                  <div className="h-4 bg-surface-container-low rounded-lg w-3/4" />
                  <div className="h-4 bg-surface-container-low rounded-lg w-1/2" />
                </div>
                <p className="absolute inset-x-0 bottom-8 text-center text-label-md text-on-surface-variant opacity-50">
                  Conteúdo do Sistema: {campanha.sistema} / {campanha.tela}
                </p>
              </div>

              {campanha.modo_exibicao === 'botao_flutuante' && (
                <div className="absolute bottom-6 right-6 z-20 opacity-50 pointer-events-none">
                  <button className="w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center">
                    <span className="material-symbols-outlined ms-fill">chat_bubble</span>
                  </button>
                </div>
              )}

              {/* Modal — centered with overlay */}
              {widgetOpen && (
                <>
                  <div className="absolute inset-0 z-10 bg-black/40" onClick={() => setWidgetOpen(false)} />
                  <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
                    <div
                      className="w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-2xl"
                      style={{ maxWidth: device === 'mobile' ? '300px' : device === 'tablet' ? '380px' : '520px' }}
                    >
                      {submitted ? (
                        <div className="p-6 space-y-4">
                          <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-tertiary/10 rounded-full flex items-center justify-center mx-auto">
                              <span className="material-symbols-outlined text-tertiary text-[36px] ms-fill">check_circle</span>
                            </div>
                            <h4 className="text-title-lg font-bold text-on-surface">Obrigado!</h4>
                            <p className="text-body-md text-on-surface-variant">Modo teste: nenhum feedback foi registrado.</p>
                          </div>

                          {!campanha.exige_confirmacao_leitura && (
                            <div className="border-t border-outline-variant/30 pt-4 space-y-3">
                              {phoneDone ? (
                                <p className="text-center text-body-sm font-semibold text-tertiary">Telefone registrado! (simulação)</p>
                              ) : (
                                <>
                                  <p className="text-body-sm font-semibold text-on-surface text-center">
                                    Quer deixar seu telefone para contato?
                                  </p>
                                  <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={telefone}
                                    onChange={e => setTelefone(maskPhone(e.target.value))}
                                    placeholder="(84) 99999-9999"
                                    maxLength={15}
                                    className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                  <button
                                    type="button"
                                    disabled={!telefone.trim()}
                                    onClick={() => setPhoneDone(true)}
                                    className="w-full rounded-xl bg-primary py-2.5 text-label-md font-bold text-on-primary disabled:opacity-40 hover:opacity-90 transition-opacity"
                                  >
                                    Enviar (simulação)
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => { setWidgetOpen(false); setSubmitted(false); setFeedback({ nota: null, observacao: '' }); setTelefone(''); setPhoneDone(false) }}
                            className="w-full py-2.5 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
                          >
                            Fechar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between p-5 border-b border-outline-variant/30">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-primary-fixed rounded-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-[16px]">chat_bubble</span>
                              </div>
                              <span className="text-label-md font-bold text-on-surface">{campanha.titulo}</span>
                            </div>
                            <button onClick={() => setWidgetOpen(false)} className="text-outline hover:text-on-surface transition-colors p-1">
                              <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                          </div>
                          <div className="p-5 space-y-4">
                            {campanha.subtitulo && <p className="text-label-md font-bold text-primary">{campanha.subtitulo}</p>}
                            <div className="space-y-2">
                              <p className="text-body-md text-on-surface-variant">{campanha.descricao}</p>
                              <p className="text-body-md font-medium text-on-surface">
                                {campanha.pergunta_feedback || 'Como podemos melhorar?'}
                              </p>
                            </div>
                            {campanha.video_url ? (
                              <div className="aspect-video overflow-hidden rounded-xl bg-surface-container">
                                <iframe src={campanha.video_url} title="Video da campanha" className="h-full w-full border-0" />
                              </div>
                            ) : campanha.imagem_url ? (
                              <img src={campanha.imagem_url} alt="" className="max-h-48 w-full rounded-xl object-cover border border-outline-variant/30" />
                            ) : null}
                            {campanha.texto_botao && campanha.url_botao && (
                              <a href={campanha.url_botao} target="_blank" rel="noreferrer" className="block w-full rounded-xl bg-secondary py-2.5 text-center text-label-md font-bold text-on-secondary hover:opacity-90 transition-opacity">
                                {campanha.texto_botao}
                              </a>
                            )}
                            {campanha.feedback_habilitado && (
                              <>
                                <NpsScale value={feedback.nota} onChange={n => setFeedback(f => ({ ...f, nota: n }))} />
                                <div>
                                  <textarea
                                    rows={3}
                                    value={feedback.observacao}
                                    onChange={e => setFeedback(f => ({ ...f, observacao: e.target.value }))}
                                    placeholder={campanha.observacao_obrigatoria ? 'Obrigatório: escreva sua observação…' : 'Observação (opcional)'}
                                    className="w-full resize-none border border-outline-variant rounded-xl p-3 text-body-md bg-surface-bright focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                  {campanha.observacao_obrigatoria && (
                                    <p className="text-[11px] text-error mt-1 flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[14px]">error</span>
                                      Observação obrigatória
                                    </p>
                                  )}
                                </div>
                                {submitError && (
                                  <p className="text-[12px] text-error">{submitError}</p>
                                )}
                                <button
                                  disabled={feedback.nota === null}
                                  onClick={handleSubmitFeedback}
                                  className="w-full py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-md hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-[0.98]"
                                >
                                  Enviar Feedback
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="lg:col-span-4 space-y-4">
            {/* Campaign info */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm">
              <h4 className="text-title-lg font-bold text-on-surface mb-4">Detalhes da Campanha</h4>
              <dl className="space-y-3">
                {[
                  { label: 'Slug', value: campanha.slug },
                  { label: 'Sistema', value: campanha.sistema },
                  { label: 'Tela', value: campanha.tela },
                  { label: 'Observação', value: campanha.observacao_obrigatoria ? 'Obrigatória' : 'Opcional' },
                  { label: 'Exibição', value: campanha.modo_exibicao === 'modal_automatica' ? 'Modal automática' : campanha.modo_exibicao },
                  { label: 'Gatilho', value: campanha.gatilho === 'ao_abrir_tela' ? 'Ao abrir tela' : campanha.gatilho },
                  { label: 'Atraso', value: `${campanha.atraso_ms} ms` },
                  { label: 'Uma vez', value: campanha.mostrar_uma_vez ? 'Sim' : 'Não' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start gap-2">
                    <dt className="text-label-md text-outline">{label}</dt>
                    <dd className="text-label-md text-on-surface font-bold text-right break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Embed Code */}
            <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-on-surface-variant text-[20px]">code</span>
                <h4 className="text-title-lg font-bold text-on-surface">Código de Incorporação</h4>
              </div>
              <div className="bg-inverse-surface rounded-xl p-4 relative group">
                <pre className="text-inverse-on-surface text-code text-[11px] whitespace-pre-wrap break-all leading-relaxed font-mono">{embedCode}</pre>
                <button
                  onClick={() => navigator.clipboard.writeText(embedCode).catch(() => {})}
                  title="Copiar código"
                  className="absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-inverse-on-surface text-[16px]">content_copy</span>
                </button>
              </div>
              <p className="text-[11px] text-outline mt-3 italic">
                Copie este snippet e cole antes do `&lt;/body&gt;` do sistema-alvo.
                O script busca a campanha ativa por sistema e tela.
              </p>
            </div>
          </div>
        </div>
      )}

      {!campanha && !searching && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-[40px]">preview</span>
          </div>
          <h3 className="text-title-lg font-bold text-on-surface mb-2">Nenhuma campanha carregada</h3>
          <p className="text-body-md text-on-surface-variant max-w-md">Busque uma campanha acima pelo slug ou pelo sistema e tela para visualizar o widget em ação.</p>
        </div>
      )}
    </section>
  )
}
