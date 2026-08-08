import type { StatusCampanha } from '../../types'

const config: Record<StatusCampanha, { label: string; className: string }> = {
  ativa:     { label: 'Ativa',     className: 'bg-tertiary text-on-tertiary' },
  inativa:   { label: 'Inativa',   className: 'bg-outline-variant text-steel' },
  agendada:  { label: 'Agendada',  className: 'bg-warning text-ink-deep' },
  encerrada: { label: 'Encerrada', className: 'bg-outline-variant text-steel' },
}

export function StatusBadge({ status }: { status: StatusCampanha }) {
  const { label, className } = config[status]
  return (
    <span className={`px-2.5 py-1 rounded-full text-label-sm font-bold uppercase ${className}`}>
      {label}
    </span>
  )
}
