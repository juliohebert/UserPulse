import type { StatusCampanha } from '../../types'
import { DesignStatusBadge, type DesignStatusBadgeVariant } from './DesignStatusBadge'
import { STATUS_LABEL, statusTooltip } from '../../pages/campanhas/campanhaStatusCopy'

// Badge única de status de Campanha (ver getStatus). Label e tooltip vêm de
// campanhaStatusCopy.ts (fonte única). 'agendada'/'encerrada' NUNCA são
// status persistido (só RASCUNHO/ATIVA/INATIVA no backend) — são leitura de
// período por cima de uma campanha ATIVA; o rótulo é curto e a nuance fica no
// tooltip. 'inativa' exibe "Desativada" (chave interna mantida).
const VARIANT: Record<StatusCampanha, DesignStatusBadgeVariant> = {
  // 'promo' = amarelo (#facc15) e 'attention' = roxo (bg-secondary, ver
  // DesignStatusBadge) — nomes de variante não descrevem a cor final, por
  // isso o mapeamento trocado (rascunho roxo, agendada amarela) passou
  // despercebido.
  rascunho: 'promo',
  ativa: 'success',
  inativa: 'neutral',
  agendada: 'attention',
  encerrada: 'neutral',
}

export function StatusBadge({ status, dataInicio }: { status: StatusCampanha; dataInicio?: string | null }) {
  return (
    <DesignStatusBadge variant={VARIANT[status]} title={statusTooltip(status, dataInicio)}>
      {STATUS_LABEL[status]}
    </DesignStatusBadge>
  )
}
