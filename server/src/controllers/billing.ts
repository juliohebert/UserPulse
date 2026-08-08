import { Request, Response } from 'express'
import prisma from '../lib/prisma'
import { obterSituacaoComercialTenant } from '../lib/tenantGuards'
import {
  criarClienteAsaas, criarAssinaturaAsaas, atualizarClienteAsaas, buscarCobrancaAsaas,
  listarCobrancasAsaas, atualizarBillingTypeCobrancaAsaas,
  calcularSituacaoAsaas, buscarEntradaSituacaoAsaas, validarPlanoParaAssinaturaSelfService,
  validarCobrancaParaRegularizacao, bloqueioOperacaoFinanceiraSelfService,
} from '../services/asaasClient'
import { extrairDadosBilling, dadosCobrancaAsaas, type BillingBody } from './adminTenantsAsaas'

// ─── Fase 5 — pagamento self-service pelo próprio cliente (ADMIN do tenant) ─
// Tenant SEMPRE resolvido por req.adminUser.tenant_id/tenant (sessão) — este
// arquivo nunca lê um id de tenant vindo de req.params/req.body. Guard de
// papel (ADMIN-only) fica na rota, reaproveitando requireEscritaConfiguracao
// (ver routes/billing.ts) — mesmo nível de permissão já usado pra outras
// configurações sensíveis do tenant (aparência do widget, catálogo de
// telas), sem criar um guard novo.
//
// Não usa Asaas Checkout nesta fase (decisão explícita da tarefa) — reusa
// assinatura/cobrança/invoiceUrl já existentes. Nenhuma rota aqui cria
// licença sozinha: só webhook (PAYMENT_CONFIRMED/RECEIVED, já estabilizado
// nas fases anteriores) confirma financeiramente e ativa via
// calcularAtualizacaoTenant — ver services/asaasClient.ts.
//
// Correção de segurança pós-revisão: toda operação financeira (criar
// assinatura, pagar cobrança) passa primeiro por
// bloqueioOperacaoFinanceiraSelfService(tenant.status) — SUSPENDED/CANCELED
// nunca chegam a gerar um pagamento novo, mesmo que o backend em si
// permitisse (defesa em profundidade: o webhook também bloqueia isso, ver
// calcularAtualizacaoTenant, mas um tenant suspenso/cancelado não deveria
// nem conseguir criar customer/assinatura/cobrança novos no Asaas). EXPIRED
// fica de fora desse bloqueio de propósito — é o caso legítimo que este
// self-service existe pra resolver. Reativação self-service de assinatura
// INACTIVE foi removida desta Fase (ver nota em asaasClient.ts, perto de
// onde reativarAssinaturaAsaas existia).

// Recorte devolvido pro GET /situacao — nunca inclui asaas_customer_id/
// asaas_subscription_id (IDs técnicos sem utilidade pro cliente final, ver
// regra "não expor IDs desnecessariamente" da tarefa). possuiAssinatura é um
// booleano, não um ID — o frontend usa isso pra decidir se oferece
// "Assinar" (ainda não tem) ou a lista de cobranças vencidas (já tem).
// Sempre acessível independente de status — inclusive SUSPENDED/CANCELED,
// pra o cliente conseguir ver a própria situação e a orientação de
// contatar o suporte (só as operações que geram pagamento são bloqueadas,
// não a leitura). cobrancasVencidas reaproveita os dados que
// buscarEntradaSituacaoAsaas já buscou pra calcular a decisão — nenhuma
// chamada extra ao Asaas só pra listar (mesmo lote de até 50 cobranças,
// ver listarCobrancasAsaas).
export async function obterSituacao(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const situacaoComercial = obterSituacaoComercialTenant(tenant)
    const entrada = await buscarEntradaSituacaoAsaas(tenant)
    const situacaoAsaas = calcularSituacaoAsaas(entrada)
    const proximaCobranca = entrada.tipo === 'dados'
      ? entrada.assinatura.nextDueDate
      : (tenant.proxima_cobranca ? tenant.proxima_cobranca.toISOString() : null)
    const cobrancasVencidas = entrada.tipo === 'dados'
      ? entrada.cobrancas.filter(c => c.status === 'OVERDUE').map(c => ({ id: c.id, value: c.value, dueDate: c.dueDate }))
      : []

    res.json({
      possuiAssinatura: Boolean(tenant.asaas_subscription_id),
      plano: tenant.plano ? {
        nome: tenant.plano.nome,
        valor: tenant.plano.asaas_subscription_value,
        ciclo: tenant.plano.asaas_billing_cycle,
      } : null,
      situacaoComercial,
      situacaoAsaas: situacaoAsaas.decisao,
      motivoSituacaoAsaas: situacaoAsaas.motivo,
      proximaCobranca,
      cobrancasVencidas,
    })
  } catch (err) {
    console.error('Erro ao obter situação de billing self-service:', err)
    res.status(500).json({ erro: 'Erro ao obter situação de billing.' })
  }
}

// Equivalente self-service de atualizarDadosCobranca (adminTenantsAsaas.ts)
// — mesma validação (extrairDadosBilling/dadosCobrancaAsaas), mas escopado
// ao tenant da sessão, nunca a um :id arbitrário.
export async function atualizarDadosCobranca(req: Request, res: Response) {
  try {
    const tenantId = req.adminUser!.tenant_id
    const tenantAtual = req.adminUser!.tenant

    const dados = extrairDadosBilling(req.body as BillingBody)
    const atualizado = await prisma.tenant.update({
      where: { id: tenantId },
      data: dados,
      select: {
        billing_nome_responsavel: true, billing_email: true, billing_cpf_cnpj: true, billing_telefone: true,
        billing_endereco: true, billing_numero: true, billing_complemento: true, billing_bairro: true,
        billing_cidade: true, billing_estado: true, billing_cep: true,
      },
    })

    let asaasSyncErro: string | null = null
    if (tenantAtual.asaas_customer_id) {
      const cobranca = dadosCobrancaAsaas({ ...atualizado, nome: tenantAtual.nome })
      if (cobranca) {
        try {
          await atualizarClienteAsaas(tenantAtual.asaas_customer_id, cobranca)
        } catch (err) {
          asaasSyncErro = err instanceof Error ? err.message : 'Erro ao sincronizar dados de cobrança com o Asaas.'
        }
      }
    }

    res.json({ ...atualizado, asaas_sync_erro: asaasSyncErro })
  } catch (err) {
    console.error('Erro ao salvar dados de cobrança self-service:', err)
    res.status(500).json({ erro: 'Erro ao salvar dados de cobrança.' })
  }
}

// Nova contratação self-service — só quando o tenant AINDA não tem
// asaas_subscription_id (nunca cria assinatura nova em cima de uma
// existente; reativação de assinatura INACTIVE não existe mais nesta
// Fase, ver nota no topo do arquivo). Valor SEMPRE de
// tenant.plano.asaas_subscription_value — nunca lido do body. billingType
// fixo em 'UNDEFINED': quem escolhe Pix ou cartão é o pagador, na página
// hospedada do Asaas, nunca o UserPulse.
export async function criarAssinatura(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant

    const motivoBloqueio = bloqueioOperacaoFinanceiraSelfService(tenant.status)
    if (motivoBloqueio) { res.status(403).json({ erro: motivoBloqueio }); return }

    if (tenant.asaas_subscription_id) {
      res.status(400).json({ erro: 'Este tenant já tem uma assinatura Asaas vinculada.' })
      return
    }
    const motivoPlano = validarPlanoParaAssinaturaSelfService(tenant.plano)
    if (motivoPlano) { res.status(400).json({ erro: motivoPlano }); return }

    let customerId = tenant.asaas_customer_id
    if (!customerId) {
      const cobranca = dadosCobrancaAsaas(tenant)
      if (!cobranca) {
        res.status(400).json({ erro: 'Preencha os dados de cobrança (nome e CPF/CNPJ) antes de assinar.' })
        return
      }
      const cliente = await criarClienteAsaas({ id: tenant.id }, cobranca)
      customerId = cliente.id
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const assinatura = await criarAssinaturaAsaas(customerId, tenant.plano!, {
      billingType: 'UNDEFINED',
      nextDueDate: hoje,
    })

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        asaas_customer_id: customerId,
        asaas_subscription_id: assinatura.id,
        asaas_status: assinatura.status,
        asaas_ultima_sincronizacao: new Date(),
      },
    })

    // Primeira cobrança pode não estar disponível na hora — uma única
    // tentativa, sem polling (regra explícita da tarefa). A assinatura já
    // foi criada e salva de qualquer forma; se a busca falhar ou vier
    // vazia, o frontend mostra "processando" e o cliente atualiza a tela
    // depois (mesmo botão de recarregar de GET /situacao).
    let cobrancaDisponivel = false
    let invoiceUrl: string | null = null
    try {
      const cobrancas = await listarCobrancasAsaas(assinatura.id)
      const primeira = cobrancas.data[0]
      if (primeira) {
        cobrancaDisponivel = true
        invoiceUrl = primeira.invoiceUrl || primeira.bankSlipUrl || null
      }
    } catch (err) {
      console.error('Assinatura self-service criada, mas falhou ao buscar a primeira cobrança:', err)
    }

    res.status(201).json({ cobrancaDisponivel, invoiceUrl })
  } catch (err) {
    console.error('Erro ao criar assinatura self-service:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao criar assinatura no Asaas.' })
  }
}

// Regularização de cobrança vencida ("Pagar") — só cobrancaId vem do
// frontend (via URL, não body); value/tenant/customer/subscription nunca
// são aceitos do cliente. Nunca cria cobrança nova: só confirma que a
// cobrança buscada pertence à assinatura deste tenant e ainda está
// PENDING/OVERDUE (validarCobrancaParaRegularizacao), então libera
// billingType=UNDEFINED nela se ainda não estiver liberado.
export async function pagarCobranca(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const cobrancaId = req.params.cobrancaId as string

    const motivoBloqueio = bloqueioOperacaoFinanceiraSelfService(tenant.status)
    if (motivoBloqueio) { res.status(403).json({ erro: motivoBloqueio }); return }

    if (!tenant.asaas_subscription_id) {
      res.status(400).json({ erro: 'Tenant sem assinatura Asaas vinculada.' })
      return
    }

    const cobranca = await buscarCobrancaAsaas(cobrancaId)
    const motivo = validarCobrancaParaRegularizacao(cobranca, tenant.asaas_subscription_id)
    if (motivo) { res.status(400).json({ erro: motivo }); return }

    let invoiceUrl = cobranca.invoiceUrl || cobranca.bankSlipUrl || null
    if (cobranca.billingType !== 'UNDEFINED') {
      try {
        // value/dueDate vêm da própria cobranca buscada acima — nunca do
        // body desta rota (que não aceita nenhum dos dois, ver comentário
        // da função no service) — só preservam o que já estava lá.
        const atualizada = await atualizarBillingTypeCobrancaAsaas(cobrancaId, {
          billingType: 'UNDEFINED',
          value: cobranca.value,
          dueDate: cobranca.dueDate,
        })
        invoiceUrl = atualizada.invoiceUrl || atualizada.bankSlipUrl || invoiceUrl
      } catch (err) {
        // Segue com a invoiceUrl que já existia (ainda paga a cobrança no
        // meio de pagamento original) — não bloqueia a regularização só
        // porque não deu pra liberar a escolha do meio de pagamento.
        console.error('Erro ao liberar escolha do meio de pagamento na cobrança:', err)
      }
    }

    res.json({ invoiceUrl })
  } catch (err) {
    console.error('Erro ao preparar pagamento de cobrança self-service:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao preparar pagamento no Asaas.' })
  }
}
