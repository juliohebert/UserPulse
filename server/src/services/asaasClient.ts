import { Prisma, TenantStatus } from '@prisma/client'
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
  billingType?: string
  [chave: string]: unknown
}

const CICLOS_ASAAS_VALIDOS = new Set([
  'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY',
])

// billingType aceita 'UNDEFINED' (Fase 5, self-service) além dos 3 fixos —
// é o valor que o próprio Asaas usa pra "deixar o pagador escolher o meio de
// pagamento na página hospedada" (Pix ou cartão), em vez do UserPulse
// decidir por ele. Continua opcional: SUPER_ADMIN (criarAssinatura em
// adminTenantsAsaas.ts) segue mandando BOLETO/PIX/CREDIT_CARD explícito ou
// nada (default BOLETO abaixo), comportamento inalterado.
export async function criarAssinaturaAsaas(
  customerId: string,
  plano: { asaas_external_reference: string | null; asaas_subscription_value: Prisma.Decimal | number | string | null; asaas_billing_cycle: string | null },
  opcoes: { nextDueDate: string; billingType?: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED' }
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

// ─── Upgrade de plano self-service (Fase 8A) ────────────────────────────────
// Cobrança AVULSA (fora do ciclo da assinatura) — usada só pra cobrar a
// diferença proporcional do upgrade (ver calcularValorProporcionalUpgrade
// abaixo). Nunca tem `subscription`: se tivesse, o Asaas trataria como uma
// cobrança do próprio ciclo recorrente, o que criaria uma cobrança extra
// inesperada na assinatura em vez de um cobrança avulsa única. billingType
// fixo em 'UNDEFINED' (mesmo padrão de criarAssinaturaAsaas — quem escolhe
// Pix ou cartão é o pagador, na página hospedada).
export interface DadosCobrancaAvulsaAsaas {
  value: number
  dueDate: string
  description: string
  externalReference?: string
}

export async function criarCobrancaAvulsaAsaas(customerId: string, dados: DadosCobrancaAvulsaAsaas): Promise<CobrancaAsaas> {
  return asaasFetch<CobrancaAsaas>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'UNDEFINED',
      value: dados.value,
      dueDate: dados.dueDate,
      description: dados.description,
      externalReference: dados.externalReference,
    }),
  })
}

// Atualiza o VALOR da assinatura recorrente já existente — usado só depois
// que um upgrade é confirmado (ver tratarWebhookAsaas), pra garantir que o
// PRÓXIMO ciclo cobre o valor cheio do plano novo (a cobrança avulsa acima
// só cobre a diferença proporcional do ciclo atual, nunca ajusta o valor
// recorrente sozinha). Chamar de novo com o MESMO valor é seguro/idempotente
// — o Asaas simplesmente regrava o mesmo número, sem efeito colateral —
// então um retry deste PUT (reentrega de webhook, nova tentativa após falha)
// nunca duplica nem distorce nada.
//
// updatePendingPayments:true (correção pós-revisão) — cobre o caso do Asaas
// já ter gerado a cobrança do PRÓXIMO ciclo antes deste upgrade ser
// confirmado: sem isso, essa cobrança PENDING ficaria com o valor antigo
// até o ciclo seguinte. Só afeta cobranças PENDING da PRÓPRIA assinatura
// (nunca a cobrança avulsa da diferença proporcional, que nunca tem
// `subscription` vinculada — ver criarCobrancaAvulsaAsaas — então este PUT
// estruturalmente não alcança ela). O risco de bumping indevido de uma
// cobrança PENDING do ciclo ATUAL (ainda não vencida) é mitigado por quem
// chama este código nunca deixar solicitar upgrade fora de "em dia" (ver
// validarECalcularUpgrade em controllers/billing.ts) — só permitido sem
// nenhuma cobrança vencida em aberto, então a única PENDING esperada na
// assinatura nesse momento é a do próximo ciclo.
export async function atualizarValorAssinaturaAsaas(subscriptionId: string, value: number): Promise<AssinaturaAsaas> {
  return asaasFetch<AssinaturaAsaas>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'PUT',
    body: JSON.stringify({ value, updatePendingPayments: true }),
  })
}

// Regularização self-service (Fase 5) — libera a escolha do meio de
// pagamento numa cobrança PENDING/OVERDUE já existente (sem isso, uma
// cobrança criada com billingType fixo, ex. BOLETO, só aceitaria boleto na
// invoiceUrl). Nunca cria cobrança nova, nunca muda customer/subscription —
// só billingType (ver validarCobrancaParaRegularizacao abaixo, que já
// barrou qualquer cobrança que não seja PENDING/OVERDUE ou que não pertença
// à assinatura do tenant antes de chegar aqui).
//
// value/dueDate são reenviados de propósito, mesmo sem mudar — o PUT
// /payments do Asaas não documenta claramente semântica de patch parcial
// pra todo campo, então preferimos sempre reafirmar os valores que já
// estavam na cobrança (lidos por buscarCobrancaAsaas no controller, nunca
// do body do cliente) a arriscar o Asaas interpretar um campo omitido como
// "zerar"/usar default. O caller (pagarCobranca em controllers/billing.ts)
// nunca aceita value/dueDate do frontend — só repassa o que já leu da
// própria cobrança buscada no Asaas. billingType aceita os 3 explícitos
// (correção de produto — cliente escolhe a forma só desta cobrança, ver
// validarFormaPagamentoSelfService) além de 'UNDEFINED' (mantido pra
// compatibilidade de tipo com o padrão já usado em criarAssinaturaAsaas,
// mesmo que pagarCobranca não mande mais esse valor).
export async function atualizarBillingTypeCobrancaAsaas(
  paymentId: string,
  dados: { billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'; value: number; dueDate: string }
): Promise<CobrancaAsaas> {
  return asaasFetch<CobrancaAsaas>(`/payments/${encodeURIComponent(paymentId)}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
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

// Busca a entrada pronta pra calcularSituacaoAsaas — compartilhada entre o
// diagnóstico do SUPER_ADMIN (Fase 4, ver diagnosticar em
// adminTenantsAsaas.ts) e a tela "Minha assinatura" self-service (Fase 5,
// ver controllers/billing.ts), pra não duplicar a mesma sequência de
// chamadas/try-catch nos dois lugares.
export async function buscarEntradaSituacaoAsaas(tenant: { asaas_subscription_id: string | null }): Promise<EntradaSituacaoAsaas> {
  if (!tenant.asaas_subscription_id) return { tipo: 'sem_vinculo' }
  try {
    const [assinatura, cobrancasResultado] = await Promise.all([
      buscarAssinaturaAsaas(tenant.asaas_subscription_id),
      listarCobrancasAsaas(tenant.asaas_subscription_id),
    ])
    return { tipo: 'dados', assinatura, cobrancas: cobrancasResultado.data, hasMore: cobrancasResultado.hasMore }
  } catch (err) {
    return { tipo: 'falha_consulta', erro: err instanceof Error ? err.message : 'Erro desconhecido ao consultar o Asaas.' }
  }
}

// ─── Pagamento self-service (Fase 5) — funções puras de validação ─────────
// Nenhuma delas faz I/O; os controllers (billing.ts) buscam o dado e só
// aplicam a decisão. Não usa Asaas Checkout nesta fase — reaproveita
// assinatura/cobrança/invoiceUrl já existentes (ver buscarAssinaturaAsaas,
// listarCobrancasAsaas, buscarCobrancaAsaas acima).

// Portão comum das 2 operações financeiras self-service que restam nesta
// Fase (criar assinatura, pagar cobrança) — bloqueia SOMENTE SUSPENDED e
// CANCELED. EXPIRED fica de propósito FORA deste bloqueio: regularizar uma
// licença vencida é exatamente o caso legítimo que o self-service existe
// pra resolver (ver regra 4 da tarefa desta correção). Não confundir com
// motivoBloqueioEscrita (tenantGuards.ts) — aquele bloqueia também
// TRIAL/licença vencidos pra escrita de conteúdo comum; este é mais
// estreito, só pra operação financeira, e mora aqui (não em
// tenantGuards.ts) por ser específico do domínio Asaas/self-service.
export function bloqueioOperacaoFinanceiraSelfService(status: TenantStatus): string | null {
  if (status === 'SUSPENDED' || status === 'CANCELED') {
    return 'Sua conta está suspensa ou cancelada. Entre em contato com o suporte para regularizar sua assinatura.'
  }
  return null
}

// Bloqueia geração de assinatura self-service pra plano interno (nunca
// oferecido a cliente comum, mesma regra de Planos.tsx/adminPlanos.ts), pro
// plano de trial (teste-gratis nunca é contratável como plano pago, mesmo
// que alguém envie o id dele direto — ver GET /billing/planos-disponiveis,
// que já nem lista esse plano) ou sem asaas_subscription_value configurado
// (nada a cobrar). Nunca valida asaas_billing_cycle aqui —
// criarAssinaturaAsaas já cai em MONTHLY por padrão quando ausente, sem
// precisar bloquear por isso.
//
// Fase 6B: passou a validar o plano ESCOLHIDO pelo cliente (plano_id do
// body de POST /billing/assinatura), não mais tenant.plano — daí a
// mensagem de "plano nulo" ter mudado de "Tenant sem plano vinculado" pra
// "Plano não encontrado" (agora reflete um id inválido/inexistente, não
// mais a ausência de plano_id no Tenant).
export function validarPlanoParaAssinaturaSelfService(
  plano: { interno: boolean; eh_plano_trial: boolean; asaas_subscription_value: Prisma.Decimal | number | string | null } | null
): string | null {
  if (!plano) return 'Plano não encontrado.'
  if (plano.interno) return 'Este plano não está disponível para contratação self-service — entre em contato com o suporte.'
  if (plano.eh_plano_trial) return 'O plano de teste grátis não pode ser contratado como plano pago.'
  if (plano.asaas_subscription_value == null) return 'Plano sem valor de assinatura configurado — entre em contato com o suporte.'
  return null
}

// Correção de produto — a PRIMEIRA assinatura self-service (POST
// /billing/assinatura) deixou de mandar billingType:'UNDEFINED' (que
// deixava o Asaas decidir o que mostrar na página hospedada, indesejado
// aqui). O cliente agora escolhe explicitamente entre Cartão de crédito,
// Pix ou Boleto na própria tela do UserPulse — só o enum validado aqui
// chega até criarAssinaturaAsaas, nunca o valor cru do body. UNDEFINED
// continua fora do self-service de propósito (ainda é usado só pela Gestão
// SaaS, ver resolverBillingTypeGestaoSaas em adminTenantsAsaas.ts) — o
// objetivo aqui é justamente nunca deixar a forma de pagamento implícita.
export function validarFormaPagamentoSelfService(valor: unknown): 'CREDIT_CARD' | 'PIX' | 'BOLETO' | null {
  return valor === 'CREDIT_CARD' || valor === 'PIX' || valor === 'BOLETO' ? valor : null
}

// Regularização de cobrança vencida ("Pagar") — confirma que a cobrança
// pertence à assinatura do tenant da sessão (nunca de outro tenant) e que
// ainda está pendente/vencida (nunca prepara de novo uma cobrança já paga,
// nem cria uma cobrança nova — só libera billingType na existente, ver
// atualizarBillingTypeCobrancaAsaas acima).
export function validarCobrancaParaRegularizacao(
  cobranca: { subscription: string | null; status: string },
  tenantSubscriptionId: string
): string | null {
  if (cobranca.subscription !== tenantSubscriptionId) {
    return 'Esta cobrança não pertence à assinatura deste tenant.'
  }
  if (cobranca.status !== 'PENDING' && cobranca.status !== 'OVERDUE') {
    return 'Esta cobrança não está pendente ou vencida — nada para regularizar.'
  }
  return null
}

export interface CobrancaEmAbertoResumo {
  id: string
  value: number
  dueDate: string
  status: 'PENDING' | 'OVERDUE'
  billingType: string | null
  invoiceUrl: string | null
}

// Correção de produto — GET /billing/situacao expõe cobrancasEmAberto: só
// PENDING (antes do vencimento — o cliente pode trocar a forma de
// pagamento sem precisar ficar inadimplente) e OVERDUE (vencida, mesmo
// fluxo de antes). Já paga (RECEIVED/CONFIRMED) nunca aparece — nada a
// alterar nela. Ordenadas por vencimento (mais próxima primeiro): nunca
// presume qual é "a cobrança do mês atual" quando há mais de uma PENDING.
// Filtra por `subscription === tenantSubscriptionId` de novo aqui — defesa
// em profundidade (mesmo padrão de validarCobrancaParaRegularizacao acima):
// `cobrancas` já deveria vir só da assinatura do tenant (listarCobrancasAsaas
// filtra por `subscription=` na própria consulta ao Asaas, então uma
// cobrança avulsa de upgrade — sem subscription, ver criarCobrancaAvulsaAsaas
// — nunca entraria aqui), mas não confia só na origem dos dados.
export function montarCobrancasEmAberto(
  cobrancas: CobrancaAsaas[],
  tenantSubscriptionId: string
): CobrancaEmAbertoResumo[] {
  return cobrancas
    .filter(c => c.subscription === tenantSubscriptionId)
    .filter((c): c is CobrancaAsaas & { status: 'PENDING' | 'OVERDUE' } => c.status === 'PENDING' || c.status === 'OVERDUE')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(c => ({
      id: c.id,
      value: c.value,
      dueDate: c.dueDate,
      status: c.status,
      billingType: c.billingType ?? null,
      invoiceUrl: c.invoiceUrl || c.bankSlipUrl || null,
    }))
}

// ─── Upgrade de plano self-service (Fase 8A) — decisões puras ──────────────
// Nenhuma faz I/O; o controller (POST /billing/upgrade em controllers/
// billing.ts) busca os dados e só aplica a decisão, mesmo padrão do resto
// deste arquivo.

type PlanoParaUpgrade = {
  id: string
  ativo: boolean
  interno: boolean
  eh_plano_trial: boolean
  asaas_subscription_value: Prisma.Decimal | number | string | null
}

// Reaproveita validarPlanoParaAssinaturaSelfService (interno/trial/sem
// valor) pro plano NOVO — upgrade nunca é uma forma de contratar um plano
// que nem self-service normal aceitaria. Regras adicionais, exclusivas de
// upgrade: plano precisa estar `ativo` (comprar um plano desativado não é
// permitido, diferente de só trocar dados de um já contratado), precisa ser
// DIFERENTE do atual, e precisa ser SUPERIOR (nunca downgrade nesta fase) —
// "superior" é decidido pelo valor de assinatura (asaas_subscription_value),
// única ordenação de planos que já existe no sistema hoje (é a mesma usada
// por listarPlanosDisponiveis, orderBy asaas_subscription_value asc).
export function validarUpgradePlano(
  planoAtual: PlanoParaUpgrade | null,
  planoNovo: PlanoParaUpgrade | null
): string | null {
  const motivoBase = validarPlanoParaAssinaturaSelfService(planoNovo)
  if (motivoBase) return motivoBase
  // validarPlanoParaAssinaturaSelfService já garante planoNovo não-nulo
  // acima (senão teria devolvido "Plano não encontrado."), mas o TypeScript
  // não sabe disso — a checagem abaixo é só pra ele, nunca alcançada na
  // prática com planoNovo null.
  if (!planoNovo) return 'Plano não encontrado.'
  if (!planoNovo.ativo) return 'Este plano não está disponível para contratação no momento.'
  if (!planoAtual) return 'Tenant sem plano atual — não é possível calcular upgrade.'
  if (planoNovo.id === planoAtual.id) return 'Você já está neste plano.'
  const valorAtual = Number(planoAtual.asaas_subscription_value ?? 0)
  const valorNovo = Number(planoNovo.asaas_subscription_value)
  if (valorNovo <= valorAtual) {
    return 'Só é possível fazer upgrade para um plano superior ao atual.'
  }
  return null
}

// Impede solicitar um upgrade novo enquanto já existe uma troca pendente de
// confirmação (regra explícita da tarefa) — nunca deixa dois
// plano_pendente_id concorrentes, o que deixaria ambíguo qual pagamento
// confirmado deveria aplicar qual plano.
export function motivoUpgradePendenteBloqueiaNovaTroca(planoPendenteId: string | null): string | null {
  if (planoPendenteId) {
    return 'Já existe uma troca de plano pendente de confirmação. Aguarde o pagamento ser confirmado antes de solicitar outra troca.'
  }
  return null
}

const DIA_MS = 24 * 60 * 60 * 1000

// Duração REAL (calendário de verdade, não aproximação) do ciclo atual —
// correção pós-revisão: a versão anterior usava mês=30/ano=360 fixos,
// distorcendo o proporcional em meses de 28/29/31 dias. Agora acha o
// INÍCIO do ciclo invertendo calcularProximoVencimento (calcularVencimentoAnterior,
// ver acima) a partir do vencimento (licenca_fim) e mede a distância real
// em dias — funciona porque licenca_fim É o fim do ciclo atual por
// definição (é a mesma data que calcularProximoVencimento produziu na
// última renovação/troca de plano).
export function duracaoCicloDiasReal(licencaFim: Date, ciclo: string | null | undefined): number {
  const inicioCiclo = calcularVencimentoAnterior(licencaFim, ciclo)
  return (licencaFim.getTime() - inicioCiclo.getTime()) / DIA_MS
}

// Dias restantes até o próximo vencimento (licenca_fim) — fracionário (não
// arredondado pra cima/baixo, diferente de diasRestantesTrial/
// diasRestantesTolerancia em tenantGuards.ts, que são pra EXIBIÇÃO): aqui o
// número entra direto numa conta monetária, arredondar dias artificialmente
// pra mais ou pra menos distorceria o valor cobrado. Nunca negativo (ciclo
// já vencido = nada restante) nem maior que o próprio ciclo (proteção
// defensiva — licenca_fim no futuro distante não deveria acontecer pra um
// tenant ACTIVE em dia, mas nunca gera uma "proporção" acima de 100%).
export function diasRestantesCicloAtual(licencaFim: Date, cicloDias: number, agora: Date = new Date()): number {
  const ms = licencaFim.getTime() - agora.getTime()
  const dias = ms / DIA_MS
  return Math.min(cicloDias, Math.max(0, dias))
}

// Valor proporcional do upgrade — cobra só a DIFERENÇA entre plano novo e
// atual, multiplicada pela fração do ciclo atual que ainda falta (regra
// explícita da tarefa: "próximo ciclo cobra o valor cheio do novo plano",
// então só o restante do ciclo ATUAL é rateado aqui). Valores monetários
// tratados em CENTAVOS (inteiros) internamente — nunca aritmética de ponto
// flutuante direto em reais, pra não acumular erro de arredondamento num
// cálculo que efetivamente gera uma cobrança real no Asaas. Nunca negativo
// (Math.max(0, ...) só como proteção defensiva — validarUpgradePlano já
// garante valorNovo > valorAtual antes de chegar aqui).
export function calcularValorProporcionalUpgrade(params: {
  valorAtual: number
  valorNovo: number
  diasRestantesCiclo: number
  cicloDias: number
}): number {
  const { valorAtual, valorNovo, diasRestantesCiclo, cicloDias } = params
  if (cicloDias <= 0) return 0
  const diferencaCentavos = Math.round((valorNovo - valorAtual) * 100)
  const proporcao = diasRestantesCiclo / cicloDias
  const proporcionalCentavos = Math.round(diferencaCentavos * proporcao)
  return Math.max(0, proporcionalCentavos) / 100
}

// Fase 8A (correção pós-revisão 2) — GET /billing/situacao já mostra
// "Próxima cobrança" mesmo quando Tenant.licenca_fim está vazio no banco:
// aquele valor vem direto do Asaas (buscarEntradaSituacaoAsaas ->
// assinatura.nextDueDate), nunca de licenca_fim. validarECalcularUpgrade
// (billing.ts) só olhava licenca_fim e bloqueava o upgrade nesse caso —
// o cliente via a data na tela e o preview dizia "sem data de vencimento"
// mesmo assim. Esta função resolve pela MESMA fonte (Asaas, a assinatura
// já vinculada ao tenant) como fallback, em vez de inventar uma data:
// nunca escreve licenca_fim no banco (mesma convenção de sincronizar() em
// adminTenantsAsaas.ts, que também nunca toca licenca_fim fora do
// webhook) — só resolve o valor em memória pra este cálculo, então
// preview e confirmação (que reaproveitam a mesma validarECalcularUpgrade)
// automaticamente enxergam o mesmo vencimento sem duplicar a lógica.
export async function resolverVencimentoCicloAtual(
  tenant: { licenca_fim: Date | null; asaas_subscription_id: string | null }
): Promise<Date | null> {
  if (tenant.licenca_fim) return tenant.licenca_fim
  if (!tenant.asaas_subscription_id) return null
  try {
    const assinatura = await buscarAssinaturaAsaas(tenant.asaas_subscription_id)
    return assinatura.nextDueDate ? new Date(assinatura.nextDueDate) : null
  } catch {
    return null
  }
}

// Reativação self-service de assinatura INACTIVE foi retirada desta Fase
// (correção de segurança pós-revisão): um tenant com assinatura INACTIVE no
// Asaas normalmente já está SUSPENDED, e hoje não existe campo que
// distinga suspensão manual de suspensão causada pelo billing (ver
// bloqueioOperacaoFinanceiraSelfService acima). Reintroduzir reativação
// self-service exige antes um campo/auditoria de origem da suspensão —
// não criado nesta Fase por não ter sido comprovadamente necessário até
// aqui. reativarAssinaturaAsaas/decidirReativacaoAssinatura foram
// removidas junto (sem uso).

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

// Fase 8A (correção pós-revisão) — inverso exato de calcularProximoVencimento
// (mesma aritmética de calendário, só subtraindo em vez de somar), usado
// pra achar o INÍCIO do ciclo atual a partir do vencimento (licenca_fim) —
// ver duracaoCicloDiasReal abaixo. Calendário real de propósito (respeita
// meses de 28 a 31 dias, ano bissexto): "voltar 1 mês" de 2026-03-31 dá
// 2026-02-28 (setMonth já cuida disso sozinho), nunca uma aproximação fixa
// de dias.
export function calcularVencimentoAnterior(dataBase: Date, ciclo: string | null | undefined): Date {
  const cicloNormalizado = (ciclo || 'MONTHLY').toUpperCase()
  if (cicloNormalizado in CICLOS_EM_DIAS) {
    return new Date(dataBase.getTime() - CICLOS_EM_DIAS[cicloNormalizado] * 86_400_000)
  }
  const meses = CICLOS_EM_MESES[cicloNormalizado] ?? 1
  const resultado = new Date(dataBase)
  resultado.setMonth(resultado.getMonth() - meses)
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
// Fase 8A (correção pós-revisão) — decide se UM pagamento confirmado
// específico é o que estava sendo esperado pra aplicar plano_pendente_id.
// null em planoPendentePaymentId é permissivo de propósito (mantém o
// comportamento antigo pra conversão trial->pago, que nunca captura o
// payment.id esperado — ver criarAssinatura em controllers/billing.ts, não
// alterada nesta fase): sem um id específico pra comparar, qualquer
// pagamento confirmado do tenant ainda aplica. Quando HÁ um id esperado
// (sempre o caso pra upgrade, ver solicitarUpgrade), só esse pagamento
// exato aplica — uma renovação normal da assinatura (ou qualquer outra
// cobrança) confirmando enquanto um upgrade está pendente NUNCA aplica o
// plano novo por engano.
export function pagamentoConfirmaPendencia(paymentId: string, planoPendentePaymentId: string | null | undefined): boolean {
  return planoPendentePaymentId == null || planoPendentePaymentId === paymentId
}

export function calcularAtualizacaoTenant(
  acao: Extract<AcaoWebhookAsaas, { tipo: 'pagamento_confirmado' | 'pagamento_vencido' | 'assinatura_cancelada' }>,
  tenantAtual: {
    asaas_status: string | null
    licenca_inicio: Date | null
    status: TenantStatus
    plano_pendente_id?: string | null
    plano_pendente_payment_id?: string | null
  },
  cicloPlano: string | null,
  agora: Date = new Date()
): AtualizacaoTenantAsaas {
  if (acao.tipo === 'assinatura_cancelada') {
    // CANCELED é estado administrativo definitivo — automação nunca o
    // rebaixa pra SUSPENDED. Sem isso, um SUBSCRIPTION_DELETED/INACTIVATED
    // atrasado/reentregue (Asaas entrega "at least once", sem garantia de
    // ordem) depois de um cancelamento manual do SUPER_ADMIN "desfazia"
    // parte da decisão dele, mesmo sem reativar acesso nenhum. Correção de
    // segurança pós-revisão, mesma família do bloqueio já aplicado em
    // pagamento_confirmado — não inventa origem de SUSPENDED, só protege
    // CANCELED especificamente, que já é tratado como definitivo em todo o
    // resto do sistema (ver Tenants.tsx/tenantGuards.ts).
    if (tenantAtual.status === 'CANCELED') {
      return {
        dados: null,
        ignorado: 'Evento de cancelamento de assinatura ignorado: tenant já está CANCELED — automação nunca altera um cancelamento definitivo.',
      }
    }
    // SUSPENDED (não CANCELED) de propósito, pra todo estado que não seja
    // CANCELED: automação nunca marca CANCELED (estado definitivo,
    // "contrato encerrado" na semântica já usada em
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

  // pagamento_confirmado — SUSPENDED/CANCELED bloqueiam ANTES de qualquer
  // outra checagem, independente do que asaas_status disser. Hoje não há
  // como saber se o SUSPENDED foi causado pelo Asaas (SUBSCRIPTION_DELETED/
  // INACTIVATED, ver acima) ou definido manualmente pelo SUPER_ADMIN por um
  // motivo não relacionado a billing (fraude, violação de contrato, etc.) —
  // sem esse dado, pagamento nunca pode ser o que desfaz uma suspensão ou
  // cancelamento; só o SUPER_ADMIN, manualmente, decide reverter. CANCELED
  // é o mesmo raciocínio, redobrado: já é tratado como estado definitivo em
  // todo o resto do sistema (ver Tenants.tsx/tenantGuards.ts), pagamento
  // não é motivo válido pra sair dele. Nenhuma heurística de origem foi
  // inventada aqui — é bloqueio incondicional pros dois estados.
  if (tenantAtual.status === 'SUSPENDED') {
    return {
      dados: null,
      ignorado: 'Pagamento confirmado ignorado: tenant está SUSPENDED — reativação automática bloqueada; requer ação manual do SUPER_ADMIN (não há como saber se a suspensão foi causada pelo Asaas ou definida manualmente).',
    }
  }
  if (tenantAtual.status === 'CANCELED') {
    return {
      dados: null,
      ignorado: 'Pagamento confirmado ignorado: tenant está CANCELED — automação nunca reativa um cancelamento; requer ação manual do SUPER_ADMIN.',
    }
  }

  // Só chega aqui pra TRIAL/ACTIVE/EXPIRED — comportamento normal
  // preservado: ativa/renova quando o asaas_status atual é CONFIRMADAMENTE
  // "ACTIVE" (allowlist, não blocklist). Cobre dois riscos: (1) webhook
  // fora de ordem — SUBSCRIPTION_DELETED/INACTIVATED processado primeiro,
  // depois um PAYMENT_CONFIRMED antigo/reentregue chega e tentaria voltar
  // pra ACTIVE; (2) dado legado — asaas_status pode conter um status de
  // PAGAMENTO ("CONFIRMED", "OVERDUE", ...) ou o nome bruto de um evento de
  // cancelamento, gravados pela versão anterior desta correção. Em ambos os
  // casos "não confiavelmente ACTIVE" bloqueia — só o valor real "ACTIVE"
  // libera a reativação automática, nunca uma suposição em cima de status
  // de pagamento.
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
  const dadosBase = {
    asaas_ultima_sincronizacao: agora,
    status: 'ACTIVE' as const,
    ultimo_pagamento_em: acao.dataPagamento,
    licenca_inicio: tenantAtual.licenca_inicio ?? acao.dataPagamento,
    licenca_fim: proximoVencimento,
    proxima_cobranca: proximoVencimento,
  }

  // Fase 6B (conversão trial->pago / troca de plano): plano_pendente_id é
  // gravado por criarAssinatura/solicitarUpgrade (billing.ts) no momento em
  // que o cliente escolhe um plano pago, SEM nunca tocar plano_id — o
  // Tenant continua no plano atual (ex.: teste-gratis) até este exato
  // momento, o pagamento confirmado sendo o único evento que aplica o
  // plano escolhido de verdade. Depois de aplicado, plano_pendente_id (e
  // plano_pendente_payment_id, Fase 8A) são limpos — nunca ficam
  // "pendentes" depois de já confirmado. Os bloqueios de SUSPENDED/CANCELED
  // acima já rodaram antes de chegar aqui, então esta troca de plano herda
  // a mesma proteção sem precisar repeti-la.
  //
  // Fase 8A (correção pós-revisão) — só aplica se este pagamento
  // ESPECIFICAMENTE corresponde ao esperado (pagamentoConfirmaPendencia).
  // Quando não corresponde (ex.: renovação normal da assinatura confirmando
  // enquanto um upgrade está pendente), a licença ainda é estendida
  // normalmente (dadosBase), só o plano NÃO muda — a troca continua
  // pendente, esperando o pagamento certo.
  if (tenantAtual.plano_pendente_id && pagamentoConfirmaPendencia(acao.paymentId, tenantAtual.plano_pendente_payment_id)) {
    return {
      dados: {
        ...dadosBase,
        plano: { connect: { id: tenantAtual.plano_pendente_id } },
        plano_pendente: { disconnect: true },
        plano_pendente_payment_id: null,
      },
    }
  }
  return { dados: dadosBase }
}

// Fase 8A — decide SE a assinatura recorrente no Asaas precisa ser
// sincronizada (PUT /subscriptions/:id) ANTES de aplicar resultado.dados no
// Tenant — só quando este pagamento_confirmado está de fato aplicando um
// plano_pendente_id (troca de plano: primeira assinatura paga OU upgrade).
// `pagamentoCorresponde` (correção pós-revisão) é o resultado de
// pagamentoConfirmaPendencia: sem ele, uma renovação normal confirmando
// enquanto um upgrade está pendente (dadosAplicados ainda não-null, já que
// vira dadosBase — estender a licença é legítimo mesmo sem trocar de
// plano) sincronizaria a assinatura Asaas pro valor do plano PENDENTE
// mesmo sem estar de fato aplicando a troca agora — inconsistência exatamente
// oposta ao que esta correção evita.
export function deveSincronizarAssinaturaAntesDeAplicar(
  tipoAcao: AcaoWebhookAsaas['tipo'],
  tinhaPendenciaAntes: boolean,
  dadosAplicados: Prisma.TenantUpdateInput | null,
  pagamentoCorresponde: boolean
): boolean {
  return tipoAcao === 'pagamento_confirmado' && tinhaPendenciaAntes && dadosAplicados !== null && pagamentoCorresponde
}

// Ponto único chamado pelo controller do webhook (ver
// controllers/webhooksAsaas.ts) — faz idempotência (via asaas_event_id),
// mapeamento (mapearEventoAsaas) e aplica o efeito no Tenant vinculado
// (calcularAtualizacaoTenant). Sempre resolve com ok:true (2xx pro Asaas)
// exceto quando algo realmente inesperado lança (erro de banco etc.) OU
// quando a sincronização da assinatura Asaas falha antes de aplicar um
// plano pendente (Fase 8A, ver bloco logo antes do prisma.tenant.update
// abaixo) — as duas situações propagam (throw), e o controller trata isso
// como erro controlado (não-2xx), o que faz o Asaas reentregar o webhook
// depois (o evento fica com processado=false, nunca marcado como tratado
// enquanto a sincronização não for bem-sucedida).
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
      data: { processado: true, processado_em: new Date(), erro: null },
    })
    return { ok: true, ignorado: acao.motivo }
  }

  const condicoes: Prisma.TenantWhereInput[] = []
  if (acao.customerId) condicoes.push({ asaas_customer_id: acao.customerId })
  if (acao.subscriptionId) condicoes.push({ asaas_subscription_id: acao.subscriptionId })

  const tenant = condicoes.length > 0
    ? await prisma.tenant.findFirst({ where: { OR: condicoes }, include: { plano: true, plano_pendente: true } })
    : null

  if (!tenant) {
    await prisma.asaasWebhookEvent.update({
      where: { id: evento.id },
      data: { processado: true, processado_em: new Date(), erro: 'Nenhum tenant vinculado a este customer/subscription Asaas.' },
    })
    return { ok: true, semTenantVinculado: true }
  }

  // Ciclo do plano PENDENTE tem prioridade — é o que está sendo pago agora
  // (conversão/troca de plano, ver calcularAtualizacaoTenant); sem plano
  // pendente, cai no ciclo do plano atual (renovação normal), mesmo
  // comportamento de antes da Fase 6B.
  const cicloPlano = tenant.plano_pendente?.asaas_billing_cycle ?? tenant.plano?.asaas_billing_cycle ?? null
  const resultado = calcularAtualizacaoTenant(acao, tenant, cicloPlano)

  if (resultado.dados === null) {
    await prisma.asaasWebhookEvent.update({
      where: { id: evento.id },
      data: { processado: true, processado_em: new Date(), erro: resultado.ignorado ?? null },
    })
    return { ok: true, ignorado: resultado.ignorado }
  }

  // Fase 8A — só true quando este pagamento_confirmado É o payment.id
  // esperado (ou quando não há um id esperado pra comparar, ver
  // pagamentoConfirmaPendencia) — decide tanto o que calcularAtualizacaoTenant
  // já aplicou em resultado.dados quanto se este bloco de sincronização
  // Asaas deve rodar agora.
  const pagamentoCorresponde = acao.tipo === 'pagamento_confirmado'
    ? pagamentoConfirmaPendencia(acao.paymentId, tenant.plano_pendente_payment_id)
    : false

  // Fase 8A — este pagamento está aplicando uma troca de plano
  // (plano_pendente_id, e é exatamente o payment.id esperado pra essa
  // troca): a assinatura recorrente no Asaas PRECISA já refletir o valor
  // do plano novo antes de aplicarmos a troca localmente, nunca depois
  // (nunca "best-effort" — deixaria o plano superior liberado enquanto o
  // Asaas ainda cobraria o valor antigo no próximo ciclo). Se isso falhar,
  // a troca NÃO é aplicada, plano_pendente_id permanece, o evento NÃO é
  // marcado processado (fica retryable) e o erro propaga.
  if (deveSincronizarAssinaturaAntesDeAplicar(acao.tipo, Boolean(tenant.plano_pendente_id), resultado.dados, pagamentoCorresponde)) {
    const valorPlanoNovo = tenant.plano_pendente?.asaas_subscription_value
    if (!tenant.asaas_subscription_id || valorPlanoNovo == null) {
      const erro = `Sincronização da assinatura Asaas abortada para o tenant ${tenant.id}: asaas_subscription_id ou plano_pendente.asaas_subscription_value ausente.`
      await prisma.asaasWebhookEvent.update({ where: { id: evento.id }, data: { erro } })
      throw new Error(erro)
    }
    try {
      // Seguro de repetir com o mesmo valor (idempotente do lado do Asaas —
      // ver comentário em atualizarValorAssinaturaAsaas) — um retry deste
      // webhook nunca duplica nem distorce a assinatura.
      await atualizarValorAssinaturaAsaas(tenant.asaas_subscription_id, Number(valorPlanoNovo))
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : 'Erro desconhecido ao atualizar valor da assinatura no Asaas.'
      const erro = `Falha ao sincronizar assinatura Asaas antes de aplicar plano pendente do tenant ${tenant.id}: ${detalhe}`
      await prisma.asaasWebhookEvent.update({ where: { id: evento.id }, data: { erro } })
      throw new Error(erro)
    }
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: resultado.dados })
  await prisma.asaasWebhookEvent.update({
    where: { id: evento.id },
    data: { processado: true, processado_em: new Date(), erro: null },
  })

  return { ok: true }
}
