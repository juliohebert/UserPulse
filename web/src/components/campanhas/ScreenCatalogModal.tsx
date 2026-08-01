import { useState, useEffect, useRef } from 'react'
import type { TelaCatalogo } from '../../types'

interface Props {
  telas: TelaCatalogo[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function identifier(t: TelaCatalogo) {
  return t.url_contem ?? t.tela ?? t.data_cy ?? ''
}

export function ScreenCatalogModal({ telas, onSelect, onClose }: Props) {
  const [busca, setBusca] = useState('')
  const [filtroSistema, setFiltroSistema] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sistemas = [...new Set(telas.map(t => t.sistema).filter(Boolean))].sort()
  const categorias = [...new Set(telas.map(t => t.categoria).filter(Boolean))].sort()

  const q = busca.toLowerCase().trim()
  const filtered = telas.filter(t => {
    if (filtroSistema && t.sistema !== filtroSistema) return false
    if (filtroCategoria && t.categoria !== filtroCategoria) return false
    if (!q) return true
    return (
      t.nome.toLowerCase().includes(q) ||
      t.categoria.toLowerCase().includes(q) ||
      t.sistema.toLowerCase().includes(q) ||
      (t.url_contem ?? '').toLowerCase().includes(q) ||
      (t.tela ?? '').toLowerCase().includes(q) ||
      (t.data_cy ?? '').toLowerCase().includes(q)
    )
  })

  const grupos = [...new Set(filtered.map(t => t.categoria))].sort()

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-3xl bg-surface rounded-2xl shadow-2xl my-8 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[22px]">grid_view</span>
            <div>
              <h2 className="text-title-lg font-bold text-on-surface">Catálogo de Telas</h2>
              <p className="text-label-md text-on-surface-variant">{telas.length} tela(s) disponível(is)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container-low transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-outline-variant/50 bg-surface-container-low/40 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-[18px] pointer-events-none">search</span>
            <input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, módulo, URL, elemento..."
              className="w-full pl-9 pr-9 py-2.5 bg-surface-bright border border-outline-variant rounded-xl text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {sistemas.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-label-sm text-on-surface-variant shrink-0">Sistema:</span>
                <button
                  type="button"
                  onClick={() => setFiltroSistema('')}
                  className={`px-2.5 py-0.5 rounded-full text-label-sm font-medium transition-colors ${!filtroSistema ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  Todos
                </button>
                {sistemas.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFiltroSistema(filtroSistema === s ? '' : s)}
                    className={`px-2.5 py-0.5 rounded-full text-label-sm font-medium transition-colors ${filtroSistema === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {categorias.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-label-sm text-on-surface-variant shrink-0">Categoria:</span>
                <button
                  type="button"
                  onClick={() => setFiltroCategoria('')}
                  className={`px-2.5 py-0.5 rounded-full text-label-sm font-medium transition-colors ${!filtroCategoria ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  Todas
                </button>
                {categorias.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFiltroCategoria(filtroCategoria === c ? '' : c)}
                    className={`px-2.5 py-0.5 rounded-full text-label-sm font-medium transition-colors ${filtroCategoria === c ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] block mb-2 opacity-30">search_off</span>
              <p className="text-body-md">Nenhuma tela encontrada{q ? ` para "${busca}"` : ''}.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grupos.map(cat => (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-outline mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {filtered.filter(t => t.categoria === cat).map(tela => (
                      <div
                        key={tela.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-outline-variant hover:border-primary hover:bg-primary-fixed/20 transition-all group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-label-md font-semibold text-on-surface truncate">{tela.nome}</span>
                            {sistemas.length > 1 && (
                              <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded-full shrink-0">{tela.sistema}</span>
                            )}
                          </div>
                          {identifier(tela) && (
                            <span className="text-[11px] font-mono text-outline block truncate mt-0.5">
                              {identifier(tela)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { onSelect(tela.id); onClose() }}
                          className="shrink-0 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-label-sm font-bold opacity-0 group-hover:opacity-100 transition-all hover:opacity-90 active:scale-95 focus:opacity-100"
                        >
                          Selecionar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-outline-variant/50 bg-surface-container-low/40 flex items-center justify-between">
          <p className="text-label-sm text-outline">
            {filtered.length} de {telas.length} tela(s)
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-outline-variant rounded-xl text-label-sm text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
