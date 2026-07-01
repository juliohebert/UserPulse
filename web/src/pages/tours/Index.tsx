import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, post, put } from '../../services/api'
import type { TourGuiado } from '../../types'
import { formatDateTime } from '../../utils/campanha'
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
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const navigate = useNavigate()
  const redirectTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (redirectTimer.current) window.clearTimeout(redirectTimer.current)
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

  return (
    <div>
      {/* Page action bar */}
      <div className="bg-surface border-b border-outline-variant px-4 lg:px-margin-desktop py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface leading-tight">Tours guiados</h2>
            <p className="text-label-md text-on-surface-variant mt-0.5">
              Crie passo a passos interativos para guiar usuários dentro da aplicação.
            </p>
          </div>
          <button
            onClick={() => navigate('/tours/novo')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-label-md font-bold shadow-md hover:opacity-90 transition-all active:scale-95 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Novo tour guiado
          </button>
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px] pointer-events-none">search</span>
            <input
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1) }}
              placeholder="Buscar tour por título ou sistema..."
              className="w-full pl-9 pr-3 py-2.5 bg-surface-bright border border-outline-variant rounded-xl text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
          <div className="flex gap-1 p-1 bg-surface-container rounded-xl w-fit">
            {([
              { value: 'todos', label: 'Todos' },
              { value: 'ativos', label: 'Ativos' },
              { value: 'inativos', label: 'Inativos' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => { setFilterAtivo(opt.value); setPage(1) }}
                className={`px-3.5 py-2 rounded-lg text-label-md font-bold transition-all ${
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
                    Novo tour guiado
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low/50 text-left">
                    <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant">Título</th>
                    <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant">Sistema</th>
                    <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant">Status</th>
                    <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant">Passos</th>
                    <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant">Atualizado em</th>
                    <th className="px-5 py-3 text-label-md font-bold text-on-surface-variant text-right">Ações</th>
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
                      <td className="px-5 py-3.5 text-body-md text-on-surface-variant">{tour.sistema}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${
                          tour.ativo ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'
                        }`}>
                          {tour.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-body-md text-on-surface-variant">
                        {tour._count?.passos ?? tour.passos?.length ?? 0} passo(s)
                      </td>
                      <td className="px-5 py-3.5 text-body-md text-on-surface-variant">{formatDateTime(tour.atualizado_em)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-3">
                          <ToggleSwitch checked={tour.ativo} onChange={() => toggleAtivo(tour)} />
                          <button
                            onClick={() => navigate(`/tours/${tour.id}/dashboard`)}
                            title="Dashboard"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">monitoring</span>
                          </button>
                          <button
                            onClick={() => navigate(`/tours/${tour.id}/preview`)}
                            title="Testar tour"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">play_circle</span>
                          </button>
                          <button
                            onClick={() => navigate(`/tours/${tour.id}/editar`)}
                            title="Editar"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            onClick={() => duplicarTour(tour)}
                            disabled={duplicandoId === tour.id}
                            title="Duplicar"
                            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40"
                          >
                            <span className={`material-symbols-outlined text-[18px] ${duplicandoId === tour.id ? 'animate-spin' : ''}`}>
                              {duplicandoId === tour.id ? 'progress_activity' : 'content_copy'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}
