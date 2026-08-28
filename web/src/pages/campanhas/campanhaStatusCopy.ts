import type { StatusCampanha } from '../../types'
import { separarDataHora } from './campanhaForm.utils'

// ─── Linguagem única dos estados de Campanha ──────────────────────────────
// Fonte única de LABEL + TOOLTIP das 5 situações derivadas por getStatus
// (rascunho | agendada | ativa | inativa | encerrada). Módulo puro (sem
// React/import.meta) — testável com node:test, mesmo padrão de
// campanhaForm.utils.ts / campanhaResumo.ts.
//
// A CHAVE interna continua 'inativa' (e o status persistido, INATIVA); só o
// TEXTO exibido virou "Desativada", casando com a ação "Desativar".
// 'agendada'/'encerrada' seguem sendo situações DERIVADAS de uma campanha
// ATIVA + período — o rótulo é curto e a nuance "por baixo é ATIVA" vive no
// tooltip, não no label.

export const STATUS_LABEL: Record<StatusCampanha, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  ativa: 'Ativa',
  inativa: 'Desativada',
  encerrada: 'Encerrada',
}

// "2026-09-01T12:00:00.000Z" -> "01/09/2026 às 09:00" (America/Sao_Paulo, via
// separarDataHora). Valor date-only legado -> "01/09/2026" (sem hora).
// Vazio/inválido -> null.
export function formatarInicioSP(dataInicioISO: string | null | undefined): string | null {
  if (!dataInicioISO) return null
  const { data, hora } = separarDataHora(dataInicioISO)
  if (!data) return null
  const [ano, mes, dia] = data.split('-')
  const dataBr = `${dia}/${mes}/${ano}`
  return hora ? `${dataBr} às ${hora}` : dataBr
}

const TOOLTIP_FIXO: Record<Exclude<StatusCampanha, 'agendada'>, string> = {
  rascunho: 'Ainda não publicada — nunca foi exibida para os usuários.',
  ativa: 'No ar para os usuários elegíveis.',
  inativa: 'Pausada manualmente. Pode ser reativada quando quiser.',
  encerrada: 'Vigência finalizada. Não reabre — duplique para rodar novamente.',
}

// Tooltip da badge de status. `dataInicioISO` só entra no caso 'agendada'
// (para citar quando a campanha começa a aparecer).
export function statusTooltip(status: StatusCampanha, dataInicioISO?: string | null): string {
  if (status === 'agendada') {
    const inicio = formatarInicioSP(dataInicioISO)
    return inicio
      ? `Publicada, mas só começa a aparecer em ${inicio}.`
      : 'Publicada, mas só começa a aparecer na data de início configurada.'
  }
  return TOOLTIP_FIXO[status]
}
