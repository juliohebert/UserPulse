import { useEffect, useRef, useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { TourExportEnvelope, TourGuiado } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { downloadJson } from '../../utils/tour'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'

const PER_PAGE = 10

export function ToursIndex() {
  const [tours, setTours] = useState<TourGuiado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [busca, setBusca] = useState('')
  const [filterSistema, setFilterSistema] = useState('')
  const [filterAtivo, setFilterAtivo] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)
  const [exportandoId, setExportandoId] = useState<string | null>(null)
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [importarViaGravador, setImportarViaGravador] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const navigate = useNavigate()
  const redirectTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (redirectTimer.current) window.clearTimeout(redirectTimer.current)
  }, [])

  // Vindo do Gravador de Fluxo ("Copiar e abrir importação" no widget): o JSON
  // já foi copiado pra área de transferência lá — aqui só abre o modal
  // sozinho, pra o usuário colar. O parâmetro nunca carrega o JSON em si (só
  // um sinal de "abra o modal"), e é removido da URL logo em seguida via
  // replaceState pra não reabrir o modal num refresh ou ao voltar a página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('importarJson') !== '1') return
    setModalImportarAberto(true)
    setImportarViaGravador(true)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const load = () => {
    setLoading(true)
    setError(null)
    get<TourGuiado[]>('/tours')
      .then(setTours)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const sistemas = [...new Set(tours.map(t => t.sistema).filter(Boolean))]

  const q = busca.trim().toLowerCase()
  const filtered = tours.filter(t => {
    if (filterAtivo === 'ativos' && !t.ativo) return false
    if (filterAtivo === 'inativos' && t.ativo) return false
    if (filterSistema && t.sistema !== filterSistema) return false
    if (q && !`${t.titulo} ${t.sistema} ${t.slug}`.toLowerCase().includes(q)) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const toggleAtivo = async (tour: TourGuiado) => {
    setTours(prev => prev.map(t => (t.id === tour.id ? { ...t, ativo: !t.ativo } : t)))
    try {
      await put(`/tours/${tour.id}`, { ativo: !tour.ativo })
    } catch {
      setTours(prev => prev.map(t => (t.id === tour.id ? { ...t, ativo: tour.ativo } : t)))
    }
  }

  const duplicarTour = async (tour: TourGuiado) => {
    setDuplicandoId(tour.id)
    setMensagem(null)
    try {
      const copia = await post<TourGuiado>(`/tours/${tour.id}/duplicar`, {})
      setMensagem({ tipo: 'sucesso', texto: `Tour duplicado com sucesso: "${copia.titulo}".` })
      // Mostra o feedback antes de sair da listagem, para não perdê-lo no redirecionamento.
      redirectTimer.current = window.setTimeout(() => navigate(`/tours/${copia.id}/editar`), 900)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível duplicar o tour. Tente novamente.' })
    } finally {
      setDuplicandoId(null)
    }
  }

  const exportarTour = async (tour: TourGuiado) => {
    setExportandoId(tour.id)
    setMensagem(null)
    try {
      const envelope = await get<TourExportEnvelope>(`/tours/${tour.id}/exportar`)
      downloadJson(`${tour.slug}.json`, envelope)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível exportar o tour. Tente novamente.' })
    } finally {
      setExportandoId(null)
    }
  }

  const tourImportado = (tour: TourGuiado) => {
    setModalImportarAberto(false)
    setImportarViaGravador(false)
    setMensagem({ tipo: 'sucesso', texto: 'Tour importado como rascunho.' })
    // Mostra o feedback antes de sair da listagem, para não perdê-lo no redirecionamento.
    redirectTimer.current = window.setTimeout(() => navigate(`/tours/${tour.id}/editar`), 900)
  }

  return (
    <div>
      {/* Page action bar */}
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface leading-tight">Tours Guiados</h2>
            <p className="text-label-md text-on-surface-variant mt-0.5">
              Crie passo a passos interativos para guiar usuários dentro da aplicação.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={() => navigate('/tours/guia')}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl text-label-md font-bold hover:bg-surface-container-low transition-all w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span>
              Guia de Uso
            </button>
            <button
              onClick={() => { setImportarViaGravador(false); setModalImportarAberto(true) }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl text-label-md font-bold hover:bg-surface-container-low transition-all w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Importar JSON
            </button>
            <button
              onClick={() => navigate('/tours/gravador')}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl text-label-md font-bold hover:bg-surface-container-low transition-all w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-[18px]">radio_button_checked</span>
              Gravar fluxo
            </button>
            <button
              onClick={() => navigate('/tours/novo')}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Novo Tour Guiado
            </button>
          </div>
        </div>
      </div>

      <section className="px-4 lg:px-margin-desktop py-5">
        {mensagem && (
          <div className={`mb-4 p-3 rounded-xl text-body-md flex items-center gap-2 ${
            mensagem.tipo === 'sucesso' ? 'bg-tertiary/10 text-tertiary' : 'bg-error-container text-on-error-container'
          }`}>
            <span className="material-symbols-outlined text-[18px]">{mensagem.tipo === 'sucesso' ? 'check_circle' : 'error'}</span>
            {mensagem.texto}
          </div>
        )}

        {/* Filters — busca, select e segmentado compartilham a mesma altura (h-11,
            igual ao componente Select) para ficarem alinhados na mesma linha. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px] pointer-events-none">search</span>
            <input
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1) }}
              placeholder="Buscar tour por título ou sistema..."
              className="w-full h-11 pl-9 pr-3 bg-surface-bright border border-outline-variant rounded-xl text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              value={filterSistema}
              onChange={v => { setFilterSistema(v); setPage(1) }}
              placeholder="Todos os sistemas"
              options={[
                { value: '', label: 'Todos os sistemas' },
                ...sistemas.map(s => ({ value: s, label: s })),
              ]}
            />
          </div>
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 p-1 h-11 bg-surface-container rounded-xl w-full sm:w-fit">
            {([
              { value: 'todos', label: 'Todos' },
              { value: 'ativos', label: 'Ativos' },
              { value: 'inativos', label: 'Inativos' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => { setFilterAtivo(opt.value); setPage(1) }}
                className={`h-full px-3.5 rounded-lg text-label-md font-bold flex items-center justify-center transition-all ${
                  filterAtivo === opt.value ? 'bg-surface-bright text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="map"
              title={tours.length === 0 ? 'Nenhum tour guiado criado ainda' : 'Nenhum tour encontrado'}
              description={tours.length === 0 ? 'Crie o primeiro tour para guiar seus usuários pela aplicação.' : 'Ajuste os filtros para ver outros tours.'}
              action={
                tours.length === 0 ? (
                  <button
                    onClick={() => navigate('/tours/novo')}
                    className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-md"
                  >
                    Novo Tour Guiado
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop (>= xl): tabela. Com a sidebar aberta (248px), lg (1024px) só
                  sobra ~776px de conteúdo — estreito demais para 6 colunas + ações,
                  cortando a coluna de Ações. xl (1280px) garante ~1032px de conteúdo,
                  e overflow-x-auto é a rede de segurança para telas ainda mais
                  apertadas (não deixa as ações serem cortadas, rola em vez disso). */}
              <div className="overflow-x-auto hidden xl:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-low/50 text-left">
                      <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant">Título</th>
                      <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant whitespace-nowrap">Sistema</th>
                      <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant whitespace-nowrap">Status</th>
                      <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant whitespace-nowrap">Passos</th>
                      <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant whitespace-nowrap">Atualizado em</th>
                      <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(tour => (
                      <tr key={tour.id} className="border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-low/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => navigate(`/tours/${tour.id}/editar`)}
                            className="text-body-md font-semibold text-on-surface hover:text-primary transition-colors text-left"
                          >
                            {tour.titulo}
                          </button>
                          {tour.descricao && (
                            <p className="text-label-sm text-on-surface-variant truncate max-w-xs">{tour.descricao}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-body-md text-on-surface-variant whitespace-nowrap">{tour.sistema}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <StatusBadge ativo={tour.ativo} />
                        </td>
                        <td className="px-5 py-3.5 text-body-md text-on-surface-variant whitespace-nowrap">
                          {tour._count?.passos ?? tour.passos?.length ?? 0} passo(s)
                        </td>
                        <td className="px-5 py-3.5 text-body-md text-on-surface-variant whitespace-nowrap">{formatDateTime(tour.atualizado_em)}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <ToggleSwitch checked={tour.ativo} onChange={() => toggleAtivo(tour)} />
                            <TourActions
                              tour={tour}
                              navigate={navigate}
                              duplicandoId={duplicandoId}
                              onDuplicar={duplicarTour}
                              exportandoId={exportandoId}
                              onExportar={exportarTour}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Abaixo de xl (mobile, tablet e telas menores com sidebar aberta): cards */}
              <div className="xl:hidden divide-y divide-outline-variant/50">
                {paginated.map(tour => (
                  <div key={tour.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <button
                        onClick={() => navigate(`/tours/${tour.id}/editar`)}
                        className="text-body-md font-semibold text-on-surface hover:text-primary transition-colors text-left min-w-0 truncate"
                      >
                        {tour.titulo}
                      </button>
                      <ToggleSwitch checked={tour.ativo} onChange={() => toggleAtivo(tour)} />
                    </div>
                    {tour.descricao && (
                      <p className="text-label-sm text-on-surface-variant truncate mb-2">{tour.descricao}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <StatusBadge ativo={tour.ativo} />
                      <span className="text-label-sm text-on-surface-variant">{tour.sistema}</span>
                      <span className="text-label-sm text-on-surface-variant">
                        · {tour._count?.passos ?? tour.passos?.length ?? 0} passo(s)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-sm text-outline">Atualizado {formatDateTime(tour.atualizado_em)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <TourActions
                          tour={tour}
                          navigate={navigate}
                          duplicandoId={duplicandoId}
                          onDuplicar={duplicarTour}
                          exportandoId={exportandoId}
                          onExportar={exportarTour}
                          size="lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
        </div>
      </section>

      {modalImportarAberto && (
        <ImportarTourModal
          onClose={() => { setModalImportarAberto(false); setImportarViaGravador(false) }}
          onImported={tourImportado}
          avisoColar={importarViaGravador}
        />
      )}
    </div>
  )
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase whitespace-nowrap ${
      ativo ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'
    }`}>
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function TourActions({ tour, navigate, duplicandoId, onDuplicar, exportandoId, onExportar, size = 'md' }: {
  tour: TourGuiado
  navigate: NavigateFunction
  duplicandoId: string | null
  onDuplicar: (tour: TourGuiado) => void
  exportandoId: string | null
  onExportar: (tour: TourGuiado) => void
  size?: 'md' | 'lg'
}) {
  const btnPad = size === 'lg' ? 'p-2' : 'p-1.5'
  const btnCls = `${btnPad} rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors`
  return (
    <>
      <button onClick={() => navigate(`/tours/${tour.id}/dashboard`)} title="Dashboard" className={btnCls}>
        <span className="material-symbols-outlined text-[18px]">monitoring</span>
      </button>
      <button onClick={() => navigate(`/tours/${tour.id}/preview`)} title="Testar tour" className={btnCls}>
        <span className="material-symbols-outlined text-[18px]">play_circle</span>
      </button>
      <button onClick={() => navigate(`/tours/${tour.id}/editar`)} title="Editar" className={btnCls}>
        <span className="material-symbols-outlined text-[18px]">edit</span>
      </button>
      <button onClick={() => onDuplicar(tour)} disabled={duplicandoId === tour.id} title="Duplicar" className={`${btnCls} disabled:opacity-40`}>
        <span className={`material-symbols-outlined text-[18px] ${duplicandoId === tour.id ? 'animate-spin' : ''}`}>
          {duplicandoId === tour.id ? 'progress_activity' : 'content_copy'}
        </span>
      </button>
      <button onClick={() => onExportar(tour)} disabled={exportandoId === tour.id} title="Exportar JSON" className={`${btnCls} disabled:opacity-40`}>
        <span className={`material-symbols-outlined text-[18px] ${exportandoId === tour.id ? 'animate-spin' : ''}`}>
          {exportandoId === tour.id ? 'progress_activity' : 'download'}
        </span>
      </button>
    </>
  )
}

function ImportarTourModal({ onClose, onImported, avisoColar = false }: {
  onClose: () => void
  onImported: (tour: TourGuiado) => void
  // true quando aberto via /tours?importarJson=1 (botão "Copiar e abrir
  // importação" do Gravador de Fluxo) — o JSON já foi copiado lá, então só
  // orienta o usuário a colar e foca o campo de texto pra facilitar.
  avisoColar?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [colarAviso, setColarAviso] = useState<string | null>(null)
  const [colarStatus, setColarStatus] = useState<'idle' | 'colado'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const colarTimer = useRef<number | null>(null)

  useEffect(() => {
    if (avisoColar) textareaRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    if (colarTimer.current) window.clearTimeout(colarTimer.current)
  }, [])

  // "Colar JSON": só lê a área de transferência e preenche o textarea — nunca
  // importa sozinho (o botão "Importar" continua exigindo clique manual, com
  // a mesma validação de sempre). Nada é salvo em localStorage/sessionStorage
  // nem enviado a lugar nenhum além do próprio campo de texto local.
  const colarJson = async () => {
    setColarAviso(null)
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setColarAviso('Não foi possível acessar a área de transferência. Use Ctrl+V para colar manualmente.')
      return
    }
    try {
      const conteudo = await navigator.clipboard.readText()
      if (!conteudo.trim()) {
        setColarAviso('A área de transferência está vazia.')
        return
      }
      setTexto(conteudo)
      setErro(null)
      textareaRef.current?.focus()
      setColarStatus('colado')
      if (colarTimer.current) window.clearTimeout(colarTimer.current)
      colarTimer.current = window.setTimeout(() => setColarStatus('idle'), 1600)
    } catch {
      setColarAviso('Não foi possível acessar a área de transferência. Use Ctrl+V para colar manualmente.')
    }
  }

  // Validação básica no cliente antes de gastar uma chamada de API — o
  // backend revalida tudo de novo (mesma validarPassos usada em criar/editar).
  const validarFormatoBasico = (json: unknown): string | null => {
    if (!json || typeof json !== 'object') return 'JSON inválido.'
    const obj = json as Record<string, unknown>
    const tour = (obj.tour && typeof obj.tour === 'object') ? (obj.tour as Record<string, unknown>) : obj
    if (!tour.titulo || typeof tour.titulo !== 'string') return 'Campo "titulo" ausente ou inválido.'
    if (!tour.sistema || typeof tour.sistema !== 'string') return 'Campo "sistema" ausente ou inválido.'
    if (!Array.isArray(tour.passos) || tour.passos.length === 0) return 'O tour precisa ter ao menos um passo em "passos".'
    return null
  }

  const importar = async () => {
    setErro(null)
    let json: unknown
    try {
      json = JSON.parse(texto)
    } catch {
      setErro('JSON malformado. Confira se colou o conteúdo completo.')
      return
    }
    const erroFormato = validarFormatoBasico(json)
    if (erroFormato) {
      setErro(erroFormato)
      return
    }
    setEnviando(true)
    try {
      const tour = await post<TourGuiado>('/tours/importar', json)
      onImported(tour)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível importar o tour. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30 shrink-0">
          <h3 className="text-title-lg font-bold text-on-surface">Importar tour (JSON)</h3>
          <button onClick={onClose} className="p-1 text-outline hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {avisoColar && (
            <div className="p-2.5 bg-tertiary/10 text-tertiary rounded-lg text-label-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">content_paste</span>
                JSON copiado. Cole o conteúdo abaixo para importar o tour gravado.
              </span>
              <button
                type="button"
                onClick={colarJson}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-surface-bright border border-tertiary/30 text-tertiary rounded-lg text-label-sm font-bold hover:bg-tertiary/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">{colarStatus === 'colado' ? 'check' : 'content_paste_go'}</span>
                {colarStatus === 'colado' ? 'Colado!' : 'Colar JSON'}
              </button>
            </div>
          )}
          {colarAviso && (
            <div className="p-2.5 bg-surface-container-low text-on-surface-variant rounded-lg text-label-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">info</span>
              {colarAviso}
            </div>
          )}
          <p className="text-label-md text-on-surface-variant">
            Cole o JSON exportado de outro tour. O tour será criado como rascunho — id, slug e status de ativação do
            JSON são ignorados.
          </p>
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={10}
            placeholder={'{\n  "formato": "userpulse.tour.v1",\n  "tour": { "titulo": "...", "sistema": "...", "passos": [...] }\n}'}
            className="w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          {erro && (
            <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {erro}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-outline-variant rounded-xl text-label-md text-on-surface-variant hover:bg-surface-container-low transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={importar}
            disabled={!texto.trim() || enviando}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-50"
          >
            {enviando ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  )
}
