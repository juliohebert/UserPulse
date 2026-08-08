import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { criarClienteAsaas, criarAssinaturaAsaas } from '../services/asaasClient'

// Vínculo de um Tenant com o Asaas, disparado manualmente pelo SUPER_ADMIN
// (ver seção "Cobrança Asaas" em Tenants.tsx) — fundação/sandbox, nenhuma
// dessas rotas é chamada automaticamente. GET só reflete o que já está
// salvo no Tenant (ver services/asaasClient.ts pra como esses campos são
// atualizados por webhook).

export async function obterVinculo(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    res.json({
      asaas_customer_id: tenant.asaas_customer_id,
      asaas_subscription_id: tenant.asaas_subscription_id,
      asaas_status: tenant.asaas_status,
      asaas_ultima_sincronizacao: tenant.asaas_ultima_sincronizacao,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar vínculo Asaas.' })
  }
}

// cpf_cnpj não é persistido no UserPulse (o Tenant não tem esse campo, ver
// contexto da tarefa — schema pedido não inclui documento) — só repassado
// ao Asaas na criação do cliente; a partir daí o vínculo vive via
// asaas_customer_id.
export async function criarCliente(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const { cpf_cnpj, email, telefone } = req.body as { cpf_cnpj?: string; email?: string; telefone?: string }
    if (!cpf_cnpj?.trim()) { res.status(400).json({ erro: 'cpf_cnpj é obrigatório para criar o cliente no Asaas.' }); return }

    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    if (tenant.asaas_customer_id) { res.status(400).json({ erro: 'Este tenant já tem um cliente Asaas vinculado.' }); return }

    const cliente = await criarClienteAsaas({ id: tenant.id, nome: tenant.nome }, cpf_cnpj.trim(), { email, telefone })

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
