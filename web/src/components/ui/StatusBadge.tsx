import type { StatusCampanha } from '../../types'
import { DesignStatusBadge, type DesignStatusBadgeVariant } from './DesignStatusBadge'

// 'agendada'/'encerrada' NUNCA são status persistido (só existem
// RASCUNHO/ATIVA/INATIVA no backend, ver CampanhaStatus em types.ts) — são
// uma leitura de período por cima de uma campanha ATIVA (ver getStatus em
// pages/campanhas/campanhaForm.ts). O label deixa isso explícito ("Ativa ·
// Agendada"/"Ativa · Encerrada") pra nunca parecer um 4º/5º status ao lado
// de Rascunho/Ativa/Inativa.
const config: Record<StatusCampanha, { label: string; variant: DesignStatusBadgeVariant }> = {
  rascunho:  { label: 'Rascunho',           variant: 'attention' },
  ativa:     { label: 'Ativa',              variant: 'success' },
  inativa:   { label: 'Inativa',            variant: 'neutral' },
  agendada:  { label: 'Ativa · Agendada',   variant: 'promo' },
  encerrada: { label: 'Ativa · Encerrada',  variant: 'neutral' },
}

export function StatusBadge({ status }: { status: StatusCampanha }) {
  const { label, variant } = config[status]
  return <DesignStatusBadge variant={variant}>{label}</DesignStatusBadge>
}
