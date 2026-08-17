const config: Record<string, { label: string; icon: string; className: string }> = {
  comunicado: {
    label: 'Comunicado',
    icon: 'campaign',
    className: 'bg-primary text-white',
  },
  melhoria: {
    label: 'Melhoria',
    icon: 'rocket_launch',
    className: 'bg-[#a121ce] text-white',
  },
  pesquisa: {
    label: 'Pesquisa',
    icon: 'quiz',
    className: 'bg-[#31a24c] text-white',
  },
}

const fallback = {
  label: '',
  icon: 'label',
  className: 'bg-surface-container text-on-surface-variant',
}

export function TypeBadge({ tipo }: { tipo: string }) {
  const { label, icon, className } = config[tipo] ?? { ...fallback, label: tipo }
  return (
    <span className={`inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 py-1 text-label-sm font-bold leading-none ${className}`}>
      <span className="material-symbols-outlined text-[11px] leading-none">{icon}</span>
      {label}
    </span>
  )
}
