import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get, post } from '../../services/api'
import type { Campanha, Criterio, ResultadoElegibilidade } from '../../types'
import { NpsScale } from '../../components/widget/NpsScale'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { gerarEmbed, gerarEmbedParts } from '../../utils/campanha'
import { useAuth } from '../../hooks/useAuth'

function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  const n = d.length
  if (n === 0) return ''
  if (n <= 2) return '(' + d
  if (n <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2)
  if (n <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
}

export function CampanhaPreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [campanha, setCampanha] = useState<Campanha | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [nota, setNota] = useState<number | null>(null)
  const [observacao, setObservacao] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [phoneDone, setPhoneDone] = useState(false)

  // Eligibility test
  const [eligForm, setEligForm] = useState({
    sistema: '', tela: '', url: '', usuario_id: '', evento: '',
    cliente_id: '', unidade_id: '', perfil: '', usuario_tipo: '', estado: '',
  })
  const [eligResult, setEligResult] = useState<ResultadoElegibilidade | null>(null)
  const [eligLoading, setEligLoading] = useState(false)
  const [eligError, setEligError] = useState<string | null>(null)

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
        setEligResult(null)
        setEligError(null)
        const modo = c.modo_identificacao || 'sistema_tela'
        setEligForm({
          sistema: c.sistema,
          tela: modo === 'sistema_tela' ? (c.tela ?? '') : '',
          url: modo === 'url_contem' ? (c.url_contem ?? '') : '',
          usuario_id: '',
          evento: c.evento ?? '',
          cliente_id: '', unidade_id: '', perfil: '', usuario_tipo: '', estado: '',
        })
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
    setTelefone('')
    setPhoneDone(false)
    window.setTimeout(() => setOpen(true), Math.max(0, campanha?.atraso_ms ?? 800))
  }

  if (loading) return <div className="px-margin-desktop py-stack-lg"><LoadingSpinner /></div>
  if (error || !campanha) return <div className="px-margin-desktop py-stack-lg"><ErrorState message={error ?? 'Campanha não encontrada.'} onRetry={load} /></div>

  const modo = campanha.modo_identificacao || 'sistema_tela'
  const isAfterEvent = (campanha.gatilho || 'ao_abrir_tela') === 'apos_evento'

  const testarElegibilidade = async (e: React.FormEvent) => {
    e.preventDefault()
    setEligLoading(true)
    setEligError(null)
    setEligResult(null)
    try {
      const body: Record<string, string> = { sistema: eligForm.sistema }
      if (eligForm.tela) body.tela = eligForm.tela
      if (eligForm.url) body.url = eligForm.url
      if (eligForm.usuario_id) body.usuario_id = eligForm.usuario_id
      if (eligForm.evento) body.evento = eligForm.evento
      if (eligForm.cliente_id) body.cliente_id = eligForm.cliente_id
      if (eligForm.unidade_id) body.unidade_id = eligForm.unidade_id
      if (eligForm.perfil) body.perfil = eligForm.perfil
      if (eligForm.usuario_tipo) body.usuario_tipo = eligForm.usuario_tipo
      if (eligForm.estado) body.estado = eligForm.estado
      const result = await post<ResultadoElegibilidade>(`/campanhas/${id}/testar-elegibilidade`, body)
      setEligResult(result)
    } catch (err) {
      setEligError(err instanceof Error ? err.message : 'Erro ao testar elegibilidade.')
    } finally {
      setEligLoading(false)
    }
  }

  const question = campanha.pergunta_feedback || 'Como podemos melhorar?'
  const embedCode = gerarEmbed(campanha, user?.tenant.public_key)
  const embedParts = gerarEmbedParts(campanha, user?.tenant.public_key)
  const initSection = [
    embedParts.widgetSrcTag,
    '<script>',
    embedParts.initCode,
    ...(embedParts.initNote ? ['', embedParts.initNote] : []),
    '</script>',
  ].join('\n')

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="px-4 lg:px-margin-desktop py-5 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">{campanha.titulo}</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">Modo teste: nenhum feedback será registrado.</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            onClick={resetSimulation}
            variant="ghost"
          >
            Testar exibição
          </Button>
          <Button
            type="button"
            onClick={() => navigate(`/campanhas/${campanha.id}/editar`)}
          >
            Editar
          </Button>
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
              <div className="p-6 space-y-4">
                <div className="text-center space-y-3">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-tertiary/10">
                    <span className="material-symbols-outlined text-tertiary text-[36px] ms-fill">check_circle</span>
                  </div>
                  <h3 className="text-title-lg font-bold text-on-surface">Obrigado!</h3>
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
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl border border-outline-variant py-2.5 text-label-md font-bold text-on-surface-variant"
                >
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
      <div className="mt-5 w-full max-w-full bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-outline-variant/30">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-on-surface-variant shrink-0">code</span>
            <h3 className="text-title-lg font-bold text-on-surface">Código de integração</h3>
          </div>
          <button
            onClick={copyEmbed}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-label-md font-bold transition-all w-full sm:w-auto shrink-0 ${
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

        {embedParts.isAfterEvent && (
          <div className="px-5 py-2.5 border-b border-outline-variant/30 bg-surface-container-low">
            <p className="text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider">
              1 — Inicialização <span className="normal-case font-normal">(cole antes do &lt;/body&gt;, uma vez)</span>
            </p>
          </div>
        )}
        <div className="max-w-full bg-inverse-surface p-5 overflow-x-auto">
          <pre className="text-inverse-on-surface font-mono text-[13px] leading-relaxed whitespace-pre">{initSection}</pre>
        </div>

        {embedParts.trackCode && (
          <>
            <div className="px-5 py-2.5 border-t border-b border-outline-variant/30 bg-surface-container-low">
              <p className="text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider">
                2 — Disparo do evento <span className="normal-case font-normal">(chame após a ação acontecer)</span>
              </p>
            </div>
            <div className="max-w-full bg-inverse-surface p-5 overflow-x-auto">
              <pre className="text-inverse-on-surface font-mono text-[13px] leading-relaxed whitespace-pre">{embedParts.trackCode}</pre>
            </div>
            <p className="px-5 py-3 text-label-md text-outline border-t border-outline-variant/30">
              Use o init ao carregar a página e chame o track somente depois que a ação desejada acontecer no sistema hospedeiro.
            </p>
          </>
        )}

        {!embedParts.isAfterEvent && (
          <p className="px-5 py-3 text-label-md text-outline border-t border-outline-variant/30">
            Cole este snippet antes do <code className="bg-surface-container px-1 py-0.5 rounded text-[12px]">&lt;/body&gt;</code> do sistema-alvo. Substitua os placeholders pelos dados reais do usuário logado.
          </p>
        )}
      </div>

      {/* ── Teste de elegibilidade ── */}
      <div className="mt-5 w-full max-w-full bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-outline-variant/30">
          <span className="material-symbols-outlined text-on-surface-variant shrink-0 mt-0.5">rule</span>
          <div className="min-w-0">
            <h3 className="text-title-lg font-bold text-on-surface">Teste de elegibilidade</h3>
            <p className="text-label-md text-outline mt-0.5">Simule se esta campanha seria exibida para um usuário. Nenhum dado é registrado.</p>
          </div>
        </div>

        <form onSubmit={testarElegibilidade} className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sistema */}
            <div>
              <label className="block text-label-md text-on-surface-variant mb-1.5">Sistema</label>
              <input
                value={eligForm.sistema}
                onChange={e => setEligForm(f => ({ ...f, sistema: e.target.value }))}
                placeholder={campanha.sistema}
                className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Tela (sistema_tela) */}
            {modo === 'sistema_tela' && (
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">Tela</label>
                <input
                  value={eligForm.tela}
                  onChange={e => setEligForm(f => ({ ...f, tela: e.target.value }))}
                  placeholder={campanha.tela ?? 'ex: agendamentos'}
                  className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {/* URL (url_contem) */}
            {modo === 'url_contem' && (
              <div className="md:col-span-1">
                <label className="block text-label-md text-on-surface-variant mb-1.5">URL atual</label>
                <input
                  value={eligForm.url}
                  onChange={e => setEligForm(f => ({ ...f, url: e.target.value }))}
                  placeholder={campanha.url_contem ?? 'https://sistema.exemplo.com/tela'}
                  className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {/* URL extra para data_cy (informacional) */}
            {modo === 'data_cy' && (
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">
                  URL atual <span className="text-outline font-normal">(opcional)</span>
                </label>
                <input
                  value={eligForm.url}
                  onChange={e => setEligForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://sistema.exemplo.com/tela"
                  className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {/* Usuário ID */}
            <div>
              <label className="block text-label-md text-on-surface-variant mb-1.5">
                Usuário ID <span className="text-outline font-normal">(opcional)</span>
              </label>
              <input
                value={eligForm.usuario_id}
                onChange={e => setEligForm(f => ({ ...f, usuario_id: e.target.value }))}
                placeholder="ex: 488855"
                className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Evento (apos_evento) */}
            {(isAfterEvent || campanha.evento) && (
              <div>
                <label className="block text-label-md text-on-surface-variant mb-1.5">
                  Evento {isAfterEvent ? '' : <span className="text-outline font-normal">(opcional)</span>}
                </label>
                <input
                  value={eligForm.evento}
                  onChange={e => setEligForm(f => ({ ...f, evento: e.target.value }))}
                  placeholder={campanha.evento ?? 'ex: paciente_agendado'}
                  className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            {/* Contexto de segmentação (only shown when campaign has segmentation) */}
            {(campanha.segmentar_cliente_ids.length > 0 || campanha.segmentar_unidade_ids.length > 0 ||
              campanha.segmentar_perfis.length > 0 || campanha.segmentar_usuario_tipos.length > 0 ||
              campanha.segmentar_estados.length > 0) && (
              <div className="md:col-span-2 border-t border-outline-variant/40 pt-3 space-y-3">
                <p className="text-label-md font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-secondary">target</span>
                  Contexto de segmentação
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {campanha.segmentar_cliente_ids.length > 0 && (
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Cliente ID <span className="text-outline font-normal text-[11px] break-words">[{campanha.segmentar_cliente_ids.join(', ')}]</span>
                      </label>
                      <input
                        value={eligForm.cliente_id}
                        onChange={e => setEligForm(f => ({ ...f, cliente_id: e.target.value }))}
                        placeholder="cliente_id no init()"
                        className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                  {campanha.segmentar_unidade_ids.length > 0 && (
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Unidade ID <span className="text-outline font-normal text-[11px] break-words">[{campanha.segmentar_unidade_ids.join(', ')}]</span>
                      </label>
                      <input
                        value={eligForm.unidade_id}
                        onChange={e => setEligForm(f => ({ ...f, unidade_id: e.target.value }))}
                        placeholder="unidade_id no init()"
                        className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                  {campanha.segmentar_perfis.length > 0 && (
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Perfil <span className="text-outline font-normal text-[11px] break-words">[{campanha.segmentar_perfis.join(', ')}]</span>
                      </label>
                      <input
                        value={eligForm.perfil}
                        onChange={e => setEligForm(f => ({ ...f, perfil: e.target.value }))}
                        placeholder="Perfil no init()"
                        className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                  {campanha.segmentar_usuario_tipos.length > 0 && (
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Tipo de usuário <span className="text-outline font-normal text-[11px] break-words">[{campanha.segmentar_usuario_tipos.join(', ')}]</span>
                      </label>
                      <input
                        value={eligForm.usuario_tipo}
                        onChange={e => setEligForm(f => ({ ...f, usuario_tipo: e.target.value }))}
                        placeholder="usuario_tipo no init()"
                        className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                  {campanha.segmentar_estados.length > 0 && (
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">
                        Estado <span className="text-outline font-normal text-[11px] break-words">[{campanha.segmentar_estados.join(', ')}]</span>
                      </label>
                      <input
                        value={eligForm.estado}
                        onChange={e => setEligForm(f => ({ ...f, estado: e.target.value }))}
                        placeholder="Estado no init()"
                        className="w-full bg-surface-bright border border-outline-variant rounded-xl px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {modo === 'data_cy' && (
            <p className="text-label-md text-on-surface-variant bg-surface-container-low rounded-xl px-4 py-2.5 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">info</span>
              <span>Esta campanha usa seletor <code className="bg-surface-container px-1 rounded text-[12px]">data-cy="{campanha.data_cy}"</code>. A correspondência depende do DOM do sistema integrado e não pode ser verificada aqui.</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={eligLoading || !eligForm.sistema.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {eligLoading
                ? <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Testando…</>
                : <><span className="material-symbols-outlined text-[18px]">labs</span> Testar elegibilidade</>
              }
            </button>
            {eligResult && (
              <button type="button" onClick={() => setEligResult(null)} className="text-label-md text-outline hover:text-on-surface transition-colors">
                Limpar resultado
              </button>
            )}
          </div>
        </form>

        {/* Resultado */}
        {eligError && (
          <div className="mx-5 mb-5 p-4 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            {eligError}
          </div>
        )}

        {eligResult && (
          <div className="mx-5 mb-5 space-y-3">
            {/* Veredicto */}
            <div className={`rounded-xl p-4 flex items-start gap-3 ${
              eligResult.exibiria
                ? 'bg-[#e6f4ea] border border-[#a8d5b5]'
                : eligResult.elegivel
                  ? 'bg-[#fff8e1] border border-[#ffe082]'
                  : 'bg-error-container border border-[#f5c6c6]'
            }`}>
              <span className={`material-symbols-outlined text-[22px] shrink-0 mt-0.5 ms-fill ${
                eligResult.exibiria ? 'text-[#1e7e34]' : eligResult.elegivel ? 'text-[#e65100]' : 'text-error'
              }`}>
                {eligResult.exibiria ? 'check_circle' : eligResult.elegivel ? 'warning' : 'cancel'}
              </span>
              <div>
                <p className={`text-body-md font-bold ${
                  eligResult.exibiria ? 'text-[#1e7e34]' : eligResult.elegivel ? 'text-[#e65100]' : 'text-error'
                }`}>
                  {eligResult.exibiria
                    ? 'A campanha seria exibida para este usuário.'
                    : eligResult.elegivel
                      ? 'A campanha é elegível, mas não seria a primeira exibida.'
                      : 'A campanha não seria exibida.'}
                </p>
                <p className="text-body-sm text-on-surface-variant mt-0.5">{eligResult.motivo}</p>
              </div>
            </div>

            {/* Critérios */}
            <div className="rounded-xl border border-outline-variant/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-container-low border-b border-outline-variant/30">
                <p className="text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider">Critérios avaliados</p>
              </div>
              <ul className="divide-y divide-outline-variant/20">
                {eligResult.criterios.map((c: Criterio, i: number) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-3">
                    <span className={`material-symbols-outlined text-[16px] shrink-0 mt-0.5 ms-fill ${
                      c.status === 'ok' ? 'text-[#1e7e34]'
                      : c.status === 'bloqueado' ? 'text-error'
                      : c.status === 'aviso' ? 'text-[#e65100]'
                      : 'text-outline'
                    }`}>
                      {c.status === 'ok' ? 'check_circle'
                        : c.status === 'bloqueado' ? 'cancel'
                        : c.status === 'aviso' ? 'warning'
                        : 'radio_button_unchecked'}
                    </span>
                    <div className="min-w-0">
                      <span className="text-body-sm font-semibold text-on-surface">{c.nome}</span>
                      {c.detalhe && <p className="text-body-sm text-on-surface-variant mt-0.5">{c.detalhe}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Campanha concorrente */}
            {eligResult.campanha_concorrente && (
              <div className="rounded-xl border border-[#ffe082] bg-[#fff8e1] p-4">
                <p className="text-label-sm text-[#e65100] font-semibold uppercase tracking-wider mb-2">Campanha concorrente com maior prioridade</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 text-body-md font-bold text-on-surface break-words">{eligResult.campanha_concorrente.titulo}</p>
                  <span className="px-2.5 py-0.5 bg-[#ffe082] text-[#e65100] rounded-full text-label-sm font-bold shrink-0">
                    Prioridade {eligResult.campanha_concorrente.prioridade}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-1">{eligResult.campanha_concorrente.motivo}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
