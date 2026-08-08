interface Step {
  n: number
  label: string
  icon: string
}

interface Props {
  steps: readonly Step[]
  current: number
  visitedMax: number
  onStepClick: (n: number) => void
}

export function Stepper({ steps, current, visitedMax, onStepClick }: Props) {
  return (
    <div className="flex items-center justify-center flex-wrap gap-y-2">
      {steps.map((s, i) => {
        const done = s.n < current
        const active = s.n === current
        const clickable = s.n <= visitedMax
        return (
          <div key={s.n} className="flex items-center">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick(s.n)}
              className={`flex items-center gap-1.5 pl-1 pr-3 py-1.5 rounded-full border transition-colors ${
                clickable ? 'cursor-pointer' : 'cursor-not-allowed'
              } ${active ? 'bg-ink-deep text-white border-ink-deep' : 'bg-surface text-ink border-hairline hover:bg-surface-container-low'}`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all shrink-0 ${
                  done || active
                    ? 'bg-primary border-primary text-on-primary'
                    : 'bg-surface-container-low border-hairline text-steel'
                }`}
              >
                {done ? <span className="material-symbols-outlined text-[13px]">check</span> : s.n}
              </span>
              <span className={`text-label-sm font-bold whitespace-nowrap ${active ? 'text-white' : done ? 'text-ink' : 'text-steel'}`}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className={`h-px w-6 sm:w-10 mx-1 rounded-full transition-colors ${s.n < current ? 'bg-primary' : 'bg-hairline-soft'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
