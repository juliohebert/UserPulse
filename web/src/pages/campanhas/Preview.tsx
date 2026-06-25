import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { Campanha } from '../../types'
import { NpsScale } from '../../components/widget/NpsScale'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { gerarEmbed } from '../../utils/campanha'

export function CampanhaPreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [nota, setNota] = useState<number | null>(null)
  const [observacao, setObservacao] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => {
    if (!id) return
    setLoading(true)
    setError(null)
    get<Campanha>(`/campanhas/${id}`)
      .then(c => {
        setCampanha(c)
        setOpen(false)
        setNota(null)
        setObservacao('')
        setSubmitted(false)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  useEffect(() => {
    if (!campanha) return
    if (campanha.modo_exibicao !== 'modal_automatica' || campanha.gatilho !== 'ao_abrir_tela') return

    const timer = window.setTimeout(() => setOpen(true), Math.max(0, campanha.atraso_ms ?? 800))
    return () => window.clearTimeout(timer)
  }, [campanha])

  const resetSimulation = () => {
    setOpen(false)
    setNota(null)
    setObservacao('')
    setSubmitted(false)
    window.setTimeout(() => setOpen(true), Math.max(0, campanha?.atraso_ms ?? 800))
  }

  if (loading) return <div className="px-margin-desktop py-stack-lg"><LoadingSpinner /></div>
  if (error || !campanha) return <div className="px-margin-desktop py-stack-lg"><ErrorState message={error ?? 'Campanha não encontrada.'} onRetry={load} /></div>

  const question = campanha.pergunta_feedback || 'Como podemos melhorar?'
  const embedCode = gerarEmbed(campanha)

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="px-4 lg:px-margin-desktop py-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <nav className="flex gap-2 text-label-md text-outline mb-1">
            <button onClick={() => navigate('/campanhas')} className="hover:text-primary transition-colors">Campanhas</button>
            <span>/</span>
            <span className="text-on-surface">Preview</span>
          </nav>
          <h2 className="text-headline-lg font-bold text-on-surface">{campanha.titulo}</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">Modo teste: nenhum feedback será registrado.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={resetSimulation}
            className="px-4 py-2 border border-primary text-primary rounded-xl text-label-md font-bold hover:bg-primary-fixed transition-all"
          >
            Testar exibição
          </button>
          <button
            type="button"
            onClick={() => navigate(`/campanhas/${campanha.id}/editar`)}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all"
          >
            Editar
          </button>
        </div>
      </div>

      <div className={`relative min-h-[560px] rounded-xl border border-outline-variant bg-gradient-to-br from-surface-container-lowest to-surface-container shadow-sm${open ? '' : ' overflow-hidden'}`}>
        <div className={`absolute inset-0 p-8 transition-all ${open ? 'blur-sm scale-[0.99] opacity-70' : ''}`}>
          <div className="max-w-4xl space-y-5">
            <div className="h-9 w-2/3 rounded-xl bg-surface-container" />
            <div className="h-4 w-full rounded-lg bg-surface-container-low" />
            <div className="h-4 w-4/5 rounded-lg bg-surface-container-low" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              {[1, 2, 3].map(item => (
                <div key={item} className="h-32 rounded-xl bg-surface-container-low" />
              ))}
            </div>
            <div className="h-44 rounded-xl bg-surface-container" />
          </div>
          <p className="absolute inset-x-0 bottom-8 text-center text-label-md text-on-surface-variant opacity-60">
            Simulação do sistema {campanha.sistema} / {campanha.tela}
          </p>
        </div>

        {open && (
          <>
            <div className="absolute inset-0 z-10 bg-black/40" onClick={() => setOpen(false)} />
            <div className="relative z-20 flex min-h-[560px] items-center justify-center p-6">
            <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl">
            {submitted ? (
              <div className="p-6 text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-tertiary/10">
                  <span className="material-symbols-outlined text-tertiary text-[36px] ms-fill">check_circle</span>
                </div>
                <h3 className="text-title-lg font-bold text-on-surface">Obrigado!</h3>
                <p className="text-body-md text-on-surface-variant">Modo teste: nenhum feedback foi registrado.</p>
                <button onClick={() => setOpen(false)} className="w-full rounded-xl border border-outline-variant py-2.5 text-label-md font-bold text-on-surface-variant">
                  Fechar
                </button>
              </div>
            ) : (
              <>
                {/* Cabeçalho */}
                <div className="flex items-center justify-between border-b border-outline-variant/30 px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary text-[16px]">campaign</span>
                    </div>
                    <h3 className="text-body-lg font-bold text-on-surface truncate">{campanha.titulo}</h3>
                  </div>
                  <button onClick={() => setOpen(false)} className="p-1 text-outline hover:text-on-surface shrink-0 ml-2">
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Conteúdo */}
                <div className="p-5 space-y-4">
                  {campanha.subtitulo && (
                    <p className="text-label-md font-bold text-primary">{campanha.subtitulo}</p>
                  )}

                  {/* Mídia */}
                  {campanha.video_url ? (
                    <div className="aspect-video overflow-hidden rounded-xl bg-surface-container">
                      <iframe src={campanha.video_url} title="Vídeo da campanha" className="h-full w-full border-0" />
                    </div>
                  ) : campanha.imagem_url ? (
                    <img src={campanha.imagem_url} alt="" className="max-h-52 w-full rounded-xl border border-outline-variant/30 object-cover" />
                  ) : null}

                  <p className="text-body-md text-on-surface-variant leading-relaxed">{campanha.descricao}</p>

                  {/* CTA */}
                  {campanha.texto_botao && campanha.url_botao && (
                    <a
                      href={campanha.url_botao}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary py-3 text-label-md font-bold text-on-secondary hover:opacity-90 transition-opacity"
                    >
                      {campanha.texto_botao}
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    </a>
                  )}

                  {/* Feedback */}
                  {campanha.feedback_habilitado && (
                    <div className="border-t border-outline-variant/40 pt-4 space-y-3">
                      <p className="text-body-md font-semibold text-on-surface">{question}</p>
                      <NpsScale value={nota} onChange={setNota} />
                      <textarea
                        rows={3}
                        value={observacao}
                        onChange={e => setObservacao(e.target.value)}
                        placeholder={campanha.observacao_obrigatoria ? 'Obrigatório: escreva sua observação…' : 'Observação (opcional)'}
                        className="w-full resize-none rounded-xl border border-outline-variant bg-surface-bright p-3 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        disabled={nota === null}
                        onClick={() => setSubmitted(true)}
                        className="w-full rounded-xl bg-primary py-2.5 text-label-md font-bold text-on-primary disabled:opacity-40 hover:opacity-90 transition-opacity"
                      >
                        Simular envio
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
            </div>
          </>
        )}
      </div>

      {/* Código de integração */}
      <div className="mt-5 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant">code</span>
            <h3 className="text-title-lg font-bold text-on-surface">Código de integração</h3>
          </div>
          <button
            onClick={copyEmbed}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-label-md font-bold transition-all ${
              copied
                ? 'bg-tertiary/10 text-tertiary'
                : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
        </div>
        <div className="bg-inverse-surface p-5 overflow-x-auto">
          <pre className="text-inverse-on-surface font-mono text-[13px] leading-relaxed whitespace-pre">{embedCode}</pre>
        </div>
        <p className="px-5 py-3 text-label-md text-outline">
          Cole este snippet antes do <code className="bg-surface-container px-1 py-0.5 rounded text-[12px]">&lt;/body&gt;</code> do sistema-alvo. Substitua os placeholders pelos dados reais do usuário logado.
        </p>
      </div>
    </section>
  )
}
