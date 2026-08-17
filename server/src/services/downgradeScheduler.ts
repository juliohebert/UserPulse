import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { downgradeDeveEfetivar } from './asaasClient'

// ─── Fase 8B — scheduler de EFETIVAÇÃO do downgrade agendado ───────────────
// Puramente LOCAL: o Asaas já foi sincronizado na SOLICITAÇÃO (POST
// /billing/downgrade, ver solicitarDowngrade em controllers/billing.ts) — a
// assinatura recorrente já está no valor destino desde então. Este
// scheduler só espelha localmente o que o Asaas já reflete: nunca consulta
// o Asaas, nunca altera assinatura/cobrança, nunca recalcula preço/nivel/
// limites/adimplência. Mesmo padrão de trialAlertasScheduler.ts (setInterval
// interno, sem cron/serviço externo).

type CandidatoDowngrade = {
  id: string
  plano_downgrade_id: string | null
  downgrade_efetivar_em: Date | null
  downgrade_valor_origem: Prisma.Decimal | null
  downgrade_valor_destino: Prisma.Decimal | null
}

// Busca só quem tem AGENDAMENTO COMPLETO (os 4 campos preenchidos) — claims
// incompletos (downgrade_valor_origem ainda null, ver classificarClaimDowngrade
// em asaasClient.ts) nunca aparecem aqui, filtrados na própria query.
// Nunca filtra por downgrade_efetivar_em <= now() no banco — a comparação
// "já chegou a data" precisa ser por DIA CIVIL America/Sao_Paulo
// (downgradeDeveEfetivar, ver selecionarDowngradesDevidos abaixo), não por
// instante bruto (mesmo cuidado já documentado em outros pontos
// financeiros deste projeto).
async function buscarCandidatosDowngrade(): Promise<CandidatoDowngrade[]> {
  return prisma.tenant.findMany({
    where: {
      plano_downgrade_id: { not: null },
      downgrade_efetivar_em: { not: null },
      downgrade_valor_origem: { not: null },
      downgrade_valor_destino: { not: null },
    },
    select: {
      id: true, plano_downgrade_id: true, downgrade_efetivar_em: true,
      downgrade_valor_origem: true, downgrade_valor_destino: true,
    },
  })
}

// Pura (sem I/O) — separa quem já chegou na data de efetivação (dia civil
// BRT, reaproveitando downgradeDeveEfetivar, nunca uma comparação de
// instante bruto nova). "Agendamento completo" já foi resolvido pela query
// acima; esta função só decide a PARTE que tem que ser dia civil.
export function selecionarDowngradesDevidos<T extends { downgrade_efetivar_em: Date | null }>(
  candidatos: T[],
  agora: Date
): T[] {
  return candidatos.filter(c => c.downgrade_efetivar_em != null && downgradeDeveEfetivar(c.downgrade_efetivar_em, agora))
}

export interface EfetivacaoDowngradePayload {
  where: {
    id: string
    plano_downgrade_id: string
    downgrade_efetivar_em: Date
    downgrade_valor_origem: Prisma.Decimal | number | string
    downgrade_valor_destino: Prisma.Decimal | number | string
  }
  data: {
    plano_id: string
    valor_assinatura_atual: Prisma.Decimal | number | string
    plano_downgrade_id: null
    downgrade_efetivar_em: null
    downgrade_valor_origem: null
    downgrade_valor_destino: null
  }
}

// Pura (sem I/O) — monta o WHERE/DATA do updateMany atômico de efetivação.
// Nunca lê preço de catálogo/nivel/nada externo: usa exclusivamente os
// snapshots já persistidos — downgrade_valor_destino vira valor_assinatura_atual
// DIRETO, nunca o preço atual de Plano.asaas_subscription_value (é
// exatamente o caso "Starter foi 149 no agendamento, catálogo hoje diz
// 179" da tarefa: o campo de catálogo nem é lido por esta função). `data`
// nunca inclui licenca_fim/proxima_cobranca/asaas_subscription_id/
// asaas_status/status/plano_pendente_id/plano_pendente_payment_id —
// estruturalmente impossível de tocar esses campos, o objeto literal não
// os declara. `where` protege id + os 4 snapshots lidos — o updateMany só
// afeta a linha se NADA mudou entre a leitura e a escrita.
export function montarEfetivacaoDowngrade(tenant: {
  id: string
  plano_downgrade_id: string
  downgrade_efetivar_em: Date
  downgrade_valor_origem: Prisma.Decimal | number | string
  downgrade_valor_destino: Prisma.Decimal | number | string
}): EfetivacaoDowngradePayload {
  return {
    where: {
      id: tenant.id,
      plano_downgrade_id: tenant.plano_downgrade_id,
      downgrade_efetivar_em: tenant.downgrade_efetivar_em,
      downgrade_valor_origem: tenant.downgrade_valor_origem,
      downgrade_valor_destino: tenant.downgrade_valor_destino,
    },
    data: {
      plano_id: tenant.plano_downgrade_id,
      valor_assinatura_atual: tenant.downgrade_valor_destino,
      plano_downgrade_id: null,
      downgrade_efetivar_em: null,
      downgrade_valor_origem: null,
      downgrade_valor_destino: null,
    },
  }
}

// updateMany condicionado aos MESMOS snapshots lidos — mesmo padrão de
// concorrência já usado no resto do projeto (cancelarUpgrade,
// solicitarDowngrade/cancelarDowngrade em billing.ts, reivindicarRegistro
// em trialAlertasScheduler.ts): nenhuma claim table nova, nenhum mutex em
// memória. count=0 sempre que outro processo (2ª instância deste
// scheduler, ou um DELETE /billing/downgrade concorrente) já mexeu neste
// tenant entre a leitura e aqui — tratado como no-op, nunca sobrescreve
// outro estado, nunca é erro fatal.
async function efetivarDowngrade(tenant: CandidatoDowngrade): Promise<void> {
  const payload = montarEfetivacaoDowngrade({
    id: tenant.id,
    plano_downgrade_id: tenant.plano_downgrade_id!,
    downgrade_efetivar_em: tenant.downgrade_efetivar_em!,
    downgrade_valor_origem: tenant.downgrade_valor_origem!,
    downgrade_valor_destino: tenant.downgrade_valor_destino!,
  })
  const efetivado = await prisma.tenant.updateMany(payload)
  if (efetivado.count === 0) {
    console.log(`[downgrade-scheduler] Tenant ${tenant.id}: estado mudou entre a leitura e a efetivação — no-op concorrente, ignorado.`)
  }
}

// Ponto de entrada de uma execução — sequencial de propósito (mesmo
// raciocínio de processarAlertasTrial: nunca Promise.all entre tenants).
// Falha ao processar UM tenant nunca impede os demais, e NUNCA limpa os
// campos de downgrade desse tenant — eles continuam intactos pro retry no
// próximo ciclo (idempotência real vem do WHERE condicionado acima, não de
// nenhum estado de retry novo). Falha ao LISTAR os candidatos propaga pro
// caller (executarUmaVez, mais abaixo), que só loga e tenta de novo no
// próximo intervalo — nunca captura dados sensíveis no log (só o id do
// tenant e a mensagem de erro).
export async function processarDowngradesAgendados(agora: Date = new Date()): Promise<void> {
  const candidatos = await buscarCandidatosDowngrade()
  const devidos = selecionarDowngradesDevidos(candidatos, agora)
  for (const tenant of devidos) {
    try {
      await efetivarDowngrade(tenant)
    } catch (err) {
      console.error(`[downgrade-scheduler] Erro ao efetivar downgrade do tenant ${tenant.id}:`, err instanceof Error ? err.message : err)
    }
  }
}

const INTERVALO_MS = Number(process.env.DOWNGRADE_SCHEDULER_INTERVALO_MS) || 60 * 60 * 1000

// Trava simples contra sobreposição — mesmo padrão de trialAlertasScheduler.ts:
// se uma execução ainda estiver em andamento quando o próximo tick disparar,
// o próximo tick só é ignorado, nunca empilha execuções concorrentes do job
// inteiro (a proteção real contra 2 INSTÂNCIAS do processo continua sendo o
// updateMany condicionado em efetivarDowngrade acima).
let executando = false

function executarUmaVez(): void {
  if (executando) return
  executando = true
  processarDowngradesAgendados()
    .catch(err => console.error('[downgrade-scheduler] Erro ao processar downgrades agendados:', err))
    .finally(() => { executando = false })
}

// Chamado uma vez no boot (ver index.ts) — roda imediatamente (não espera o
// primeiro intervalo completo) e depois a cada INTERVALO_MS (default 1h,
// configurável via DOWNGRADE_SCHEDULER_INTERVALO_MS) — mesmo padrão de
// iniciarSchedulerAlertasTrial.
export function iniciarSchedulerDowngrade(): void {
  executarUmaVez()
  setInterval(executarUmaVez, INTERVALO_MS)
}
