interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export function ToggleSwitch({ checked, onChange, disabled = false, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50"
    >
      <span className={`relative block h-5 w-10 rounded-full transition-colors ${checked ? 'bg-tertiary' : 'bg-outline-variant'}`}>
        <span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${checked ? 'right-1' : 'left-1'}`} />
      </span>
    </button>
  )
}
