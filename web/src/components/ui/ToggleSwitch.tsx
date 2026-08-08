interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function ToggleSwitch({ checked, onChange, disabled = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 ${
        checked ? 'bg-tertiary' : 'bg-outline-variant'
      }`}
    >
      <span
        className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${
          checked ? 'right-1' : 'left-1'
        }`}
      />
    </button>
  )
}
