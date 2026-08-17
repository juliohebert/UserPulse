import type { PlanoResumo } from '../types'

export interface LimiteTrialInfo {
  atingido: boolean
  mensagem: string | null
}

export const LIMITE_TRIAL_NAO_ATINGIDO: LimiteTrialInfo = { atingido: false, mensagem: null }

// Fase 6E — mesma regra e mesma mensagem já aplicadas no backend (ver
// motivoLimiteTrialAtingido/checarLimite*Ativas em
// server/src/lib/tenantGuards.ts): em plano de trial, o limite conta o
// TOTAL cadastrado (ativo + inativo), não só ativos — usado aqui só pra UX
// (desabilitar o botão "Novo"/bloquear a rota direta antes de bater no
// backend); o backend continua sendo quem valida de verdade no POST, nunca
// confiar só nesta checagem. Fora do trial (ou sem plano.eh_plano_trial),
// nunca bloqueia aqui — planos pagos seguem a regra de "só ativos", que já
// é só backend, sem espelho de UI (comportamento inalterado).
export function limiteTrial(
  plano: PlanoResumo | null | undefined,
  limite: number | null | undefined,
  total: number,
  entidadeSingular: string
): LimiteTrialInfo {
  if (!plano?.eh_plano_trial || !limite || total < limite) return LIMITE_TRIAL_NAO_ATINGIDO
  const entidade = limite === 1 ? entidadeSingular : `${entidadeSingular}s`
  return {
    atingido: true,
    mensagem: `Limite do teste grátis atingido. Seu plano permite até ${limite} ${entidade} durante o período gratuito.`,
  }
}
