import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get } from '../../services/api'
import type { TourExportEnvelope, TourGuiado } from '../../types'
import { LoadingSpinner, ErrorState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { comandoIniciarTour, comandoTestarSeletor, downloadJson, testEmbedUrl } from '../../utils/tour'

const card = 'w-full bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden mb-5'
const codeChip = 'bg-surface-container px-1 py-0.5 rounded text-[12px] font-mono'

export function TourPreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tour, setTour] = useState<TourGuiado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const load = () => {
    if (!id) return
    setLoading(true)
    setError(null)
    get<TourGuiado>(`/tours/${id}`)
      .then(setTour)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  if (loading) return <div className="w-full px-4 lg:px-margin-desktop py-5 max-w-[1400px]"><LoadingSpinner /></div>
  if (error || !tour) {
    return (
      <div className="w-full px-4 lg:px-margin-desktop py-5 max-w-[1400px]">
        <ErrorState message={error ?? 'Tour guiado não encontrado.'} onRetry={load} />
      </div>
    )
  }

  const comando = comandoIniciarTour(tour)
  const embedUrl = testEmbedUrl(tour)

  const copiarComando = () => {
    navigator.clipboard.writeText(comando).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const exportarJson = async () => {
    setExportando(true)
    setExportError(null)
    try {
      const envelope = await get<TourExportEnvelope>(`/tours/${tour.id}/exportar`)
      downloadJson(`${tour.slug}.json`, envelope)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Não foi possível exportar o tour.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <section className="w-full px-4 lg:px-margin-desktop py-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">{tour.titulo}</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            O teste acontece no ambiente embed (host real ou test-embed.html) — nenhum evento é registrado a partir desta página.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            onClick={exportarJson}
            disabled={exportando}
            variant="ghost"
            iconLeft={(
              <span className={`material-symbols-outlined text-[18px] ${exportando ? 'animate-spin' : ''}`}>
                {exportando ? 'progress_activity' : 'download'}
              </span>
            )}
          >
            Exportar JSON
          </Button>
          <Button
            type="button"
            onClick={() => navigate(`/tours/${tour.id}/editar`)}
          >
            Editar
          </Button>
        </div>
      </div>

      {exportError && (
        <div className="mb-5 p-3 bg-error-container text-on-error-container rounded-xl text-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {exportError}
        </div>
      )}

      {!tour.ativo && (
        <div className="mb-5 p-3 bg-[#fff8e1] border border-[#ffe082] text-[#e65100] rounded-xl text-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">warning</span>
          Este tour está inativo — a autoabertura não dispara, mas <code className={codeChip}>iniciarTour</code> manual continua funcionando para teste.
        </div>
      )}

      {/* Slug + comando de teste */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-outline-variant/30">
          <h3 className="text-title-lg font-bold text-on-surface">Slug do tour</h3>
          <p className="text-label-md text-outline mt-0.5">Identificador usado para iniciar o tour manualmente no widget.</p>
        </div>
        <div className="px-5 py-4">
          <code className="inline-block px-3 py-2 bg-surface-container rounded-lg text-body-md font-mono text-on-surface">{tour.slug}</code>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-outline-variant/30">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant">terminal</span>
            <h3 className="text-title-lg font-bold text-on-surface">Comando de teste</h3>
          </div>
          <button
            onClick={copiarComando}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-label-md font-bold transition-all ${
              copied ? 'bg-tertiary/10 text-tertiary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copiado!' : 'Copiar comando'}
          </button>
        </div>
        <div className="bg-inverse-surface p-5 overflow-x-auto">
          <pre className="text-inverse-on-surface font-mono text-[13px] leading-relaxed whitespace-pre">{comando}</pre>
        </div>
        <p className="px-5 py-3 text-label-md text-outline border-t border-outline-variant/30">
          Cole no console do navegador (com o widget já carregado) ou chame a partir de um botão do sistema hospedeiro.
          Funciona mesmo se o tour já tiver sido concluído ou pulado pelo usuário.
        </p>
      </div>

      {/* Validação dos passos */}
      <ValidacaoPassosCard tour={tour} />

      {/* Como testar */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant">checklist</span>
          <h3 className="text-title-lg font-bold text-on-surface">Como testar</h3>
        </div>
        <ol className="px-5 py-4 space-y-2.5 text-body-md text-on-surface-variant list-decimal list-inside">
          <li>Rode <code className={codeChip}>npm start</code> na raiz do projeto (servidor da API em :3333).</li>
          <li>
            Abra <code className={codeChip}>test-embed.html</code> com <code className={codeChip}>?local=1</code> na URL para
            apontar para o widget local, ou clique em "Abrir test-embed" abaixo.
          </li>
          <li>Rode o comando de teste acima no console do navegador para iniciar o tour manualmente.</li>
          <li>
            Se o modo de identificação do tour (Tela informada pelo sistema, data-cy ou URL contém) corresponder à página e o
            tour estiver ativo, ele também pode autoabrir ao carregar.
          </li>
        </ol>
        <div className="px-5 py-4 border-t border-outline-variant/30">
          <a
            href={embedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            Abrir test-embed
          </a>
          <p className="text-label-sm text-outline mt-2 break-all">{embedUrl}</p>
        </div>
      </div>
    </section>
  )
}

// O elemento real só existe na aplicação integrada, não no admin — por isso
// esta seção só confere se sistema/tipo/seletor foram preenchidos, sem
// tentar localizar nada no DOM local.
function ValidacaoPassosCard({ tour }: { tour: TourGuiado }) {
  const [copiadoIndex, setCopiadoIndex] = useState<number | null>(null)
  const passos = tour.passos ?? []

  const copiarComandoPasso = (index: number, seletorTipo: string, seletor: string) => {
    navigator.clipboard.writeText(comandoTestarSeletor(seletorTipo, seletor)).catch(() => {})
    setCopiadoIndex(index)
    setTimeout(() => setCopiadoIndex(prev => (prev === index ? null : prev)), 2000)
  }

  return (
    <div className={card}>
      <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center gap-3">
        <span className="material-symbols-outlined text-on-surface-variant">fact_check</span>
        <div>
          <h3 className="text-title-lg font-bold text-on-surface">Validação dos passos</h3>
          <p className="text-label-md text-outline mt-0.5">
            Confere se os seletores foram preenchidos — o elemento em si só existe na aplicação integrada, não é validado aqui.
          </p>
        </div>
      </div>

      {passos.length === 0 ? (
        <p className="px-5 py-4 text-body-md text-on-surface-variant">Este tour ainda não tem passos cadastrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['#', 'Título', 'Tipo', 'Seletor', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-label-md text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {passos.map((p, i) => {
                const preenchido = Boolean(p.seletor.trim())
                return (
                  <tr key={p.id ?? i} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="px-4 py-3 align-top whitespace-nowrap text-[13px] text-on-surface-variant">{i + 1}</td>
                    <td className="px-4 py-3 align-top max-w-[220px]">
                      <span className="text-[13px] text-on-surface truncate block" title={p.titulo}>{p.titulo}</span>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="text-[13px] text-on-surface-variant font-mono">{p.seletor_tipo}</span>
                      {p.seletor_tipo === 'css' && (
                        <span className="flex items-center gap-1 text-[11px] text-[#e65100] mt-1">
                          <span className="material-symbols-outlined text-[13px]">warning</span>
                          Prefira data-cy
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top max-w-[200px]">
                      {preenchido ? (
                        <span className="text-[13px] font-mono text-on-surface truncate block" title={p.seletor}>{p.seletor}</span>
                      ) : (
                        <span className="text-[13px] text-outline italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        preenchido ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'
                      }`}>
                        <span className="material-symbols-outlined text-[12px]">{preenchido ? 'check_circle' : 'error'}</span>
                        {preenchido ? 'Preenchido' : 'Vazio'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <button
                        type="button"
                        disabled={!preenchido}
                        onClick={() => copiarComandoPasso(i, p.seletor_tipo, p.seletor)}
                        title="Copiar comando de teste"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant text-[12px] font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[14px]">{copiadoIndex === i ? 'check' : 'content_copy'}</span>
                        {copiadoIndex === i ? 'Copiado!' : 'Copiar comando'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
