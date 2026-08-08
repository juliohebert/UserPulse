import { useEffect, useRef, useState } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { del, get, post, put } from '../../services/api'
import type { TourExportEnvelope, TourGuiado, TourGuiadoListaPaginada } from '../../types'
import { formatDateTime } from '../../utils/campanha'
import { downloadJson } from '../../utils/tour'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { Pagination } from '../../components/ui/Pagination'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConteudo, podeExcluirOuImportarConteudo } from '../../utils/permissions'

const PAGE_SIZE = 10
// Só a busca dispara a cada tecla (status/sistema são clique único, sem
// motivo pra atraso) — debounce simples evita 1 request por caractere digitado.
const BUSCA_DEBOUNCE_MS = 300

type StatusFiltro = 'todos' | 'ativos' | 'inativos'

// Sem nenhum filtro preenchido isso vira uma query string só com page/pageSize
// — a listagem chama a mesma consulta de sempre, preservando o comportamento
// atual quando nenhum filtro é aplicado (mesmo padrão de montarQuery em
// web/src/pages/tours/Dashboard.tsx).
function montarQueryTours(busca: string, sistema: string, status: StatusFiltro, pagina: number): string {
  const params = new URLSearchParams()
  params.set('page', String(pagina))
  params.set('pageSize', String(PAGE_SIZE))
  if (busca.trim()) params.set('busca', busca.trim())
  if (sistema) params.set('sistema', sistema)
  if (status !== 'todos') params.set('status', status)
  return `?${params.toString()}`
}

// Mesmo padrão visual dos KPIs de /campanhas (ícone + número grande + rótulo).
function KpiCard({
  label, icon, iconBg, iconColor, value,
}: {
  label: string
  icon: string
  iconBg: string
  iconColor: string
  value: string | number
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md hover:border-primary/40 transition-all p-5 flex flex-col gap-3">
      <div className="min-w-0 flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
          <span className="material-symbols-outlined text-[19px]">{icon}</span>
        </span>
        <p className="text-label-md font-medium text-on-surface-variant truncate">{label}</p>
      </div>
      <p className="text-headline-md font-bold text-on-surface leading-none">{value}</p>
    </div>
  )
}

export function ToursIndex() {
  const { user } = useAuth()
  // RBAC real (ver server/src/middleware/requireEscritaTenant.ts) — VIEWER
  // só lê; esconder os botões aqui é só UX, o backend já bloqueia 403.
  const podeEscrever = podeEscreverConteudo(user?.role)
  // Excluir (hard delete) e importar tour — mais restrito que criar/editar:
  // só ADMIN/SUPER_ADMIN, EDITOR não (ver comentário em utils/permissions.ts).
  const podeExcluirOuImportar = podeExcluirOuImportarConteudo(user?.role)
  const [data, setData] = useState<TourGuiadoListaPaginada | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filterSistema, setFilterSistema] = useState('')
  const [filterAtivo, setFilterAtivo] = useState<StatusFiltro>('todos')
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)
  const [exportandoId, setExportandoId] = useState<string | null>(null)
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [importarViaGravador, setImportarViaGravador] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const navigate = useNavigate()
  const redirectTimer = useRef<number | null>(null)
  // Ignora o primeiro disparo do efeito de debounce da busca — a carga
  // inicial (mount) já é feita à parte, logo abaixo.
  const primeiraRenderRef = useRef(true)

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

  // page é sempre o pedido explicitamente por quem chama load() — nunca lido
  // de volta de `data` no meio do caminho, pra não haver corrida entre um
  // clique de página e um filtro mudando ao mesmo tempo.
  const load = (buscaAtual: string, sistemaAtual: string, statusAtual: StatusFiltro, pagina: number) => {
    setLoading(true)
    setError(null)
    get<TourGuiadoListaPaginada>(`/tours${montarQueryTours(buscaAtual, sistemaAtual, statusAtual, pagina)}`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load('', '', 'todos', 1) }, [])

  // Debounce só da busca — status/sistema mudam por clique único (sem
  // motivo pra atrasar) e já chamam load() direto nos próprios handlers.
  useEffect(() => {
    if (primeiraRenderRef.current) { primeiraRenderRef.current = false; return }
    const t = window.setTimeout(() => load(busca, filterSistema, filterAtivo, 1), BUSCA_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const sistemas = data?.sistemas ?? []
  const items = data?.items ?? []
  const resumo = data?.resumo ?? { total: 0, ativos: 0, inativos: 0, total_passos: 0 }
  const totalFiltrado = data?.total ?? 0
  const paginaAtual = data?.page ?? 1
  const perPageAtual = data?.per_page ?? PAGE_SIZE

  const clearFilters = () => {
    setBusca('')
    setFilterSistema('')
    setFilterAtivo('todos')
    load('', '', 'todos', 1)
  }
  const hasFilters = Boolean(busca || filterSistema || filterAtivo !== 'todos')

  const mudarSistema = (v: string) => { setFilterSistema(v); load(busca, v, filterAtivo, 1) }
  const mudarStatus = (v: StatusFiltro) => { setFilterAtivo(v); load(busca, filterSistema, v, 1) }
  const mudarPagina = (p: number) => load(busca, filterSistema, filterAtivo, p)

  const STATUS_TABS = [
    { key: 'todos' as const, label: 'Todos', icon: 'apps', count: resumo.total },
    { key: 'ativos' as const, label: 'Ativos', icon: 'play_circle', count: resumo.ativos },
    { key: 'inativos' as const, label: 'Inativos', icon: 'pause_circle', count: resumo.inativos },
  ]

  // Otimista, igual antes — só na página atual (data.items). O resumo/KPIs
  // (contagens da base inteira, vindas do servidor) só ficam 100% em dia de
  // novo na próxima busca/troca de página; aceitável pela mesma razão de não
  // recarregar a lista inteira a cada toggle.
  const toggleAtivo = async (tour: TourGuiado) => {
    setData(prev => prev && {
      ...prev,
      items: prev.items.map(t => (t.id === tour.id ? { ...t, ativo: !t.ativo } : t)),
    })
    try {
      await put(`/tours/${tour.id}`, { ativo: !tour.ativo })
    } catch {
      setData(prev => prev && {
        ...prev,
        items: prev.items.map(t => (t.id === tour.id ? { ...t, ativo: tour.ativo } : t)),
      })
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

  const removerTour = async (tour: TourGuiado) => {
    if (!window.confirm('Remover este item? Esta ação não poderá ser desfeita.')) return
    setRemovendoId(tour.id)
    setMensagem(null)
    try {
      await del(`/tours/${tour.id}`)
      setMensagem({ tipo: 'sucesso', texto: 'Tour removido com sucesso.' })
      // Recarrega a página atual — remover muda o total/paginação (não dá pra
      // só tirar o item da lista local sem também reconferir total/resumo).
      load(busca, filterSistema, filterAtivo, paginaAtual)
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível remover o tour. Tente novamente.' })
    } finally {
      setRemovendoId(null)
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

  // Mesmo padrão de web/src/pages/tours/Dashboard.tsx: spinner de tela cheia
  // só na carga inicial; erro de tela cheia só se ainda não houver dado
  // nenhum pra mostrar. Trocas de página/filtro depois disso mantêm a
  // listagem atual visível (esmaecida) enquanto a próxima página carrega —
  // ver o wrapper com opacity-50 mais abaixo.
  if (loading && !data) return <div className="px-4 lg:px-margin-desktop py-5"><LoadingSpinner /></div>
  if (error && !data) {
    return (
      <div className="px-4 lg:px-margin-desktop py-5">
        <ErrorState message={error} onRetry={() => load(busca, filterSistema, filterAtivo, 1)} />
      </div>
    )
  }
  if (!data) return null

  return (
    <div>
      <section className="px-4 lg:px-margin-desktop py-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface">Tours Guiados</h2>
            <p className="text-body-md text-on-surface-variant mt-0.5">
              {resumo.total === 0
                ? 'Ainda não foram criados tours.'
                : `${resumo.total} ${resumo.total === 1 ? 'tour' : 'tours'} no total`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
            <Button
              variant="ghost"
              onClick={() => navigate('/tours/guia')}
              fullWidthMobile
              iconLeft={<span className="material-symbols-outlined text-[18px]">menu_book</span>}
            >
              Guia de Uso
            </Button>
            {podeExcluirOuImportar && (
              <Button
                variant="ghost"
                onClick={() => { setImportarViaGravador(false); setModalImportarAberto(true) }}
                fullWidthMobile
                iconLeft={<span className="material-symbols-outlined text-[18px]">upload_file</span>}
              >
                Importar JSON
              </Button>
            )}
            {podeEscrever && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/tours/gravador')}
                  fullWidthMobile
                  iconLeft={<span className="material-symbols-outlined text-[18px]">radio_button_checked</span>}
                >
                  Gravar fluxo
                </Button>
                <Button
                  onClick={() => navigate('/tours/novo')}
                  fullWidthMobile
                  iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
                >
                  Novo Tour Guiado
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPIs — sempre os totais da base inteira (resumo, vindo do servidor
            sem filtro nenhum), igual ao comportamento de antes. */}
        {resumo.total > 0 && (
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5 ${loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}`}>
            <KpiCard label="Total de Tours" icon="list_alt" iconBg="bg-primary/10" iconColor="text-primary" value={resumo.total} />
            <KpiCard label="Tours Ativos" icon="play_circle" iconBg="bg-tertiary/10" iconColor="text-tertiary" value={resumo.ativos} />
            <KpiCard label="Tours Inativos" icon="pause_circle" iconBg="bg-outline-variant/40" iconColor="text-on-surface-variant" value={resumo.inativos} />
            <KpiCard label="Total de Passos" icon="route" iconBg="bg-secondary/10" iconColor="text-secondary" value={resumo.total_passos.toLocaleString('pt-BR')} />
          </div>
        )}

        {mensagem && (
          <div className={`mb-4 p-3 rounded-xl text-body-md flex items-center gap-2 ${
            mensagem.tipo === 'sucesso' ? 'bg-tertiary/10 text-tertiary' : 'bg-error-container text-on-error-container'
          }`}>
            <span className="material-symbols-outlined text-[18px]">{mensagem.tipo === 'sucesso' ? 'check_circle' : 'error'}</span>
            {mensagem.texto}
          </div>
        )}

        {/* Filters */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant mb-5 shadow-sm space-y-2.5">
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px] pointer-events-none">search</span>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar tour por título ou sistema..."
              className="w-full h-11 pl-9 pr-3 bg-surface-bright border border-outline-variant rounded-xl text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Status tabs + sistema + limpar filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 p-1 bg-surface-container rounded-xl w-full sm:w-fit">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => mudarStatus(tab.key)}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-label-md font-bold transition-all ${
                    filterAtivo === tab.key
                      ? 'bg-surface-bright text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${
                    filterAtivo === tab.key
                      ? tab.key === 'ativos' ? 'text-tertiary' : tab.key === 'inativos' ? 'text-outline' : 'text-primary'
                      : ''
                  }`}>
                    {tab.icon}
                  </span>
                  {tab.label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    filterAtivo === tab.key ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="w-full sm:w-56">
              <Select
                value={filterSistema}
                onChange={mudarSistema}
                placeholder="Todos os sistemas"
                options={[
                  { value: '', label: 'Todos os sistemas' },
                  ...sistemas.map(s => ({ value: s, label: s })),
                ]}
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 sm:ml-auto text-label-md text-on-surface-variant hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/30">
            <h3 className="text-title-lg font-bold text-on-surface">Tours</h3>
            <p className="text-label-md text-on-surface-variant mt-0.5">
              {`Mostrando ${totalFiltrado} ${totalFiltrado === 1 ? 'tour' : 'tours'} conforme os filtros aplicados`}
            </p>
          </div>

          {error && (
            <p className="px-5 py-3 text-label-md text-error flex items-center gap-1.5 border-b border-outline-variant/30">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </p>
          )}

          <div className={loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'}>
          {items.length === 0 ? (
            <EmptyState
              icon="map"
              title={resumo.total === 0 ? 'Nenhum tour guiado criado ainda' : 'Nenhum tour encontrado'}
              description={resumo.total === 0 ? 'Crie o primeiro tour para guiar seus usuários pela aplicação.' : 'Ajuste os filtros para ver outros tours.'}
              action={
                resumo.total === 0 && podeEscrever ? (
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
                    <tr className="border-b border-outline-variant/40 text-left">
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant">Título</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Sistema</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Status</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Passos</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant whitespace-nowrap">Atualizado em</th>
                      <th className="px-5 py-3 text-label-md font-semibold text-on-surface-variant text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(tour => (
                      <tr key={tour.id} className="group border-b border-outline-variant/20 last:border-0 hover:bg-surface-container-low/60 transition-colors">
                        <td className="px-5 py-3.5 align-middle">
                          {podeEscrever ? (
                            <button
                              onClick={() => navigate(`/tours/${tour.id}/editar`)}
                              className="text-body-md font-semibold text-on-surface hover:text-primary transition-colors text-left"
                            >
                              {tour.titulo}
                            </button>
                          ) : (
                            <span className="text-body-md font-semibold text-on-surface">{tour.titulo}</span>
                          )}
                          {tour.descricao && (
                            <p className="text-label-sm text-on-surface-variant truncate max-w-xs">{tour.descricao}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-middle text-body-md text-on-surface-variant whitespace-nowrap">{tour.sistema}</td>
                        <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            {podeEscrever && <ToggleSwitch checked={tour.ativo} onChange={() => toggleAtivo(tour)} />}
                            <StatusBadge ativo={tour.ativo} />
                          </div>
                        </td>
                        <td className="px-5 py-3.5 align-middle text-body-md text-on-surface-variant whitespace-nowrap">
                          {tour._count?.passos ?? tour.passos?.length ?? 0} passo(s)
                        </td>
                        <td className="px-5 py-3.5 align-middle text-body-md text-on-surface-variant whitespace-nowrap">{formatDateTime(tour.atualizado_em)}</td>
                        <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end opacity-70 group-hover:opacity-100 transition-opacity">
                            <TourActions
                              tour={tour}
                              navigate={navigate}
                              duplicandoId={duplicandoId}
                              onDuplicar={duplicarTour}
                              exportandoId={exportandoId}
                              onExportar={exportarTour}
                              removendoId={removendoId}
                              onRemover={removerTour}
                              podeEscrever={podeEscrever}
                              podeExcluir={podeExcluirOuImportar}
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
                {items.map(tour => (
                  <div key={tour.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      {podeEscrever ? (
                        <button
                          onClick={() => navigate(`/tours/${tour.id}/editar`)}
                          className="text-body-md font-semibold text-on-surface hover:text-primary transition-colors text-left min-w-0 truncate"
                        >
                          {tour.titulo}
                        </button>
                      ) : (
                        <span className="text-body-md font-semibold text-on-surface min-w-0 truncate">{tour.titulo}</span>
                      )}
                    </div>
                    {tour.descricao && (
                      <p className="text-label-sm text-on-surface-variant truncate mb-2">{tour.descricao}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={tour.ativo} onChange={() => toggleAtivo(tour)} />
                        <StatusBadge ativo={tour.ativo} />
                      </div>
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
                          removendoId={removendoId}
                          onRemover={removerTour}
                          podeEscrever={podeEscrever}
                          podeExcluir={podeExcluirOuImportar}
                          size="lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={paginaAtual} total={totalFiltrado} perPage={perPageAtual} onChange={mudarPagina} />
            </>
          )}
          </div>
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

// Ponto + texto em vez de pill preenchida — mesmo padrão leve usado em
// /campanhas, pra não competir visualmente com o ToggleSwitch ao lado.
function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${
      ativo ? 'text-tertiary' : 'text-outline'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ativo ? 'bg-tertiary' : 'bg-outline'}`} />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function TourActions({
  tour, navigate, duplicandoId, onDuplicar, exportandoId, onExportar, removendoId, onRemover, podeEscrever, podeExcluir, size = 'md',
}: {
  tour: TourGuiado
  navigate: NavigateFunction
  duplicandoId: string | null
  onDuplicar: (tour: TourGuiado) => void
  exportandoId: string | null
  onExportar: (tour: TourGuiado) => void
  removendoId: string | null
  onRemover: (tour: TourGuiado) => void
  podeEscrever: boolean
  podeExcluir: boolean
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
      {podeEscrever && (
        <button onClick={() => navigate(`/tours/${tour.id}/editar`)} title="Editar" className={btnCls}>
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      )}
      {podeEscrever && (
        <button onClick={() => onDuplicar(tour)} disabled={duplicandoId === tour.id} title="Duplicar" className={`${btnCls} disabled:opacity-40`}>
          <span className={`material-symbols-outlined text-[18px] ${duplicandoId === tour.id ? 'animate-spin' : ''}`}>
            {duplicandoId === tour.id ? 'progress_activity' : 'content_copy'}
          </span>
        </button>
      )}
      <button onClick={() => onExportar(tour)} disabled={exportandoId === tour.id} title="Exportar JSON" className={`${btnCls} disabled:opacity-40`}>
        <span className={`material-symbols-outlined text-[18px] ${exportandoId === tour.id ? 'animate-spin' : ''}`}>
          {exportandoId === tour.id ? 'progress_activity' : 'download'}
        </span>
      </button>
      {podeExcluir && (
        <button
          onClick={() => onRemover(tour)}
          disabled={removendoId === tour.id}
          title="Remover"
          className={`${btnPad} rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-40`}
        >
          <span className={`material-symbols-outlined text-[18px] ${removendoId === tour.id ? 'animate-spin' : ''}`}>
            {removendoId === tour.id ? 'progress_activity' : 'delete'}
          </span>
        </button>
      )}
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
