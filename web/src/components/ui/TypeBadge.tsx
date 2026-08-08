const config: Record<string, { label: string; icon: string; className: string }> = {
  comunicado: {
    label: 'Comunicado',
    icon: 'campaign',
    className: 'bg-surface text-ink border border-hairline',
  },
  melhoria: {
    label: 'Melhoria',
    icon: 'rocket_launch',
    className: 'bg-surface text-secondary border border-hairline',
  },
  pesquisa: {
    label: 'Pesquisa',
    icon: 'quiz',
    className: 'bg-surface text-tertiary border border-hairline',
  },
}

const fallback = {
  label: '',
  icon: 'label',
  className: 'bg-surface text-steel border border-hairline',
}

export function TypeBadge({ tipo }: { tipo: string }) {
  const { label, icon, className } = config[tipo] ?? { ...fallback, label: tipo }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm font-bold uppercase ${className}`}>
      <span className="material-symbols-outlined text-[13px] leading-none">{icon}</span>
      {label}
    </span>
  )
}
