import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { obterSituacaoComercialTenant, diasRestantesTrial } from '../lib/tenantGuards'
import {
  decidirMarcoAlertaTrial, deveEnviarAlerta, filtroDestinatariosTrialAtivos,
  TRAVA_ENVIANDO_STALE_MS, type MarcoAlertaTrial,
} from '../lib/trialAlertas'
import { emailService } from '../lib/email/EmailService'

// ─── Fase 6D — scheduler interno dos alertas de trial ───────────────────────
// Sem serviço pago externo (regra explícita da tarefa): setInterval dentro
// do próprio processo Node (ver iniciarSchedulerAlertasTrial, chamado uma
// vez em index.ts). Não depende de horário exato — cada execução só olha o
// estado ATUAL de cada tenant (via decidirMarcoAlertaTrial, stateless) e
// nunca lança/reenvia marcos que já passaram. Idempotência real vive no
// banco (tabela trial_email_alertas, ver schema.prisma) — sobrevive a
// reinício/deploy do processo sem duplicar nada.

// Só tenants com status=TRIAL entram aqui (primeira camada de defesa contra
// enviar pra pago/suspenso/cancelado — decidirMarcoAlertaTrial é a segunda,
// caso este filtro mude no futuro). trial_fim null nunca gera marco (trial
// sem prazo definido, ver diasRestantesTrial) — sem necessidade de excluir
// na query, decidirMarcoAlertaTrial já devolve null nesse caso.
async function buscarTenantsElegiveis(agora: Date) {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'TRIAL' },
    select: { id: true, nome: true, status: true, trial_fim: true, licenca_fim: true },
  })
  return tenants
    .map(t => ({ tenant: t, marco: decidirMarcoAlertaTrial(obterSituacaoComercialTenant(t, agora), diasRestantesTrial(t.trial_fim, agora)) }))
    .filter((x): x is { tenant: typeof tenants[number]; marco: MarcoAlertaTrial } => x.marco != null)
}

function urlMinhaAssinatura(): string {
  return `${process.env.APP_URL || 'http://localhost:5173'}/minha-assinatura`
}

// Reivindica atomicamente o direito de tentar enviar — corrige uma brecha
// de concorrência (2+ instâncias do processo, ou uma execução sobreposta a
// outra) que a unique constraint sozinha NÃO fechava: ela só protege a
// CRIAÇÃO inicial (create() com P2002), mas duas instâncias podiam ler o
// MESMO registro já existente com status=FALHOU e as duas tentarem enviar,
// duplicando o e-mail. Agora, tentar reivindicar sempre passa por uma
// operação atômica no banco:
// - registro novo: create() direto com status=ENVIANDO — só uma instância
//   consegue (a unique constraint barra a segunda com P2002).
// - registro já existe: updateMany() condicional (WHERE status=FALHOU OU
//   ENVIANDO-travado-há-muito-tempo) que só afeta 1 linha pra quem
//   "ganhar" a corrida — o Postgres serializa UPDATEs concorrentes na mesma
//   linha, então a segunda instância nunca vê mais o status antigo e conta
//   0 linhas afetadas, desistindo desta rodada sem tentar enviar.
// Devolve o id do registro reivindicado, ou null se não havia nada pra
// reivindicar (já ENVIADO, ou sendo processado agora por outra instância).
async function reivindicarRegistro(
  tenantId: string,
  marco: MarcoAlertaTrial,
  destinatarioEmail: string,
  agora: Date
): Promise<string | null> {
  try {
    const criado = await prisma.trialEmailAlerta.create({
      data: { tenant_id: tenantId, marco, destinatario_email: destinatarioEmail, status: 'ENVIANDO', tentativas: 1 },
    })
    return criado.id
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
  }

  const limiteStale = new Date(agora.getTime() - TRAVA_ENVIANDO_STALE_MS)
  const reivindicado = await prisma.trialEmailAlerta.updateMany({
    where: {
      tenant_id: tenantId,
      marco,
      destinatario_email: destinatarioEmail,
      OR: [{ status: 'FALHOU' }, { status: 'ENVIANDO', atualizado_em: { lt: limiteStale } }],
    },
    data: { status: 'ENVIANDO', tentativas: { increment: 1 } },
  })
  if (reivindicado.count !== 1) return null

  const registro = await prisma.trialEmailAlerta.findUniqueOrThrow({
    where: { tenant_id_marco_destinatario_email: { tenant_id: tenantId, marco, destinatario_email: destinatarioEmail } },
  })
  return registro.id
}

async function processarDestinatario(
  tenantId: string,
  marco: MarcoAlertaTrial,
  destinatario: { nome: string; email: string },
  agora: Date
): Promise<void> {
  const registroAtual = await prisma.trialEmailAlerta.findUnique({
    where: { tenant_id_marco_destinatario_email: { tenant_id: tenantId, marco, destinatario_email: destinatario.email } },
  })
  if (!deveEnviarAlerta(registroAtual, agora)) return

  const registroId = await reivindicarRegistro(tenantId, marco, destinatario.email, agora)
  if (!registroId) return // outra instância reivindicou primeiro, ou já foi enviado entre a checagem acima e agora

  try {
    // Fase 6D (correção) — sem provider configurado, EmailService resolve
    // silenciosamente (comportamento intencional pros e-mails best-effort
    // de boas-vindas/redefinição de senha) em vez de lançar. Pro scheduler
    // isso NUNCA pode contar como sucesso: sem checar aqui, o alerta seria
    // marcado ENVIADO sem nenhum e-mail de verdade ter saído, perdendo o
    // alerta pra sempre (ENVIADO nunca é revisitado). Falha aqui cai no
    // catch abaixo, mantendo o registro FALHOU e retryable.
    if (!emailService.providerConfigurado) {
      throw new Error('Nenhum provider de e-mail configurado (EMAIL_PROVIDER ausente).')
    }
    await emailService.enviarAlertaTrial(
      destinatario.email,
      marco,
      { nomeResponsavel: destinatario.nome, urlAssinatura: urlMinhaAssinatura() },
      // idempotencyKey estável por tenant+marco+destinatário (nunca por
      // tentativa) — mesmo padrão de boas-vindas/redefinição de senha em
      // controllers/auth.ts: um retry do provider (timeout, etc.) nunca
      // duplica o envio do lado dele.
      { idempotencyKey: `trial-alerta:${marco}:${tenantId}:${destinatario.email}` }
    )
    await prisma.trialEmailAlerta.update({
      where: { id: registroId },
      data: { status: 'ENVIADO', enviado_em: agora },
    })
  } catch (err) {
    console.error(`Erro ao enviar alerta de trial (${marco}) para ${destinatario.email}:`, err)
    await prisma.trialEmailAlerta.update({
      where: { id: registroId },
      data: { status: 'FALHOU', ultimo_erro: err instanceof Error ? err.message : String(err) },
    }).catch(() => {})
  }
}

// Ponto de entrada de uma execução do scheduler — sequencial de propósito
// (nunca Promise.all entre tenants/destinatários) pra nunca disparar duas
// criações concorrentes do MESMO registro de idempotência a partir desta
// mesma execução (a proteção contra corrida ENTRE execuções continua sendo
// a constraint única do banco, ver processarDestinatario acima).
export async function processarAlertasTrial(agora: Date = new Date()): Promise<void> {
  const elegiveis = await buscarTenantsElegiveis(agora)
  for (const { tenant, marco } of elegiveis) {
    const destinatarios = await prisma.adminUser.findMany({
      where: filtroDestinatariosTrialAtivos(tenant.id),
      select: { nome: true, email: true },
    })
    for (const destinatario of destinatarios) {
      await processarDestinatario(tenant.id, marco, destinatario, agora)
    }
  }
}

const INTERVALO_MS = Number(process.env.TRIAL_ALERTAS_INTERVALO_MS) || 60 * 60 * 1000

// Trava simples contra sobreposição: se uma execução ainda estiver em
// andamento quando o próximo tick do setInterval disparar (processamento
// mais lento que o intervalo, ou muitos tenants), o próximo tick só é
// ignorado — nunca acumula/empilha execuções concorrentes do job inteiro.
let executando = false

function executarUmaVez(): void {
  if (executando) return
  executando = true
  processarAlertasTrial()
    .catch(err => console.error('Erro ao processar alertas de trial:', err))
    .finally(() => { executando = false })
}

// Fase 6D (correção pós-revisão) — kill switch mínimo por env, sem
// nenhuma infraestrutura nova: TRIAL_ALERTAS_SCHEDULER=off desliga o
// scheduler inteiro (nem a execução imediata do boot roda). Nunca ligado
// por padrão em lugar nenhum — index.ts é o único import deste módulo (não
// é importado pelos testes de node:test, que só importam funções puras
// individuais), então em `npm test` o scheduler já nunca chega a existir.
// Este switch é pra dev local: `tsx watch` reinicia o processo inteiro a
// cada arquivo salvo, e cada reinício reexecuta o scheduler imediatamente
// — útil na maior parte do tempo (idempotência real está no banco, então
// isso nunca duplica e-mail nem marca falso ENVIADO), mas configurável se
// alguém preferir não ter essas execuções repetidas rodando localmente.
const SCHEDULER_DESLIGADO = process.env.TRIAL_ALERTAS_SCHEDULER === 'off'

// Chamado uma vez no boot (ver index.ts) — roda imediatamente (não espera o
// primeiro intervalo completo) e depois a cada INTERVALO_MS (default 1h,
// configurável via TRIAL_ALERTAS_INTERVALO_MS só pra facilitar teste manual
// local, nunca usado em produção). setInterval sozinho (sem cron/serviço
// externo) é suficiente aqui porque a idempotência real está no banco, não
// no timing da execução.
export function iniciarSchedulerAlertasTrial(): void {
  if (SCHEDULER_DESLIGADO) {
    console.log('[trial-alertas] Scheduler desligado via TRIAL_ALERTAS_SCHEDULER=off.')
    return
  }
  executarUmaVez()
  setInterval(executarUmaVez, INTERVALO_MS)
}
