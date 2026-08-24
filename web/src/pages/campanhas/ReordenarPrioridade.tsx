import { useEffect, useState } from 'react'
import { post } from '../../services/api'
import type { Campanha } from '../../types'
import { rotuloGrupoConcorrente, type GrupoConcorrente } from './grupoConcorrente'

// Substitui a digitação manual de um número de prioridade (campo removido de
// campanhas2/Index.tsx) por ordenação visual: mesmo padrão de "mover
// para cima/baixo" já usado em passos de Tour (ver movePasso em
// pages/tours/Form.tsx) — sem drag-and-drop nativo, que é pouco acessível e
// não funciona bem em touch. A ordem final vira `prioridade` só no backend
// (ver reordenar()/calcularPrioridadesReordenadas em
// server/src/controllers/campanhas.ts): primeiro da lista = maior
// prioridade, sempre reindexado por posição, nunca um número digitado.
//
// Prioridade só importa comparada dentro do mesmo "grupo concorrente" (ver
// chaveGrupoConcorrente/testarElegibilidade) — por isso este modal sempre
// reordena UM grupo por vez, nunca o tenant inteiro. `grupos` já vem
// filtrado (só grupos com 2+ campanhas, ver agruparCampanhasConcorrentes em
// Index.tsx); com 1 único grupo pula direto pro reorder, com mais de um
// mostra a escolha antes.
function ordenarPorPrioridadeAtual(lista: Campanha[]): Campanha[] {
  return [...lista].sort((a, b) => {
    if (b.prioridade !== a.prioridade) return b.prioridade - a.prioridade
    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
  })
}

export function ReordenarPrioridade({
  grupos,
  onClose,
  onSaved,
}: {
  grupos: GrupoConcorrente[]
  onClose: () => void
  onSaved: () => void
}) {
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoConcorrente | null>(grupos.length === 1 ? grupos[0] : null)
  const [ordem, setOrdem] = useState<Campanha[]>(() => (grupos.length === 1 ? ordenarPorPrioridadeAtual(grupos[0].campanhas) : []))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !salvando) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [salvando, onClose])

  const escolherGrupo = (grupo: GrupoConcorrente) => {
    setGrupoSelecionado(grupo)
    setOrdem(ordenarPorPrioridadeAtual(grupo.campanhas))
    setErro(null)
  }

  const mover = (index: number, dir: -1 | 1) => {
    setOrdem(prev => {
      const next = [...prev]
      const alvo = index + dir
      if (alvo < 0 || alvo >= next.length) return prev
      ;[next[index], next[alvo]] = [next[alvo], next[index]]
      return next
    })
  }

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      await post('/campanhas/reordenar', { ids: ordem.map(c => c.id) })
      onSaved()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar a nova ordem. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/45"
      onMouseDown={e => { if (e.target === e.currentTarget && !salvando) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reordenar-prioridade-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-outline-variant bg-surface shadow-panel">
        <div className="border-b border-outline-variant/30 px-6 py-5">
          <h2 id="reordenar-prioridade-title" className="text-title-lg font-bold text-on-surface">Reordenar prioridade</h2>
          <p className="mt-1 text-label-md text-on-surface-variant">
            {grupoSelecionado
              ? 'Quando essas campanhas concorrem entre si, a de maior prioridade (mais acima aqui) é exibida primeiro. Use as setas para reordenar.'
              : 'Escolha o grupo de campanhas concorrentes (mesma sistema/tela ou URL) que você quer reordenar.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!grupoSelecionado ? (
            <div className="space-y-2">
              {grupos.map(grupo => (
                <button
                  key={grupo.chave}
                  type="button"
                  onClick={() => escolherGrupo(grupo)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary-fixed/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-md font-bold text-on-surface">{rotuloGrupoConcorrente(grupo)}</span>
                    <span className="text-[12px] text-on-surface-variant">{grupo.campanhas.length} campanhas concorrentes</span>
                  </span>
                  <span className="material-symbols-outlined shrink-0 text-[20px] text-on-surface-variant">chevron_right</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {ordem.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-md font-bold text-on-surface">{c.titulo}</p>
                    <p className="truncate text-[12px] text-on-surface-variant">{c.sistema}{c.tela ? ` · ${c.tela}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0 || salvando}
                      title="Mover para cima"
                      aria-label={`Mover "${c.titulo}" para cima`}
                      className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={i === ordem.length - 1 || salvando}
                      title="Mover para baixo"
                      aria-label={`Mover "${c.titulo}" para baixo`}
                      className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {erro && (
          <p className="px-6 pb-1 text-label-md font-semibold text-error">{erro}</p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-outline-variant/30 px-6 py-4">
          <div>
            {grupoSelecionado && grupos.length > 1 && (
              <button
                type="button"
                onClick={() => { setGrupoSelecionado(null); setOrdem([]); setErro(null) }}
                disabled={salvando}
                className="text-label-lg font-bold text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
              >
                Trocar grupo
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="rounded-full px-4 py-2 text-label-lg font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            {grupoSelecionado && (
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="rounded-full bg-primary px-5 py-2 text-label-lg font-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar ordem'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
