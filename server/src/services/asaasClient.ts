import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

// ─── Asaas (gateway de pagamento) — fundação/sandbox ───────────────────────
// Fase 1: vincular Tenant/Plano ao Asaas, criar cliente/assinatura em
// sandbox e processar webhooks de pagamento/assinatura. Nunca usado em
// produção nesta fase (ver obterConfigAsaas) — sem checkout público, sem
// split, sem nota fiscal, sem reembolso, sem cobrança real.

const BASE_URL_SANDBOX = 'https://api-sandbox.asaas.com/v3'

interface ConfigAsaas {
  apiKey: string
  baseUrl: string
}

// Lida com a config só na hora de usar (nunca no boot do servidor) — a
// integração Asaas é opcional nesta fase, um deploy sem nenhuma variável
// configurada continua subindo normalmente; só as chamadas que de fato
// precisam do Asaas falham, com uma mensagem clara.
//
// Produção fica deliberadamente bloqueada nesta fase (regra explícita da
// tarefa: "sandbox apenas, nunca produção") — mesmo que alguém configure
// ASAAS_ENV=production, a chamada nunca chega a sair pra api.asaas.com.
function obterConfigAsaas(): ConfigAsaas {
  const ambiente = (process.env.ASAAS_ENV?.trim().toLowerCase() || 'sandbox')
  if (ambiente !== 'sandbox') {
    throw new Error(
      `ASAAS_ENV="${ambiente}" não é permitido nesta fase da integração (fundação sandbox apenas). Use ASAAS_ENV=sandbox ou deixe a variável vazia.`
    )
  }
  const apiKey = process.env.ASAAS_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ASAAS_API_KEY não configurada. Defina no .env para usar a integração Asaas (ver .env.example).')
  }
  return { apiKey, baseUrl: BASE_URL_SANDBOX }
}

// Nunca loga a API key — só o corpo de erro que o próprio Asaas devolveu
// (que não contém a key de volta).
async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey, baseUrl } = obterConfigAsaas()
  const resposta = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
      'User-Agent': 'UserPulse-sandbox/1.0',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const texto = await resposta.text()
  let corpo: unknown = null
  if (texto) {
    try {
      corpo = JSON.parse(texto)
    } catch {
      corpo = texto
    }
  }
  if (!resposta.ok) {
    const detalhe =
      corpo && typeof corpo === 'object' && 'errors' in (corpo as Record<string, unknown>)
        ? JSON.stringify((corpo as { errors: unknown }).errors)
        : texto
    throw new Error(`Asaas respondeu ${resposta.status}: ${detalhe || 'sem detalhe'}`)
  }
  return corpo as T
}

export interface ClienteAsaas {
  id: string
  name: string
  cpfCnpj: string
  [chave: string]: unknown
}

// Dados de cobrança persistidos no Tenant (Fase 2, ver billing_* no schema)
// repassados ao Asaas na criação/atualização do customer — nunca logados
// aqui (ver comentário em adminTenantsAsaas.ts sobre não logar cpfCnpj).
// cidade/estado ficam de fora do payload Asaas de propósito: o campo "city"
// da API Asaas espera um código IBGE, não texto livre — Asaas já resolve
// cidade/estado a partir do postalCode enviado, então billing_cidade/
// billing_estado servem só pra exibição no painel, nunca são enviados.
export interface DadosCobrancaAsaas {
  nome: string
  cpfCnpj: string
  email?: string | null
  telefone?: string | null
  cep?: string | null
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
}

function corpoClienteAsaas(dados: DadosCobrancaAsaas) {
  return {
    name: dados.nome,
    cpfCnpj: dados.cpfCnpj,
    email: dados.email || undefined,
    phone: dados.telefone || undefined,
    postalCode: dados.cep || undefined,
    address: dados.endereco || undefined,
    addressNumber: dados.numero || undefined,
    complement: dados.complemento || undefined,
    province: dados.bairro || undefined,
  }
}

export async function criarClienteAsaas(tenant: { id: string }, dados: DadosCobrancaAsaas): Promise<ClienteAsaas> {
  return asaasFetch<ClienteAsaas>('/customers', {
    method: 'POST',
    body: JSON.stringify({ ...corpoClienteAsaas(dados), externalReference: tenant.id }),
  })
}

// Atualiza um customer já existente no Asaas — usado quando o SUPER_ADMIN
// edita os dados de cobrança de um tenant que já tem asaas_customer_id (ver
// atualizarDadosCobranca em adminTenantsAsaas.ts). Mesma convenção de
// endpoint do Asaas pra update (POST em vez de PUT, igual à criação).
export async function atualizarClienteAsaas(customerId: string, dados: DadosCobrancaAsaas): Promise<ClienteAsaas> {
  return asaasFetch<ClienteAsaas>(`/customers/${encodeURIComponent(customerId)}`, {
    method: 'POST',
    body: JSON.stringify(corpoClienteAsaas(dados)),
  })
}

export interface AssinaturaAsaas {
  id: string
  status: string
  nextDueDate: string
  [chave: string]: unknown
}

const CICLOS_ASAAS_VALIDOS = new Set([
  'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY',
])

export async function criarAssinaturaAsaas(
  customerId: string,
  plano: { asaas_external_reference: string | null; asaas_subscription_value: Prisma.Decimal | number | string | null; asaas_billing_cycle: string | null },
  opcoes: { nextDueDate: string; billingType?: 'BOLETO' | 'PIX' | 'CREDIT_CARD' }
): Promise<AssinaturaAsaas> {
  if (plano.asaas_subscription_value == null) {
    throw new Error('Plano sem asaas_subscription_value configurado — não é possível criar a assinatura no Asaas.')
  }
  const ciclo = (plano.asaas_billing_cycle || 'MONTHLY').toUpperCase()
  if (!CICLOS_ASAAS_VALIDOS.has(ciclo)) {
    throw new Error(`asaas_billing_cycle inválido: "${plano.asaas_billing_cycle}".`)
  }
  return asaasFetch<AssinaturaAsaas>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: opcoes.billingType ?? 'BOLETO',
      value: Number(plano.asaas_subscription_value),
      cycle: ciclo,
      nextDueDate: opcoes.nextDueDate,
      externalReference: plano.asaas_external_reference || undefined,
    }),
  })
}

export async function buscarAssinaturaAsaas(id: string): Promise<AssinaturaAsaas> {
  return asaasFetch<AssinaturaAsaas>(`/subscriptions/${encodeURIComponent(id)}`)
}

export interface CobrancaAsaas {
  id: string
  status: string
  value: number
  customer: string
  subscription: string | null
  dueDate: string
  paymentDate: string | null
  billingType?: string
  description?: string | null
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  [chave: string]: unknown
}

export async function buscarCobrancaAsaas(id: string): Promise<CobrancaAsaas> {
  return asaasFetch<CobrancaAsaas>(`/payments/${encodeURIComponent(id)}`)
}

// Envelope de paginação padrão do Asaas pra endpoints de listagem —
// `totalCount`/`limit`/`offset` ficam de fora da Fase 3 (sem paginação de
// verdade no painel ainda), mas `hasMore` é repassado pra UI poder avisar
// que existem cobranças além do limite abaixo, sem precisar paginar.
interface ListaAsaas<T> {
  object: 'list'
  hasMore: boolean
  totalCount: number
  data: T[]
}

// Limite alto o bastante pra cobrir o histórico normal de uma assinatura
// mensal (~4 anos de cobranças) sem precisar paginar no painel — Fase 3 é
// só consulta/exibição, sem paginação de verdade ainda.
const LIMITE_COBRANCAS = 50

export interface CobrancasAsaasResultado {
  data: CobrancaAsaas[]
  hasMore: boolean
}

// Cobranças (histórico de pagamentos) de uma assinatura — usado pela seção
// "Cobranças" do painel (ver GET /api/admin/tenants/:id/asaas/payments em
// adminTenantsAsaas.ts). Read-only: nunca cria, altera ou cancela cobrança
// nenhuma, só lista o que o Asaas já tem. `hasMore` indica se há cobranças
// além das `LIMITE_COBRANCAS` retornadas (a UI só avisa, não pagina).
export async function listarCobrancasAsaas(subscriptionId: string): Promise<CobrancasAsaasResultado> {
  const resposta = await asaasFetch<ListaAsaas<CobrancaAsaas>>(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=${LIMITE_COBRANCAS}`
  )
  return { data: resposta.data, hasMore: resposta.hasMore }
}

// ─── Diagnóstico de billing (Fase 4) — read-only, sem efeito nenhum ────────
// Calcula uma situação "o que o Asaas diz agora" pra exibição no painel
// (ver GET .../asaas/diagnostico em adminTenantsAsaas.ts). NUNCA escreve em
// Tenant.status/licenca_*/plano, nunca chama tenantGuards, nunca cria/
// cancela/reembolsa nada no Asaas — puramente informativo pro SUPER_ADMIN.
//
// Decide direto pelo Subscription.status/Payment.status vindos AO VIVO do
// Asaas (buscarAssinaturaAsaas/listarCobrancasAsaas), não por
// Tenant.asaas_status — esse campo é só o último valor sincronizado/
// espelhado (pode estar desatualizado); o diagnóstico consulta o Asaas na
// hora. Não confundir com interpretarAsaasStatusAssinatura acima: aquela
// função resolve um problema diferente (o que confiar pra REATIVAR
// automaticamente via webhook), não o que mostrar num diagnóstico sob
// demanda.

export type SituacaoAsaasDecisao = 'OK' | 'INADIMPLENTE' | 'ASSINATURA_INATIVA' | 'INDETERMINADO'

export interface SituacaoAsaasResultado {
  decisao: SituacaoAsaasDecisao
  motivo: string
  statusAssinatura: string | null
  quantidadeCobrancasVencidas: number
}

// Entrada da decisão pura — o controller decide qual variante montar
// (sem vínculo Asaas, falha ao consultar, ou dados buscados com sucesso),
// nunca a própria calcularSituacaoAsaas faz I/O (mesmo padrão de
// mapearEventoAsaas/calcularAtualizacaoTenant acima). hasMore é o mesmo
// campo de listarCobrancasAsaas (LIMITE_COBRANCAS=50): true significa que
// existem cobranças além das analisadas aqui — sem isso, "nenhuma OVERDUE
// nas 50 mais recentes" seria lido como "nenhuma OVERDUE", o que é um falso
// OK quando a vencida está justamente fora do lote analisado.
export type EntradaSituacaoAsaas =
  | { tipo: 'sem_vinculo' }
  | { tipo: 'falha_consulta'; erro: string }
  | { tipo: 'dados'; assinatura: AssinaturaAsaas; cobrancas: CobrancaAsaas[]; hasMore: boolean }

// Decisão pura (sem banco/rede) da situação de billing — testável isolada
// (ver asaasClient.test.ts). Regras mínimas da Fase 4:
// 1. sem vínculo/assinatura           -> INDETERMINADO
// 2. assinatura INACTIVE ou EXPIRED   -> ASSINATURA_INATIVA
// 3. assinatura ACTIVE + cobrança OVERDUE analisada -> INADIMPLENTE
// 4. assinatura ACTIVE, nenhuma OVERDUE analisada, hasMore=false -> OK
// 4b. assinatura ACTIVE, nenhuma OVERDUE analisada, hasMore=true -> INDETERMINADO
//     (pode haver uma OVERDUE fora do lote de até 50 cobranças analisado —
//     ver comentário em EntradaSituacaoAsaas; sem paginação nesta fase, só
//     evita o falso OK)
// 5. falha ao consultar o Asaas       -> INDETERMINADO
// Um status de assinatura fora do domínio conhecido (Asaas introduzindo um
// valor novo no futuro) também cai em INDETERMINADO — nunca presume OK/
// ACTIVE por um valor desconhecido (mesmo espírito defensivo de
// interpretarAsaasStatusAssinatura, mas aqui o dado já vem fresco do Asaas,
// não é um problema de dado legado).
export function calcularSituacaoAsaas(entrada: EntradaSituacaoAsaas): SituacaoAsaasResultado {
  if (entrada.tipo === 'sem_vinculo') {
    return {
      decisao: 'INDETERMINADO',
      motivo: 'Tenant sem assinatura Asaas vinculada — nada para diagnosticar.',
      statusAssinatura: null,
      quantidadeCobrancasVencidas: 0,
    }
  }

  if (entrada.tipo === 'falha_consulta') {
    return {
      decisao: 'INDETERMINADO',
      motivo: `Não foi possível consultar o Asaas agora: ${entrada.erro}`,
      statusAssinatura: null,
      quantidadeCobrancasVencidas: 0,
    }
  }

  const statusAssinatura = entrada.assinatura.status
  const quantidadeCobrancasVencidas = entrada.cobrancas.filter(c => c.status === 'OVERDUE').length

  if (statusAssinatura === 'INACTIVE' || statusAssinatura === 'EXPIRED') {
    return {
      decisao: 'ASSINATURA_INATIVA',
      motivo: `Assinatura está ${statusAssinatura === 'INACTIVE' ? 'inativa' : 'expirada'} no Asaas.`,
      statusAssinatura,
      quantidadeCobrancasVencidas,
    }
  }

  if (statusAssinatura === 'ACTIVE' && quantidadeCobrancasVencidas > 0) {
    return {
      decisao: 'INADIMPLENTE',
      motivo: `Assinatura ativa, mas há ${quantidadeCobrancasVencidas} cobrança(s) vencida(s).`,
      statusAssinatura,
      quantidadeCobrancasVencidas,
    }
  }

  if (statusAssinatura === 'ACTIVE' && entrada.hasMore) {
    return {
      decisao: 'INDETERMINADO',
      motivo: 'Existem cobranças adicionais que não foram analisadas.',
      statusAssinatura,
      quantidadeCobrancasVencidas,
    }
  }

  if (statusAssinatura === 'ACTIVE') {
    return {
      decisao: 'OK',
      motivo: 'Assinatura ativa, sem cobranças vencidas.',
      statusAssinatura,
      quantidadeCobrancasVencidas,
    }
  }

  return {
    decisao: 'INDETERMINADO',
    motivo: `Status de assinatura retornado pelo Asaas não reconhecido: "${statusAssinatura}".`,
    statusAssinatura,
    quantidadeCobrancasVencidas,
  }
}

export async function cancelarAssinaturaAsaas(id: string): Promise<{ deleted: boolean; id: string }> {
  return asaasFetch(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ─── Mapeamento de eventos de webhook (função pura, sem banco) ─────────────
// Extrai só o que está no payload — nunca decide o que gravar no Tenant
// (isso é responsabilidade de tratarWebhookAsaas, que tem acesso ao Plano
// pra calcular o próximo vencimento). Testável isoladamente com payloads
// fixos (ver asaasClient.test.ts).

export type AcaoWebhookAsaas =
  | {
      tipo: 'pagamento_confirmado'
      paymentId: string
      customerId: string
      subscriptionId: string | null
      asaasStatus: string
      dataPagamento: Date
      dataVencimento: Date | null
    }
  | {
      tipo: 'pagamento_vencido'
      paymentId: string
      customerId: string
      subscriptionId: string | null
      asaasStatus: string
    }
  | {
      tipo: 'assinatura_cancelada'
      subscriptionId: string
      customerId: string | null
      asaasStatus: string
    }
  | { tipo: 'ignorado'; motivo: string }

// PAYMENT_CONFIRMED = pagamento confirmado mas fundos ainda não liberados;
// PAYMENT_RECEIVED = fundos já disponíveis. Fase 1 trata os dois como
// "confirmado" pra fins de liberar acesso — não há necessidade de distinguir
// as duas fases de liquidação nesta fundação.
const EVENTOS_PAGAMENTO_CONFIRMADO = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const EVENTOS_PAGAMENTO_VENCIDO = new Set(['PAYMENT_OVERDUE'])
// SUBSCRIPTION_DELETED/INACTIVATED tratados como "cancelada" — os demais
// eventos de assinatura (CREATED/UPDATED/SPLIT_DISABLED) não têm ação
// mapeada nesta fase.
const EVENTOS_ASSINATURA_CANCELADA = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])

export function mapearEventoAsaas(payloadBruto: unknown): AcaoWebhookAsaas {
  if (!payloadBruto || typeof payloadBruto !== 'object') {
    return { tipo: 'ignorado', motivo: 'payload não é um objeto.' }
  }
  const payload = payloadBruto as Record<string, unknown>
  const evento = typeof payload.event === 'string' ? payload.event : null
  if (!evento) {
    return { tipo: 'ignorado', motivo: 'campo "event" ausente ou inválido no payload.' }
  }

  if (EVENTOS_PAGAMENTO_CONFIRMADO.has(evento) || EVENTOS_PAGAMENTO_VENCIDO.has(evento)) {
    const payment = payload.payment
    if (!payment || typeof payment !== 'object') {
      return { tipo: 'ignorado', motivo: `evento "${evento}" sem objeto "payment" no payload.` }
    }
    const p = payment as Record<string, unknown>
    const paymentId = typeof p.id === 'string' ? p.id : null
    const customerId = typeof p.customer === 'string' ? p.customer : null
    if (!paymentId || !customerId) {
      return { tipo: 'ignorado', motivo: `evento "${evento}" com payment.id ou payment.customer ausente.` }
    }
    const subscriptionId = typeof p.subscription === 'string' ? p.subscription : null
    const asaasStatus = typeof p.status === 'string' ? p.status : evento

    if (EVENTOS_PAGAMENTO_CONFIRMADO.has(evento)) {
      const dataPagamentoBruta =
        (typeof p.paymentDate === 'string' && p.paymentDate) ||
        (typeof p.clientPaymentDate === 'string' && p.clientPaymentDate) ||
        null
      const dataPagamento = dataPagamentoBruta ? new Date(dataPagamentoBruta) : new Date()
      const dataVencimento = typeof p.dueDate === 'string' ? new Date(p.dueDate) : null
      return { tipo: 'pagamento_confirmado', paymentId, customerId, subscriptionId, asaasStatus, dataPagamento, dataVencimento }
    }
    return { tipo: 'pagamento_vencido', paymentId, customerId, subscriptionId, asaasStatus }
  }

  if (EVENTOS_ASSINATURA_CANCELADA.has(evento)) {
    const subscription = payload.subscription
    if (!subscription || typeof subscription !== 'object') {
      return { tipo: 'ignorado', motivo: `evento "${evento}" sem objeto "subscription" no payload.` }
    }
    const s = subscription as Record<string, unknown>
    const subscriptionId = typeof s.id === 'string' ? s.id : null
    if (!subscriptionId) {
      return { tipo: 'ignorado', motivo: `evento "${evento}" com subscription.id ausente.` }
    }
    const customerId = typeof s.customer === 'string' ? s.customer : null
    return { tipo: 'assinatura_cancelada', subscriptionId, customerId, asaasStatus: evento }
  }

  return { tipo: 'ignorado', motivo: `evento "${evento}" não mapeado nesta fase.` }
}

// ─── Cálculo de próximo vencimento (função pura, sem banco) ────────────────
// Usado só quando um pagamento é confirmado, pra estimar licenca_fim/
// proxima_cobranca a partir do ciclo configurado no Plano — o Asaas não
// manda a "próxima" data no payload de PAYMENT_RECEIVED/CONFIRMED (só a
// dueDate do pagamento que acabou de ser confirmado), então o cálculo
// avança essa data pelo ciclo do plano. MONTHLY como padrão se o plano não
// tiver asaas_billing_cycle definido (mesmo default do schema).

const CICLOS_EM_DIAS: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14 }
const CICLOS_EM_MESES: Record<string, number> = { MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 }

export function calcularProximoVencimento(dataBase: Date, ciclo: string | null | undefined): Date {
  const cicloNormalizado = (ciclo || 'MONTHLY').toUpperCase()
  if (cicloNormalizado in CICLOS_EM_DIAS) {
    return new Date(dataBase.getTime() + CICLOS_EM_DIAS[cicloNormalizado] * 86_400_000)
  }
  const meses = CICLOS_EM_MESES[cicloNormalizado] ?? 1
  const resultado = new Date(dataBase)
  resultado.setMonth(resultado.getMonth() + meses)
  return resultado
}

// ─── Processamento do webhook (com banco — idempotência + efeito no Tenant) ─

export interface ResultadoWebhookAsaas {
  ok: true
  duplicado?: boolean
  ignorado?: string
  semTenantVinculado?: boolean
}

function extrairEventId(payload: unknown): string | null {
  if (payload && typeof payload === 'object') {
    const id = (payload as Record<string, unknown>).id
    if (typeof id === 'string' && id) return id
  }
  return null
}

function extrairEventoNome(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const evento = (payload as Record<string, unknown>).event
    if (typeof evento === 'string' && evento) return evento
  }
  return 'DESCONHECIDO'
}

function montarDadosEvento(eventId: string | null, payload: unknown, acao: AcaoWebhookAsaas): Prisma.AsaasWebhookEventCreateInput {
  const base = {
    asaas_event_id: eventId,
    evento: extrairEventoNome(payload),
    payload: payload as Prisma.InputJsonValue,
  }
  switch (acao.tipo) {
    case 'pagamento_confirmado':
    case 'pagamento_vencido':
      return { ...base, payment_id: acao.paymentId, customer_id: acao.customerId, subscription_id: acao.subscriptionId }
    case 'assinatura_cancelada':
      return { ...base, customer_id: acao.customerId, subscription_id: acao.subscriptionId }
    case 'ignorado':
      return base
  }
}

export interface AtualizacaoTenantAsaas {
  // null = não mexe no Tenant nesta chamada (ex.: pagamento confirmado
  // chegando fora de ordem depois da assinatura já estar inativa/expirada).
  dados: Prisma.TenantUpdateInput | null
  // Só presente quando dados===null — motivo gravado no AsaasWebhookEvent
  // (ver tratarWebhookAsaas), pra ficar rastreável no histórico de eventos
  // do painel mesmo sem efeito nenhum no Tenant.
  ignorado?: string
}

// Domínio real de Subscription.status no Asaas — os únicos 3 valores em que
// dá pra confiar como "isto é status de ASSINATURA" (mesmo domínio que
// sincronizar()/criarAssinaturaAsaas escrevem, ver buscarAssinaturaAsaas).
const ASSINATURA_STATUS_CONHECIDOS = new Set(['ACTIVE', 'EXPIRED', 'INACTIVE'])

// Legado da versão anterior desta correção: SUBSCRIPTION_DELETED/
// INACTIVATED gravavam o nome bruto do evento em asaas_status (em vez de
// "INACTIVE"). Dado inequívoco — o nome do evento já diz que a assinatura
// foi excluída/inativada — por isso é o único caso de tradução aceito aqui;
// não existe equivalente pra status de PAGAMENTO (ver função abaixo).
const ASAAS_STATUS_LEGADO_INATIVO = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])

// Interpreta Tenant.asaas_status como status de ASSINATURA — nunca infere a
// partir de status de PAGAMENTO (CONFIRMED, RECEIVED, OVERDUE, ...), mesmo
// que esses valores tenham ficado gravados ali pela versão anterior desta
// correção (webhooks de pagamento sobrescreviam o campo). Só os 3 valores
// reais do domínio Subscription.status, mais os 2 nomes de evento de
// cancelamento legados acima, são reconhecidos — qualquer outra coisa
// (null, status de pagamento herdado, valor desconhecido) volta
// "desconhecido", nunca "ACTIVE" por suposição.
function interpretarAsaasStatusAssinatura(valor: string | null): 'ACTIVE' | 'EXPIRED' | 'INACTIVE' | 'desconhecido' {
  if (valor && ASSINATURA_STATUS_CONHECIDOS.has(valor)) return valor as 'ACTIVE' | 'EXPIRED' | 'INACTIVE'
  if (valor && ASAAS_STATUS_LEGADO_INATIVO.has(valor)) return 'INACTIVE'
  return 'desconhecido'
}

// Decisão pura (sem banco) do que gravar no Tenant a partir de uma ação já
// mapeada (mapearEventoAsaas) — separada de tratarWebhookAsaas só pra poder
// ser testada sem Prisma/banco (mesmo padrão de mapearEventoAsaas acima).
//
// asaas_status passa a significar EXCLUSIVAMENTE status de ASSINATURA
// (mesmo domínio que sincronizar()/criarAssinaturaAsaas já escrevem: Asaas
// usa ACTIVE/EXPIRED/INACTIVE pra Subscription.status). Eventos de
// pagamento (PAYMENT_*) nunca tocam este campo — antes um PAYMENT_CONFIRMED/
// OVERDUE sobrescrevia asaas_status com o status do PAGAMENTO (ex.:
// "CONFIRMED", "OVERDUE"), misturando os dois domínios. SUBSCRIPTION_DELETED/
// INACTIVATED gravam o valor real de assinatura inativa do Asaas
// ("INACTIVE"), nunca o nome bruto do evento.
export function calcularAtualizacaoTenant(
  acao: Extract<AcaoWebhookAsaas, { tipo: 'pagamento_confirmado' | 'pagamento_vencido' | 'assinatura_cancelada' }>,
  tenantAtual: { asaas_status: string | null; licenca_inicio: Date | null },
  cicloPlano: string | null,
  agora: Date = new Date()
): AtualizacaoTenantAsaas {
  if (acao.tipo === 'assinatura_cancelada') {
    // SUSPENDED (não CANCELED) de propósito: automação nunca marca CANCELED
    // (estado definitivo, "contrato encerrado" na semântica já usada em
    // Tenants.tsx/tenantGuards.ts) — só SUSPENDED, reversível, deixando o
    // cancelamento de verdade como decisão manual do super admin.
    return { dados: { asaas_status: 'INACTIVE', asaas_ultima_sincronizacao: agora, status: 'SUSPENDED' } }
  }

  if (acao.tipo === 'pagamento_vencido') {
    // Nunca mexe em status/licenca_fim/asaas_status aqui — o bloqueio por
    // licenca_fim vencida (ver motivoBloqueioEscrita em tenantGuards.ts) já
    // cuida disso sozinho quando a data efetivamente chegar, sem precisar
    // de uma ação explícita de cancelamento. Só registra que ouvimos o
    // Asaas agora.
    return { dados: { asaas_ultima_sincronizacao: agora } }
  }

  // pagamento_confirmado — só ativa quando o asaas_status atual é
  // CONFIRMADAMENTE "ACTIVE" (allowlist, não blocklist). Cobre dois riscos:
  // (1) webhook fora de ordem — SUBSCRIPTION_DELETED/INACTIVATED processado
  // primeiro, depois um PAYMENT_CONFIRMED antigo/reentregue chega e
  // tentaria voltar pra ACTIVE; (2) dado legado — asaas_status pode conter
  // um status de PAGAMENTO ("CONFIRMED", "OVERDUE", ...) ou o nome bruto de
  // um evento de cancelamento, gravados pela versão anterior desta
  // correção. Em ambos os casos "não confiavelmente ACTIVE" bloqueia — só o
  // valor real "ACTIVE" libera a reativação automática, nunca uma
  // suposição em cima de status de pagamento.
  const statusAssinatura = interpretarAsaasStatusAssinatura(tenantAtual.asaas_status)
  if (statusAssinatura !== 'ACTIVE') {
    const ignorado = statusAssinatura === 'desconhecido'
      ? `Pagamento confirmado ignorado: asaas_status atual ("${tenantAtual.asaas_status ?? 'vazio'}") não é um status de assinatura confiável (pode ser dado legado de pagamento) — sincronize manualmente com o Asaas antes de confiar neste tenant.`
      : `Pagamento confirmado ignorado: assinatura já registrada como ${statusAssinatura === 'INACTIVE' ? 'inativa' : 'expirada'} no Asaas (evento possivelmente fora de ordem).`
    // erro aqui não é "falha de processamento" — é o mesmo uso já dado a
    // este campo pro caso "sem tenant vinculado" logo acima (decisão de
    // negócio esperada, sempre ok:true/2xx pro Asaas), só com uma
    // explicação registrada pra ficar rastreável no histórico do painel.
    return { dados: null, ignorado }
  }

  const proximoVencimento = calcularProximoVencimento(acao.dataVencimento ?? acao.dataPagamento, cicloPlano)
  return {
    dados: {
      asaas_ultima_sincronizacao: agora,
      status: 'ACTIVE',
      ultimo_pagamento_em: acao.dataPagamento,
      licenca_inicio: tenantAtual.licenca_inicio ?? acao.dataPagamento,
      licenca_fim: proximoVencimento,
      proxima_cobranca: proximoVencimento,
    },
  }
}

// Ponto único chamado pelo controller do webhook (ver
// controllers/webhooksAsaas.ts) — faz idempotência (via asaas_event_id),
// mapeamento (mapearEventoAsaas) e aplica o efeito no Tenant vinculado
// (calcularAtualizacaoTenant). Sempre resolve com ok:true (2xx pro Asaas)
// exceto quando algo realmente inesperado lança (erro de banco etc.) — o
// controller trata esse throw como erro controlado (não-2xx).
export async function tratarWebhookAsaas(payloadBruto: unknown): Promise<ResultadoWebhookAsaas> {
  const eventId = extrairEventId(payloadBruto)

  if (eventId) {
    const existente = await prisma.asaasWebhookEvent.findUnique({ where: { asaas_event_id: eventId } })
    if (existente?.processado) {
      return { ok: true, duplicado: true }
    }
  }

  const acao = mapearEventoAsaas(payloadBruto)

  // Registra o evento ANTES de aplicar qualquer efeito — se algo falhar daqui
  // pra frente, fica um rastro no banco (processado=false) em vez de perder
  // o webhook silenciosamente. upsert protege contra corrida entre duas
  // entregas simultâneas do mesmo evento (unique constraint no banco).
  const evento = eventId
    ? await prisma.asaasWebhookEvent.upsert({
        where: { asaas_event_id: eventId },
        create: montarDadosEvento(eventId, payloadBruto, acao),
        update: {},
      })
    : await prisma.asaasWebhookEvent.create({ data: montarDadosEvento(null, payloadBruto, acao) })

  if (acao.tipo === 'ignorado') {
    await prisma.asaasWebhookEvent.update({
      where: { id: evento.id },
      data: { processado: true, processado_em: new Date() },
    })
    return { ok: true, ignorado: acao.motivo }
  }

  const condicoes: Prisma.TenantWhereInput[] = []
  if (acao.customerId) condicoes.push({ asaas_customer_id: acao.customerId })
  if (acao.subscriptionId) condicoes.push({ asaas_subscription_id: acao.subscriptionId })

  const tenant = condicoes.length > 0
    ? await prisma.tenant.findFirst({ where: { OR: condicoes }, include: { plano: true } })
    : null

  if (!tenant) {
    await prisma.asaasWebhookEvent.update({
      where: { id: evento.id },
      data: { processado: true, processado_em: new Date(), erro: 'Nenhum tenant vinculado a este customer/subscription Asaas.' },
    })
    return { ok: true, semTenantVinculado: true }
  }

  const resultado = calcularAtualizacaoTenant(acao, tenant, tenant.plano?.asaas_billing_cycle ?? null)

  if (resultado.dados === null) {
    await prisma.asaasWebhookEvent.update({
      where: { id: evento.id },
      data: { processado: true, processado_em: new Date(), erro: resultado.ignorado ?? null },
    })
    return { ok: true, ignorado: resultado.ignorado }
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: resultado.dados })
  await prisma.asaasWebhookEvent.update({
    where: { id: evento.id },
    data: { processado: true, processado_em: new Date() },
  })

  return { ok: true }
}
