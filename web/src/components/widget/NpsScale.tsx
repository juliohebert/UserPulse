interface Props {
  value: number | null
  onChange: (n: number) => void
}

export function NpsScale({ value, onChange }: Props) {
  return (
    <div>
      <div className="flex justify-between gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={`flex-1 h-10 min-w-0 rounded-full border text-label-sm font-bold transition-colors ${
              value === i
                ? 'bg-ink-deep text-white border-ink-deep'
                : 'border-hairline text-charcoal hover:bg-surface-container-low'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-label-sm text-steel uppercase font-bold">Ruim</span>
        <span className="text-label-sm text-steel uppercase font-bold">Excelente</span>
      </div>
    </div>
  )
}
