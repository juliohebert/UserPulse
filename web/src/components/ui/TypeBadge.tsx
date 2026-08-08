const config: Record<string, { label: string; icon: string; className: string }> = {
  comunicado: {
    label: 'Comunicado',
    icon: 'campaign',
    className: 'bg-primary-container/20 text-primary border border-primary/20',
  },
  melhoria: {
    label: 'Melhoria',
    icon: 'rocket_launch',
    className: 'bg-secondary-container/20 text-secondary border border-secondary/20',
  },
  pesquisa: {
    label: 'Pesquisa',
    icon: 'quiz',
    className: 'bg-tertiary/10 text-tertiary border border-tertiary/20',
  },
}

const fallback = {
  label: '',
  icon: 'label',
  className: 'bg-outline-variant/30 text-outline border border-outline/20',
}

export function TypeBadge({ tipo }: { tipo: string }) {
  const { label, icon, className } = config[tipo] ?? { ...fallback, label: tipo }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${className}`}>
      <span className="material-symbols-outlined text-[13px] leading-none">{icon}</span>
      {label}
    </span>
  )
}
