import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { criarClienteAsaas, criarAssinaturaAsaas, atualizarClienteAsaas, buscarAssinaturaAsaas, type DadosCobrancaAsaas } from '../services/asaasClient'

// Vínculo de um Tenant com o Asaas, disparado manualmente pelo SUPER_ADMIN
// (ver seção "Cobrança Asaas" em Tenants.tsx) — fundação/sandbox, nenhuma
// dessas rotas é chamada automaticamente. GET só reflete o que já está
// salvo no Tenant (ver services/asaasClient.ts pra como esses campos são
// atualizados por webhook).

// Recorte devolvido pro GET .../asaas — inclui os dados de cobrança (Fase 2)
// porque só é alcançável dentro de Gestão SaaS (SUPER_ADMIN, ver
// requireSuperAdmin.ts); nunca faz parte de /auth/me nem de qualquer rota
// que o cliente comum alcance (ver tenantPublico() em controllers/auth.ts).
const SELECAO_VINCULO_ASAAS = {
  asaas_customer_id: true,
  asaas_subscription_id: true,
  asaas_status: true,
  asaas_ultima_sincronizacao: true,
  billing_nome_responsavel: true,
  billing_email: true,
  billing_cpf_cnpj: true,
  billing_telefone: true,
  billing_endereco: true,
  billing_numero: true,
  billing_complemento: true,
  billing_bairro: true,
  billing_cidade: true,
  billing_estado: true,
  billing_cep: true,
} as const

export async function obterVinculo(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: SELECAO_VINCULO_ASAAS })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    res.json(tenant)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar vínculo Asaas.' })
  }
}

interface BillingBody {
  billing_nome_responsavel?: string | null
  billing_email?: string | null
  billing_cpf_cnpj?: string | null
  billing_telefone?: string | null
  billing_endereco?: string | null
  billing_numero?: string | null
  billing_complemento?: string | null
  billing_bairro?: string | null
  billing_cidade?: string | null
  billing_estado?: string | null
  billing_cep?: string | null
}

const CAMPOS_BILLING = [
  'billing_nome_responsavel', 'billing_email', 'billing_cpf_cnpj', 'billing_telefone',
  'billing_endereco', 'billing_numero', 'billing_complemento', 'billing_bairro',
  'billing_cidade', 'billing_estado', 'billing_cep',
] as const

// Nunca loga o body inteiro nem campo a campo (billing_cpf_cnpj é dado
// sensível, ver comentário no schema.prisma) — únicos console.error deste
// arquivo logam só o objeto Error (mensagem/stack), nunca `req.body`. Pura
// e exportada pra teste direto (ver adminTenantsAsaas.test.ts) — confirma
// que nenhum valor sensível passa por console.* aqui.
export function extrairDadosBilling(body: BillingBody): Prisma.TenantUpdateInput {
  const dados: Prisma.TenantUpdateInput = {}
  for (const campo of CAMPOS_BILLING) {
    const valor = body[campo]
    if (valor !== undefined) dados[campo] = valor?.trim() || null
  }
  return dados
}

export function dadosCobrancaAsaas(tenant: { nome: string } & Record<(typeof CAMPOS_BILLING)[number], string | null>): DadosCobrancaAsaas | null {
  if (!tenant.billing_cpf_cnpj) return null
  return {
    nome: tenant.billing_nome_responsavel || tenant.nome,
    cpfCnpj: tenant.billing_cpf_cnpj,
    email: tenant.billing_email,
    telefone: tenant.billing_telefone,
    cep: tenant.billing_cep,
    endereco: tenant.billing_endereco,
    numero: tenant.billing_numero,
    complemento: tenant.billing_complemento,
    bairro: tenant.billing_bairro,
  }
}

// Salva os dados de cobrança do tenant — se já existir um customer Asaas
// vinculado, também tenta sincronizar os novos dados lá (best-effort: se o
// Asaas rejeitar, os dados locais já ficam salvos mesmo assim, e o erro
// específico do Asaas volta em asaas_sync_erro pro SUPER_ADMIN decidir o
// que fazer, sem bloquear a edição local).
export async function atualizarDadosCobranca(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const dados = extrairDadosBilling(req.body as BillingBody)
    const atualizado = await prisma.tenant.update({ where: { id }, data: dados, select: SELECAO_VINCULO_ASAAS })

    let asaasSyncErro: string | null = null
    if (tenant.asaas_customer_id) {
      const cobranca = dadosCobrancaAsaas({ ...atualizado, nome: tenant.nome })
      if (cobranca) {
        try {
          await atualizarClienteAsaas(tenant.asaas_customer_id, cobranca)
        } catch (err) {
          asaasSyncErro = err instanceof Error ? err.message : 'Erro ao sincronizar dados de cobrança com o Asaas.'
        }
      }
    }

    res.json({ ...atualizado, asaas_sync_erro: asaasSyncErro })
  } catch (err) {
    console.error('Erro ao salvar dados de cobrança:', err)
    res.status(500).json({ erro: 'Erro ao salvar dados de cobrança.' })
  }
}

// Lê os dados de cobrança já salvos no tenant (ver atualizarDadosCobranca
// acima) — desde a Fase 2, cpf_cnpj/email/telefone não vêm mais no body
// desta rota; precisam ter sido salvos antes via PUT .../asaas/billing.
export async function criarCliente(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    if (tenant.asaas_customer_id) { res.status(400).json({ erro: 'Este tenant já tem um cliente Asaas vinculado.' }); return }

    const cobranca = dadosCobrancaAsaas(tenant)
    if (!cobranca) {
      res.status(400).json({ erro: 'Preencha os dados de cobrança (nome e CPF/CNPJ) antes de criar o cliente no Asaas.' })
      return
    }

    const cliente = await criarClienteAsaas({ id: tenant.id }, cobranca)

    const atualizado = await prisma.tenant.update({
      where: { id },
      data: { asaas_customer_id: cliente.id, asaas_ultima_sincronizacao: new Date() },
    })
    res.status(201).json({ asaas_customer_id: atualizado.asaas_customer_id })
  } catch (err) {
    console.error('Erro ao criar cliente Asaas:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao criar cliente no Asaas.' })
  }
}

export async function criarAssinatura(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { billing_type } = req.body as { billing_type?: 'BOLETO' | 'PIX' | 'CREDIT_CARD' }

    const tenant = await prisma.tenant.findUnique({ where: { id }, include: { plano: true } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    if (!tenant.asaas_customer_id) { res.status(400).json({ erro: 'Vincule um cliente Asaas antes de criar a assinatura.' }); return }
    if (tenant.asaas_subscription_id) { res.status(400).json({ erro: 'Este tenant já tem uma assinatura Asaas vinculada.' }); return }
    if (!tenant.plano) { res.status(400).json({ erro: 'Tenant sem plano vinculado — defina um plano antes de criar a assinatura.' }); return }
    if (tenant.plano.asaas_subscription_value == null) {
      res.status(400).json({ erro: 'Plano sem valor de assinatura Asaas configurado (defina em Gestão SaaS > Planos).' })
      return
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const assinatura = await criarAssinaturaAsaas(tenant.asaas_customer_id, tenant.plano, {
      billingType: billing_type,
      nextDueDate: hoje,
    })

    const atualizado = await prisma.tenant.update({
      where: { id },
      data: {
        asaas_subscription_id: assinatura.id,
        asaas_status: assinatura.status,
        asaas_ultima_sincronizacao: new Date(),
      },
    })
    res.status(201).json({ asaas_subscription_id: atualizado.asaas_subscription_id, asaas_status: atualizado.asaas_status })
  } catch (err) {
    console.error('Erro ao criar assinatura Asaas:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao criar assinatura no Asaas.' })
  }
}

const SELECAO_EVENTO_ASAAS = {
  asaas_event_id: true,
  evento: true,
  payment_id: true,
  subscription_id: true,
  customer_id: true,
  processado: true,
  erro: true,
  criado_em: true,
  processado_em: true,
} as const

const LIMITE_EVENTOS_HISTORICO = 50

// Decisão pura (sem banco) de quais condições usar pra achar os eventos
// deste tenant — casa por customer_id OU subscription_id (mesmo critério de
// vínculo usado em tratarWebhookAsaas, asaasClient.ts). Retorna [] quando o
// tenant ainda não tem nenhum dos dois vinculados — o caller (listarEventos)
// trata array vazio como "não busca nada, devolve lista vazia" sem tratar
// como erro (ver estado vazio no frontend). Exportada pra teste direto.
export function condicoesEventosAsaas(tenant: { asaas_customer_id: string | null; asaas_subscription_id: string | null }): Prisma.AsaasWebhookEventWhereInput[] {
  const condicoes: Prisma.AsaasWebhookEventWhereInput[] = []
  if (tenant.asaas_customer_id) condicoes.push({ customer_id: tenant.asaas_customer_id })
  if (tenant.asaas_subscription_id) condicoes.push({ subscription_id: tenant.asaas_subscription_id })
  return condicoes
}

// Histórico de webhooks Asaas relacionados a este tenant — sem nenhum
// vínculo ainda, devolve lista vazia (não é erro).
export async function listarEventos(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const condicoes = condicoesEventosAsaas(tenant)
    const eventos = condicoes.length > 0
      ? await prisma.asaasWebhookEvent.findMany({
          where: { OR: condicoes },
          select: SELECAO_EVENTO_ASAAS,
          orderBy: { criado_em: 'desc' },
          take: LIMITE_EVENTOS_HISTORICO,
        })
      : []
    res.json(eventos)
  } catch (err) {
    console.error('Erro ao listar eventos Asaas:', err)
    res.status(500).json({ erro: 'Erro ao listar eventos Asaas.' })
  }
}

// Decisão pura (sem banco/rede) de se um tenant pode ser sincronizado —
// exportada pra teste direto ("sync sem subscription_id retorna erro
// claro"). Só valida o pré-requisito local; a chamada em si ao Asaas (e o
// bloqueio de produção) vive em buscarAssinaturaAsaas (asaasClient.ts).
export function validarTenantParaSync(tenant: { asaas_subscription_id: string | null }): string | null {
  if (!tenant.asaas_subscription_id) {
    return 'Tenant sem assinatura Asaas vinculada — nada para sincronizar.'
  }
  return null
}

// Sincronização manual — busca o status atual da assinatura no Asaas e só
// atualiza asaas_status/asaas_ultima_sincronizacao (espelho pra exibição).
// Nunca mexe em status/licenca_fim/proxima_cobranca por aqui — essas
// mudanças só acontecem via webhook, que tem um evento claro de pagamento
// por trás (ver tratarWebhookAsaas). Sincronizar é só "o que o Asaas diz
// agora", não uma segunda via de decisão de licenciamento.
export async function sincronizar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    const motivoErro = validarTenantParaSync(tenant)
    if (motivoErro) { res.status(400).json({ erro: motivoErro }); return }

    const assinatura = await buscarAssinaturaAsaas(tenant.asaas_subscription_id!)

    const atualizado = await prisma.tenant.update({
      where: { id },
      data: { asaas_status: assinatura.status, asaas_ultima_sincronizacao: new Date() },
      select: { asaas_status: true, asaas_ultima_sincronizacao: true },
    })
    res.json(atualizado)
  } catch (err) {
    console.error('Erro ao sincronizar com o Asaas:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao sincronizar com o Asaas.' })
  }
}
