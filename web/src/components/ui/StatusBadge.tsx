import type { StatusCampanha } from '../../types'

const config: Record<StatusCampanha, { label: string; className: string }> = {
  ativa:     { label: 'Ativa',     className: 'bg-tertiary/10 text-tertiary' },
  inativa:   { label: 'Inativa',   className: 'bg-outline-variant/30 text-outline' },
  agendada:  { label: 'Agendada',  className: 'bg-primary/10 text-primary' },
  encerrada: { label: 'Encerrada', className: 'bg-outline-variant/30 text-outline' },
}

export function StatusBadge({ status }: { status: StatusCampanha }) {
  const { label, className } = config[status]
  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${className}`}>
      {label}
    </span>
  )
}
