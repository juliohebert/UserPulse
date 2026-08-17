import type { StatusCampanha } from '../../types'
import { DesignStatusBadge, type DesignStatusBadgeVariant } from './DesignStatusBadge'

const config: Record<StatusCampanha, { label: string; variant: DesignStatusBadgeVariant }> = {
  ativa:     { label: 'Ativa',     variant: 'success' },
  inativa:   { label: 'Inativa',   variant: 'neutral' },
  agendada:  { label: 'Agendada',  variant: 'promo' },
  encerrada: { label: 'Encerrada', variant: 'neutral' },
}

export function StatusBadge({ status }: { status: StatusCampanha }) {
  const { label, variant } = config[status]
  return <DesignStatusBadge variant={variant}>{label}</DesignStatusBadge>
}
