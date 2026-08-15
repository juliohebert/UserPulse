import { useState } from 'react'
import type { ReactNode } from 'react'

// Botão com tooltip acessível — mouse (hover), teclado (foco) e toque
// (clique/tap alterna a visibilidade, já que touch não dispara hover nem
// sempre dispara foco de forma confiável). `onClick` é opcional: usado tanto
// pra ícones de ação de verdade (editar/duplicar/excluir, que já chamavam
// isto antes de virar componente compartilhado) quanto pra ícones de ajuda
// puros (só mostram a explicação, sem nenhuma ação além disso).
export function TooltipIconButton({
  label,
  ariaLabel,
  onClick,
  className,
  // Opcional, default = comportamento de sempre (usado em /campanhas):
  // balão de 1 linha (whitespace-nowrap, sem max-width) acima do ícone.
  // tooltipClassName troca esse default — usado no dashboard pro tooltip de
  // "Desempenho dos destaques", cujo texto é mais longo e precisa quebrar
  // linha com largura máxima em vez de virar uma barra enorme.
  tooltipClassName,
  children,
}: {
  label: string
  ariaLabel: string
  onClick?: () => void
  className: string
  tooltipClassName?: string
  children: ReactNode
}) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => {
          setVisible(v => !v)
          onClick?.()
        }}
        aria-label={ariaLabel}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className={className}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-2xl bg-on-surface px-2.5 py-1.5 text-[11px] font-semibold text-surface shadow-panel transition-opacity duration-100 ${
          tooltipClassName ?? 'whitespace-nowrap'
        } ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {label}
      </span>
    </span>
  )
}
