import { AdminRole, Prisma } from '@prisma/client'
import type { SituacaoComercialTenant } from './tenantGuards'

// ─── Fase 6D — decisões puras por trás do scheduler de alertas de trial ─────
// (ver services/trialAlertasScheduler.ts pro orquestrador, que é quem toca
// Prisma/EmailService de verdade). Tudo aqui é testável sem banco, mesmo
// padrão do resto do projeto (ver motivoBloqueioEscrita/checarLimite*Ativas
// em tenantGuards.ts) — a parte "burra" (contar/salvar) fica no scheduler,
// a decisão fica aqui.

export type MarcoAlertaTrial = 'D7' | 'D3' | 'D1' | 'VENCIDO'

const DIAS_PARA_MARCO: Partial<Record<number, MarcoAlertaTrial>> = { 7: 'D7', 3: 'D3', 1: 'D1' }

// Decide qual marco (se algum) se aplica AGORA, a partir do estado JÁ
// calculado (situacao_comercial via obterSituacaoComercialTenant, dias via
// diasRestantesTrial — nunca recalculado aqui, mesma fonte usada pelo resto
// do backend). Só dispara pra tenant efetivamente em trial:
// - 'trial_vencido' => sempre VENCIDO, independente de `dias` (o valor exato
//   já é 0 ali, mas a decisão usa a situação, não o número, pra não
//   depender da borda exata de diasRestantesTrial).
// - 'trial_ativo' => D7/D3/D1 exatamente quando dias bate um desses três,
//   null pra qualquer outro valor (6, 5, 4, 2, 14...) — nunca dispara "o
//   mais próximo", só o marco exato.
// - qualquer outra situação (licenca_ativa/licenca_vencida/suspenso/
//   cancelado — plano pago, licença vencida, suspenso, cancelado) => null,
//   sempre. Cobre "pago não recebe" e "SUSPENDED/CANCELED não recebem" por
//   construção, mesmo que o caller esqueça de filtrar por status=TRIAL na
//   query (defesa em profundidade — trialAlertasScheduler.ts também filtra
//   na query, essa é a segunda camada).
//
// Stateless de propósito: cada chamada só olha o estado ATUAL, nunca um
// histórico — se o scheduler ficou fora do ar e "pulou" o dia exato em que
// dias===7, esse marco simplesmente nunca mais é visto (dias só diminui com
// o tempo) e nunca é enviado atrasado depois. "Não enviar marcos antigos
// atrasados em lote" cai disso de graça, sem lógica extra.
export function decidirMarcoAlertaTrial(situacao: SituacaoComercialTenant, dias: number | null): MarcoAlertaTrial | null {
  if (situacao === 'trial_vencido') return 'VENCIDO'
  if (situacao !== 'trial_ativo' || dias == null) return null
  return DIAS_PARA_MARCO[dias] ?? null
}

// Trava atômica de reivindicação (ver reivindicarRegistro em
// services/trialAlertasScheduler.ts): um ENVIANDO mais novo que isto ainda
// está sendo processado por algum processo agora mesmo (talvez outra
// réplica) — não reivindicável. Mais velho que isto quase certamente
// significa que o processo anterior caiu no meio do envio (nunca chegou a
// gravar ENVIADO nem FALHOU) — libera reivindicar de novo. 15 minutos é
// folgado o bastante pra qualquer envio real (chamada HTTP ao provider),
// sem ficar preso indefinidamente num crash.
// Exportado porque services/trialAlertasScheduler.ts usa o MESMO valor na
// query de reivindicação (reivindicarRegistro) — nunca duas fontes de
// verdade pro mesmo número.
export const TRAVA_ENVIANDO_STALE_MS = 15 * 60 * 1000

// Decide se vale tentar (de novo) enviar, a partir do registro de
// idempotência já existente (ou null, primeira vez). ENVIADO nunca é
// revisitado (garante "uma única vez", mesmo após reinício do processo, já
// que o estado vive no banco). FALHOU sempre libera nova tentativa.
// ENVIANDO (reivindicado por um processo, envio em andamento ou possível
// crash no meio dele) só libera nova tentativa se a trava estiver velha
// (stale) — nunca reenvia uma tentativa que ainda pode estar em curso, essa
// é a correção da brecha de concorrência (2 processos processando o MESMO
// FALHOU ao mesmo tempo). Mesmo raciocínio de motivoLimiteAtivosAtingido em
// tenantGuards.ts: decisão pura separada da consulta/escrita no banco — a
// reivindicação de verdade (o que impede a corrida) é o UPDATE condicional
// atômico no banco, esta função só decide se vale tentar reivindicar.
export function deveEnviarAlerta(
  registro: { status: 'ENVIADO' | 'FALHOU' | 'ENVIANDO'; atualizado_em?: Date } | null,
  agora: Date = new Date()
): boolean {
  if (registro == null) return true
  if (registro.status === 'ENVIADO') return false
  if (registro.status === 'FALHOU') return true
  const desde = registro.atualizado_em ?? new Date(0)
  return agora.getTime() - desde.getTime() > TRAVA_ENVIANDO_STALE_MS
}

// Filtro de destinatários — só ADMIN ativo do próprio tenant (regra
// explícita da tarefa: nunca EDITOR/VIEWER). SUPER_ADMIN também fica de
// fora: na prática só existe dentro do tenant interno (Quark), que nunca
// está em trial, mas o filtro não depende dessa coincidência — é explícito
// por papel. tenant_id sempre presente (nunca uma query "solta" sem
// escopo) é o que garante isolamento entre tenants aqui, mesmo padrão de
// todo outro filtro Prisma no projeto que já parte de tenant_id.
export function filtroDestinatariosTrialAtivos(tenantId: string): Prisma.AdminUserWhereInput {
  return { tenant_id: tenantId, role: AdminRole.ADMIN, ativo: true }
}
