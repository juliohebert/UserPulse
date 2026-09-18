import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
  placeholder?: string
  size?: 'md' | 'sm'
  disabled?: boolean
}

// Mesmo padrão visual do dropdown customizado usado nos filtros de campanhas
// (FilterSelect em pages/campanhas/Index.tsx), extraído para reuso.
const SIZE_CLASSES: Record<'md' | 'sm', string> = {
  md: 'h-11 rounded-full px-4 text-body-md',
  sm: 'py-2 rounded-full px-3 text-body-sm',
}

export function Select({ value, options, onChange, id, ariaLabel, placeholder, size = 'md', disabled }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const atualizarPosicao = () => {
      const elemento = ref.current
      if (!elemento) return
      const rect = elemento.getBoundingClientRect()
      const alturaNatural = Math.min(256, Math.max(96, options.length * 44 + 8))
      const espacoAcima = rect.top - 16
      const espacoAbaixo = window.innerHeight - rect.bottom - 16
      const abrirAcima = espacoAbaixo < alturaNatural && espacoAcima > espacoAbaixo
      const espacoDisponivel = Math.max(96, abrirAcima ? espacoAcima : espacoAbaixo)
      const maxHeight = Math.min(256, espacoDisponivel)

      setMenuPosition({
        left: rect.left,
        width: rect.width,
        maxHeight,
        ...(abrirAcima ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      })
    }

    atualizarPosicao()
    window.addEventListener('resize', atualizarPosicao)
    window.addEventListener('scroll', atualizarPosicao, true)
    const onMouseDown = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (ref.current && !ref.current.contains(alvo) && !menuRef.current?.contains(alvo)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', atualizarPosicao)
      window.removeEventListener('scroll', atualizarPosicao, true)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) setMenuPosition(null)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`w-full bg-surface-bright border border-[#ced0d4] flex justify-between items-center gap-2 focus:outline-none focus:ring-0 focus:border-2 focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${SIZE_CLASSES[size]}`}
      >
        <span className={`truncate ${selected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
          {selected?.label ?? placeholder ?? ''}
        </span>
        <span className={`material-symbols-outlined text-outline text-[18px] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] overflow-y-auto rounded-2xl border border-outline-variant bg-surface-bright shadow-panel"
          style={{
            left: menuPosition.left,
            width: menuPosition.width,
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-body-md transition-colors ${
                value === o.value
                  ? 'bg-primary font-bold text-white'
                  : 'text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <span className="min-w-0 truncate">{o.label}</span>
              {value === o.value && (
                <span className="material-symbols-outlined ml-2 shrink-0 text-[16px]">check</span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
