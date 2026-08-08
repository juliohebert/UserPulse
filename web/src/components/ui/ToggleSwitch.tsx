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
      className={`relative h-6 w-11 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#1876f2] focus:ring-offset-1 disabled:opacity-50 ${
        checked ? 'bg-primary border-primary' : 'bg-surface-container-low border-hairline'
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
