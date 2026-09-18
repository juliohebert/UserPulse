import { useEffect, useRef, useState } from 'react'
import type { TelaCatalogo } from '../../types'

function alvoTelaCatalogo(tela: TelaCatalogo): string {
  return tela.tela ?? tela.url_contem ?? tela.data_cy ?? 'Sem alvo definido'
}

function modoTelaCatalogo(tela: TelaCatalogo): string {
  if (tela.modo_identificacao === 'url_contem') return 'Caminho da URL'
  if (tela.modo_identificacao === 'data_cy') return 'Elemento (data-cy)'
  return 'Tela informada pelo sistema'
}

export function SeletorTelaCatalogo({ telas, selecionada, disabled, onSelecionar, onCriar }: {
  telas: TelaCatalogo[]
  selecionada: TelaCatalogo | undefined
  disabled?: boolean
  onSelecionar: (telaId: string) => void
  onCriar?: (busca?: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setAberto(false)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [aberto])

  const termo = busca.trim().toLowerCase()
  const filtradas = termo
    ? telas.filter(tela => [tela.nome, alvoTelaCatalogo(tela)].some(valor => valor.toLowerCase().includes(termo)))
    : telas
  const temIgual = termo
    ? telas.some(tela => [tela.nome, alvoTelaCatalogo(tela)].some(valor => valor.trim().toLowerCase() === termo))
    : false
  const mostrarCriar = !disabled && Boolean(termo) && !temIgual && Boolean(onCriar)

  return (
    <div className="relative" ref={ref}>
      <div className={`flex min-h-11 w-full items-stretch overflow-hidden border border-[#ced0d4] bg-white text-[16px] text-[#1c1e21] transition focus-within:border-[#0064e0] focus-within:ring-1 focus-within:ring-[#0064e0] hover:border-[#0064e0] ${aberto ? 'rounded-t-2xl rounded-b-none border-[#0064e0]' : 'rounded-2xl'}`}>
        <div className="relative flex min-w-0 flex-1 items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 text-[20px] text-[#8595a4]">search</span>
          <input
            disabled={disabled}
            value={aberto ? busca : (busca || selecionada?.nome || '')}
            onFocus={() => setAberto(true)}
            onClick={() => setAberto(true)}
            onChange={event => { setBusca(event.target.value); setAberto(true) }}
            placeholder="Buscar ou selecionar tela..."
            className="h-full min-h-11 w-full border-0 bg-transparent py-2 pl-10 pr-10 text-[16px] font-semibold text-[#1c1e21] outline-none placeholder:text-[#8595a4] disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#8595a4]"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAberto(prev => !prev)}
            aria-label={aberto ? 'Fechar lista de telas' : 'Abrir lista de telas'}
            className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#8595a4] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:text-[#8595a4]"
          >
            <span className={`material-symbols-outlined text-[18px] transition-transform ${aberto ? 'rotate-180' : ''}`}>expand_more</span>
          </button>
        </div>
        {onCriar && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => { setAberto(false); setBusca(''); onCriar() }}
            aria-label="Criar nova tela"
            title="Criar nova tela"
            className="flex w-9 shrink-0 items-center justify-center border-l border-[#dee3e9] text-[#0064e0] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:bg-[#f8f9ff] disabled:text-[#8595a4]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        )}
      </div>

      {aberto && !disabled && (
        <div className="absolute left-0 top-full z-40 w-full overflow-hidden rounded-b-2xl border border-t-0 border-[#0064e0] bg-white shadow-[0_16px_36px_rgba(20,22,26,0.12)]">
          <div className="max-h-[168px] overflow-y-auto p-2">
            {filtradas.length > 0 ? filtradas.map(tela => (
              <button
                key={tela.id}
                type="button"
                onClick={() => { onSelecionar(tela.id); setAberto(false); setBusca('') }}
                className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${selecionada?.id === tela.id ? 'bg-[#eff4ff] text-[#0064e0]' : 'text-[#1c1e21] hover:bg-[#f8f9ff]'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold leading-5">{tela.nome}</span>
                  <span className="mt-0.5 block truncate text-[12px] font-semibold leading-4 text-[#5d6c7b]">{alvoTelaCatalogo(tela)} · {modoTelaCatalogo(tela)}</span>
                </span>
                {selecionada?.id === tela.id && <span className="material-symbols-outlined mt-0.5 text-[16px]">check</span>}
              </button>
            )) : (
              <p className="px-3 py-4 text-center text-[12px] font-semibold leading-4 text-[#5d6c7b]">Nenhuma tela encontrada.</p>
            )}
          </div>

          {mostrarCriar && (
            <div className="border-t border-[#dee3e9] p-2">
              <button
                type="button"
                onClick={() => { onCriar?.(busca.trim() || undefined); setAberto(false); setBusca('') }}
                className="flex w-full items-center gap-2 rounded-xl bg-[#0064e0] px-3 py-2.5 text-left text-[14px] font-bold text-white transition hover:bg-[#0457cb]"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Criar tela &quot;{busca.trim()}&quot;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
