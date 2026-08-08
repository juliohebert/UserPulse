import { useEffect, useRef, useState } from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  size?: 'md' | 'sm'
  disabled?: boolean
}

// Mesmo padrão visual do dropdown customizado usado nos filtros de campanhas
// (FilterSelect em pages/campanhas/Index.tsx), extraído para reuso.
const SIZE_CLASSES: Record<'md' | 'sm', string> = {
  md: 'h-11 rounded-lg px-3 text-body-md',
  sm: 'h-10 rounded-full px-4 text-body-sm',
}

export function Select({ value, options, onChange, placeholder, size = 'md', disabled }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`w-full bg-surface border border-hairline flex justify-between items-center gap-2 focus:outline-none focus:ring-0 focus:border-[#1876f2] transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${SIZE_CLASSES[size]}`}
      >
        <span className={`truncate ${selected ? 'text-on-surface' : 'text-on-surface-variant'}`}>
          {selected?.label ?? placeholder ?? ''}
        </span>
        <span className={`material-symbols-outlined text-stone text-[18px] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full max-h-64 overflow-y-auto rounded-xl border border-hairline-soft bg-surface shadow-panel">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-body-sm text-left transition-colors ${
                value === o.value
                  ? 'bg-ink-deep text-white font-bold'
                  : 'text-ink hover:bg-surface-container-low'
              }`}
            >
              {o.label}
              {value === o.value && (
                <span className="material-symbols-outlined text-[16px]">check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
