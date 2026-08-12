import { Request, Response } from 'express'
import type { Plano, Tenant } from '@prisma/client'
import prisma from '../lib/prisma'
import { obterSituacaoComercialTenant, situacaoAdimplenciaTenant, type TenantComPlano } from '../lib/tenantGuards'
import {
  criarClienteAsaas, criarAssinaturaAsaas, atualizarClienteAsaas, buscarCobrancaAsaas,
  listarCobrancasAsaas, atualizarBillingTypeCobrancaAsaas,
  calcularSituacaoAsaas, buscarEntradaSituacaoAsaas, validarPlanoParaAssinaturaSelfService,
  validarFormaPagamentoSelfService,
  validarCobrancaParaRegularizacao, montarCobrancasEmAberto, bloqueioOperacaoFinanceiraSelfService,
  validarUpgradePlano, motivoUpgradePendenteBloqueiaNovaTroca, duracaoCicloDiasReal,
  diasRestantesCicloAtual, calcularValorProporcionalUpgrade, criarCobrancaAvulsaAsaas,
  resolverVencimentoCicloAtual,
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
// "Assinar" (ainda não tem) ou a lista de cobranças em aberto (já tem).
// Sempre acessível independente de status — inclusive SUSPENDED/CANCELED,
// pra o cliente conseguir ver a própria situação e a orientação de
// contatar o suporte (só as operações que geram pagamento são bloqueadas,
// não a leitura). cobrancasEmAberto reaproveita os dados que
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
    // Correção de produto — forma PADRÃO da assinatura (a que rege as
    // próximas renovações), pra Minha Assinatura poder avisar "sua forma
    // padrão continua sendo X" quando o cliente troca a forma só de uma
    // cobrança específica (ver pagarCobranca abaixo). Nunca confundir com o
    // billingType de uma cobrança individual (cobrancasEmAberto.billingType).
    const formaPagamentoAssinatura = entrada.tipo === 'dados'
      ? (entrada.assinatura.billingType ?? null)
      : null
    // Correção de produto — deixou de ser só OVERDUE: agora inclui também
    // PENDING, pra permitir trocar a forma de pagamento de uma cobrança
    // ANTES dela vencer (o cliente não precisa ficar inadimplente pra
    // trocar). Lógica extraída pra montarCobrancasEmAberto (asaasClient.ts)
    // — testável direto, filtra/ordena/formata sem I/O.
    const cobrancasEmAberto = entrada.tipo === 'dados'
      ? montarCobrancasEmAberto(entrada.cobrancas, tenant.asaas_subscription_id!)
      : []

    // Fase 6B — plano_pendente não faz parte de req.adminUser.tenant (ver
    // requireAdminAuth.ts, que só inclui `plano`) — consulta à parte, só
    // aqui onde é de fato usada, em vez de engordar o include compartilhado
    // por toda requisição autenticada. null na grande maioria das vezes
    // (só existe entre "escolheu um plano pago" e "webhook confirmou o
    // pagamento", ver criarAssinatura/calcularAtualizacaoTenant).
    const tenantComPendente = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { plano_pendente: { select: { nome: true, asaas_subscription_value: true, asaas_billing_cycle: true } } },
    })

    res.json({
      possuiAssinatura: Boolean(tenant.asaas_subscription_id),
      plano: tenant.plano ? {
        nome: tenant.plano.nome,
        valor: tenant.plano.asaas_subscription_value,
        ciclo: tenant.plano.asaas_billing_cycle,
      } : null,
      // Presente só entre a escolha do plano pago e a confirmação do
      // pagamento (webhook) — depois disso, plano_pendente_id é limpo e
      // este campo volta a null (ver calcularAtualizacaoTenant).
      planoPendente: tenantComPendente?.plano_pendente ? {
        nome: tenantComPendente.plano_pendente.nome,
        valor: tenantComPendente.plano_pendente.asaas_subscription_value,
        ciclo: tenantComPendente.plano_pendente.asaas_billing_cycle,
      } : null,
      situacaoComercial,
      situacaoAsaas: situacaoAsaas.decisao,
      motivoSituacaoAsaas: situacaoAsaas.motivo,
      proximaCobranca,
      formaPagamentoAssinatura,
      cobrancasEmAberto,
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

// Fase 6B — planos comerciais contratáveis via self-service (ver
// GET /billing/planos-disponiveis). Nunca inclui: o plano interno (nunca
// vendido a cliente comum), o plano de trial (não é um plano PAGO — é o que
// motivou o bug "Plano sem valor de assinatura configurado" ao tentar
// assinar o teste-gratis), planos desativados (ativo=false, fora de venda)
// e planos sem asaas_subscription_value configurado (nada a cobrar ainda).
// valor/ciclo vêm sempre de asaas_subscription_value/asaas_billing_cycle
// (o que é REALMENTE cobrado), nunca de preco_mensal (só informativo,
// pode divergir — ver nota em schema.prisma). Nenhum campo administrativo/
// Asaas (asaas_external_reference, ids) sai daqui.
export async function listarPlanosDisponiveis(_req: Request, res: Response) {
  try {
    const planos = await prisma.plano.findMany({
      where: { interno: false, eh_plano_trial: false, ativo: true, asaas_subscription_value: { not: null } },
      orderBy: { asaas_subscription_value: 'asc' },
      select: {
        id: true, nome: true, descricao: true,
        asaas_subscription_value: true, asaas_billing_cycle: true,
        limite_campanhas_ativas: true, limite_tours_ativos: true, limite_jornadas_ativas: true,
        permite_tours: true, permite_jornadas: true, permite_white_label: true,
      },
    })
    res.json(planos.map(p => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      valor: p.asaas_subscription_value,
      ciclo: p.asaas_billing_cycle,
      limite_campanhas_ativas: p.limite_campanhas_ativas,
      limite_tours_ativos: p.limite_tours_ativos,
      limite_jornadas_ativas: p.limite_jornadas_ativas,
      permite_tours: p.permite_tours,
      permite_jornadas: p.permite_jornadas,
      permite_white_label: p.permite_white_label,
    })))
  } catch (err) {
    console.error('Erro ao listar planos disponíveis:', err)
    res.status(500).json({ erro: 'Erro ao carregar planos disponíveis.' })
  }
}

// Contratação self-service — só quando o tenant AINDA não tem
// asaas_subscription_id (nunca cria assinatura nova em cima de uma
// existente — também protege contra duplicar em retry: uma segunda
// chamada, depois que a primeira já salvou asaas_subscription_id, cai
// direto neste 400 em vez de chamar o Asaas de novo; reativação de
// assinatura INACTIVE não existe mais nesta Fase, ver nota no topo do
// arquivo).
//
// Fase 6B — plano_id vem do body (o cliente ESCOLHE, não usa mais
// tenant.plano automaticamente — era esse o bug: tenant em trial tentando
// "assinar" o próprio teste-gratis, que nunca teve valor configurado).
// Plano é sempre recarregado do banco por id (nunca confia em nome/valor
// vindos do frontend); asaas_subscription_value do Plano recarregado é o
// que efetivamente vai pro Asaas. O plano escolhido é gravado em
// plano_pendente_id, NUNCA em plano_id — o Tenant continua no plano atual
// (ex.: teste-gratis) até o webhook PAYMENT_CONFIRMED aplicar de verdade
// (ver calcularAtualizacaoTenant em asaasClient.ts).
//
// Correção de produto — billingType deixou de ser fixo em 'UNDEFINED': o
// cliente agora escolhe explicitamente Cartão de crédito, Pix ou Boleto
// aqui no UserPulse (forma_pagamento no body), nunca na página do Asaas —
// só o enum validado por validarFormaPagamentoSelfService chega até
// criarAssinaturaAsaas (nunca o valor cru do body). UNDEFINED nunca é
// aceito nesta tela (só a Gestão SaaS ainda usa).
export async function criarAssinatura(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant

    const motivoBloqueio = bloqueioOperacaoFinanceiraSelfService(tenant.status)
    if (motivoBloqueio) { res.status(403).json({ erro: motivoBloqueio }); return }

    if (tenant.asaas_subscription_id) {
      res.status(400).json({ erro: 'Este tenant já tem uma assinatura Asaas vinculada.' })
      return
    }

    const { plano_id, forma_pagamento } = req.body as { plano_id?: string; forma_pagamento?: unknown }
    if (!plano_id?.trim()) {
      res.status(400).json({ erro: 'plano_id é obrigatório.' })
      return
    }
    const billingType = validarFormaPagamentoSelfService(forma_pagamento)
    if (!billingType) {
      res.status(400).json({ erro: 'forma_pagamento é obrigatório e deve ser "CREDIT_CARD", "PIX" ou "BOLETO".' })
      return
    }
    const planoEscolhido = await prisma.plano.findUnique({ where: { id: plano_id.trim() } })
    const motivoPlano = validarPlanoParaAssinaturaSelfService(planoEscolhido)
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
    const assinatura = await criarAssinaturaAsaas(customerId, planoEscolhido!, {
      billingType,
      nextDueDate: hoje,
    })

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        asaas_customer_id: customerId,
        asaas_subscription_id: assinatura.id,
        asaas_status: assinatura.status,
        asaas_ultima_sincronizacao: new Date(),
        plano_pendente_id: planoEscolhido!.id,
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

// Prepara pagamento (ou troca de forma) de uma cobrança em aberto da
// assinatura ("Pagar" / "Pagar com outra forma") — PENDING (antes do
// vencimento) ou OVERDUE (vencida), mesma validação pros dois; o cliente
// não precisa ficar inadimplente pra trocar. Só cobrancaId (via URL) e
// forma_pagamento (via body) vêm do frontend; value/tenant/customer/
// subscription/plano nunca são aceitos do cliente. Nunca cria cobrança
// nova, nunca mexe na assinatura nem em outra cobrança: só confirma que a
// cobrança buscada pertence à assinatura deste tenant e ainda está
// PENDING/OVERDUE (validarCobrancaParaRegularizacao), então troca o
// billingType SÓ DESTA cobrança pro valor escolhido (reaproveita
// validarFormaPagamentoSelfService — mesma allowlist CREDIT_CARD/PIX/
// BOLETO da primeira assinatura, nunca UNDEFINED nem duplica a regra).
// Correção de produto — a forma padrão da ASSINATURA (que rege as próximas
// renovações) nunca é tocada aqui; troca é sempre pontual, só desta
// cobrança (ver formaPagamentoAssinatura em obterSituacao acima).
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

    const billingType = validarFormaPagamentoSelfService((req.body as { forma_pagamento?: unknown }).forma_pagamento)
    if (!billingType) {
      res.status(400).json({ erro: 'forma_pagamento é obrigatório e deve ser "CREDIT_CARD", "PIX" ou "BOLETO".' })
      return
    }

    const cobranca = await buscarCobrancaAsaas(cobrancaId)
    const motivo = validarCobrancaParaRegularizacao(cobranca, tenant.asaas_subscription_id)
    if (motivo) { res.status(400).json({ erro: motivo }); return }

    let invoiceUrl = cobranca.invoiceUrl || cobranca.bankSlipUrl || null
    if (cobranca.billingType !== billingType) {
      try {
        // value/dueDate vêm da própria cobranca buscada acima — nunca do
        // body desta rota (que só aceita forma_pagamento) — só preservam o
        // que já estava lá. Nenhum outro campo da cobrança é alterado.
        const atualizada = await atualizarBillingTypeCobrancaAsaas(cobrancaId, {
          billingType,
          value: cobranca.value,
          dueDate: cobranca.dueDate,
        })
        invoiceUrl = atualizada.invoiceUrl || atualizada.bankSlipUrl || invoiceUrl
      } catch (err) {
        // Segue com a invoiceUrl que já existia (ainda paga a cobrança no
        // meio de pagamento original) — não bloqueia a regularização só
        // porque não deu pra trocar a forma de pagamento.
        console.error('Erro ao atualizar a forma de pagamento da cobrança:', err)
      }
    }

    res.json({ invoiceUrl })
  } catch (err) {
    console.error('Erro ao preparar pagamento de cobrança self-service:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao preparar pagamento no Asaas.' })
  }
}

// ─── Fase 8A — upgrade de plano self-service ────────────────────────────────
// Só pra tenant que já É pago (asaas_subscription_id/asaas_customer_id já
// vinculados — quem ainda não tem assinatura usa POST /billing/assinatura
// acima, não esta rota). Cobra só a diferença proporcional do restante do
// ciclo atual como uma cobrança AVULSA (criarCobrancaAvulsaAsaas — nunca
// mexe na assinatura recorrente aqui: isso só acontece depois que o
// pagamento confirma, ver tratarWebhookAsaas em asaasClient.ts, que
// atualiza o VALOR da assinatura ANTES de aplicar a troca, nunca depois).
// plano_id NUNCA é escrito aqui — só plano_pendente_id, mesmo padrão de
// criarAssinatura: o Tenant continua no plano atual até a confirmação
// financeira aplicar de verdade. Preço/plano SEMPRE recarregados do banco
// por id (nunca confia em valor vindo do frontend).

type ValidacaoUpgrade =
  | { ok: true; planoNovo: Plano; valorProporcional: number; diasRestantesCiclo: number; cicloDias: number }
  | { ok: false; status: number; erro: string }

// Recorte mínimo de campos que validarECalcularUpgrade realmente lê — Pick<>
// (não TenantComPlano inteiro) de propósito, mesmo padrão de
// TenantParaSituacao em tenantGuards.ts: mantém a função testável com um
// objeto pequeno em vez de precisar simular um Tenant completo (ver
// billing.test.ts, que testa os 4 bloqueios — SUSPENDED/CANCELED/
// tolerância/inadimplência — sem tocar Prisma, já que todos retornam antes
// de qualquer consulta ao banco).
export type TenantParaUpgrade = Pick<Tenant, 'status' | 'trial_fim' | 'licenca_fim' | 'asaas_subscription_id' | 'plano_pendente_id'> & {
  plano: Pick<Plano, 'id' | 'nome' | 'ativo' | 'interno' | 'eh_plano_trial' | 'asaas_subscription_value' | 'asaas_billing_cycle'> | null
}

// Reaproveitada por previewUpgrade (só calcula, nunca escreve nada) e
// solicitarUpgrade (calcula e efetivamente cobra) — a MESMA validação e o
// MESMO cálculo, pra nunca a prévia mostrar um valor e a confirmação cobrar
// outro. Nenhuma chamada ao Asaas aqui dentro (só leitura no banco) —
// segura de chamar livremente, sem efeito colateral. Exportada só pra
// teste direto (ver billing.test.ts) — nunca importada por outro
// controller, continua de uso interno deste arquivo.
export async function validarECalcularUpgrade(tenant: TenantParaUpgrade, planoIdBruto: unknown): Promise<ValidacaoUpgrade> {
  const motivoBloqueio = bloqueioOperacaoFinanceiraSelfService(tenant.status)
  if (motivoBloqueio) return { ok: false, status: 403, erro: motivoBloqueio }

  // Fase 8A (correção pós-revisão) — nunca permite upgrade fora de "em dia"
  // (situacaoAdimplenciaTenant, Fase 7): cobre tanto tolerância (ainda
  // opera normalmente, mas tem cobrança vencida em aberto) quanto
  // tolerância expirada (inadimplência de verdade). Reaproveitada sem
  // alteração — nunca duplica a regra. Motivo prático: misturar uma
  // cobrança vencida com uma troca de plano complicaria demais o
  // updatePendingPayments do PUT da assinatura (ver atualizarValorAssinaturaAsaas)
  // — com o tenant sempre em dia antes de chegar aqui, a única cobrança
  // PENDING que pode existir na assinatura é a do próximo ciclo, nunca uma
  // vencida do ciclo atual.
  if (situacaoAdimplenciaTenant(tenant) !== 'em_dia') {
    return { ok: false, status: 403, erro: 'Regularize os pagamentos em aberto antes de solicitar um upgrade de plano.' }
  }

  if (!tenant.asaas_subscription_id) {
    return { ok: false, status: 400, erro: 'Tenant ainda não tem uma assinatura ativa. Contrate um plano antes de solicitar upgrade.' }
  }

  // Correção pós-revisão 3 — situacaoAdimplenciaTenant (acima) só enxerga
  // Tenant.licenca_fim, que fica desatualizado até um PAYMENT_CONFIRMED
  // avançá-lo; um tenant pode estar "em dia" localmente com uma cobrança da
  // assinatura recorrente já OVERDUE de verdade no Asaas (a mesma que GET
  // /billing/situacao já mostra em "Cobranças vencidas"). Cross-check aqui
  // reaproveitando buscarEntradaSituacaoAsaas/calcularSituacaoAsaas
  // (mesmas funções de obterSituacao, nunca duplica a regra) — só a partir
  // daqui porque dependem de asaas_subscription_id, já garantido acima.
  // listarCobrancasAsaas filtra por subscription= no Asaas, então nunca
  // inclui a cobrança avulsa de um upgrade anterior (essa nunca é criada
  // com vínculo de assinatura, ver criarCobrancaAvulsaAsaas) — só cobranças
  // reais do ciclo recorrente contam. Falha ao consultar o Asaas
  // (INDETERMINADO) falha seguro: bloqueia em vez de assumir "em dia".
  const entradaAsaas = await buscarEntradaSituacaoAsaas(tenant)
  const situacaoAsaasUpgrade = calcularSituacaoAsaas(entradaAsaas)
  if (situacaoAsaasUpgrade.decisao === 'INADIMPLENTE') {
    return { ok: false, status: 403, erro: 'Regularize os pagamentos em aberto antes de solicitar um upgrade de plano.' }
  }
  if (situacaoAsaasUpgrade.decisao === 'INDETERMINADO') {
    return { ok: false, status: 503, erro: 'Não foi possível confirmar sua situação financeira no Asaas agora. Tente novamente em instantes.' }
  }

  const motivoPendencia = motivoUpgradePendenteBloqueiaNovaTroca(tenant.plano_pendente_id)
  if (motivoPendencia) return { ok: false, status: 409, erro: motivoPendencia }

  const planoId = typeof planoIdBruto === 'string' ? planoIdBruto.trim() : ''
  if (!planoId) return { ok: false, status: 400, erro: 'plano_id é obrigatório.' }

  const planoNovo = await prisma.plano.findUnique({ where: { id: planoId } })
  const motivoPlano = validarUpgradePlano(tenant.plano, planoNovo)
  if (motivoPlano) return { ok: false, status: 400, erro: motivoPlano }

  // Fase 8A (correção pós-revisão 2) — precisa do vencimento real do ciclo
  // atual pra calcular a duração REAL do ciclo (duracaoCicloDiasReal inverte
  // o cálculo de vencimento a partir dele, ver asaasClient.ts). Tenant.
  // licenca_fim é a fonte normal, mas pode estar vazia mesmo pra um tenant
  // ACTIVE em dia (nenhum webhook de pagamento confirmado ainda avançou
  // esse campo) — resolverVencimentoCicloAtual cai pro Asaas nesse caso,
  // exatamente a mesma fonte que GET /billing/situacao já usa pra exibir
  // "Próxima cobrança", então nunca diverge do que o cliente já viu na
  // tela. Só bloqueia se nem o banco nem o Asaas tiverem a data.
  const vencimentoCiclo = await resolverVencimentoCicloAtual(tenant)
  if (!vencimentoCiclo) {
    return { ok: false, status: 400, erro: 'Não foi possível calcular o ciclo atual da assinatura no momento. Tente novamente em alguns instantes.' }
  }
  const cicloDias = duracaoCicloDiasReal(vencimentoCiclo, tenant.plano!.asaas_billing_cycle)
  const diasRestantes = diasRestantesCicloAtual(vencimentoCiclo, cicloDias)
  const valorProporcional = calcularValorProporcionalUpgrade({
    valorAtual: Number(tenant.plano!.asaas_subscription_value ?? 0),
    valorNovo: Number(planoNovo!.asaas_subscription_value),
    diasRestantesCiclo: diasRestantes,
    cicloDias,
  })

  // Fase 8A (correção pós-revisão) — nunca cria cobrança de valor zero no
  // Asaas (provavelmente nem seria aceita) nem aplica o plano de graça sem
  // nenhuma confirmação financeira (quebraria "nunca altera plano_id antes
  // da confirmação"). Acontece só num upgrade solicitado bem perto do fim
  // do ciclo atual — tentar de novo já no próximo ciclo resolve.
  if (valorProporcional <= 0) {
    return { ok: false, status: 400, erro: 'Não há valor proporcional a cobrar neste ciclo. Você poderá fazer o upgrade após a próxima renovação.' }
  }

  return { ok: true, planoNovo: planoNovo!, valorProporcional, diasRestantesCiclo: Math.ceil(diasRestantes), cicloDias }
}

// Prévia SEM efeito colateral no banco (nunca escreve no Tenant) — existe
// pra Minha Assinatura mostrar plano atual/novo/valor proporcional/próximo
// ciclo ANTES do cliente confirmar, sem o frontend precisar calcular nada
// sozinho (regra explícita da tarefa). Correção pós-revisão 2: PODE chamar
// o Asaas (só leitura, GET /subscriptions) via resolverVencimentoCicloAtual
// quando Tenant.licenca_fim está vazio — nunca escreve nada, nem no Tenant
// nem no Asaas.
export async function previewUpgrade(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const resultado = await validarECalcularUpgrade(tenant, req.query.plano_id)
    if (!resultado.ok) { res.status(resultado.status).json({ erro: resultado.erro }); return }

    res.json({
      planoAtual: tenant.plano && {
        id: tenant.plano.id, nome: tenant.plano.nome,
        valor: tenant.plano.asaas_subscription_value, ciclo: tenant.plano.asaas_billing_cycle,
      },
      planoNovo: {
        id: resultado.planoNovo.id, nome: resultado.planoNovo.nome,
        valor: resultado.planoNovo.asaas_subscription_value, ciclo: resultado.planoNovo.asaas_billing_cycle,
      },
      valorProporcional: resultado.valorProporcional,
      diasRestantesCiclo: resultado.diasRestantesCiclo,
      cicloDias: resultado.cicloDias,
    })
  } catch (err) {
    console.error('Erro ao calcular prévia de upgrade de plano:', err)
    res.status(500).json({ erro: 'Erro ao calcular prévia de upgrade.' })
  }
}

export async function solicitarUpgrade(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const { plano_id } = req.body as { plano_id?: string }
    const resultado = await validarECalcularUpgrade(tenant, plano_id)
    if (!resultado.ok) { res.status(resultado.status).json({ erro: resultado.erro }); return }

    const hoje = new Date().toISOString().slice(0, 10)
    const cobranca = await criarCobrancaAvulsaAsaas(tenant.asaas_customer_id!, {
      value: resultado.valorProporcional,
      dueDate: hoje,
      description: `Upgrade de plano: ${tenant.plano!.nome} para ${resultado.planoNovo.nome} (proporcional do ciclo atual)`,
      externalReference: resultado.planoNovo.id,
    })

    // plano_pendente_id/plano_pendente_payment_id gravados só DEPOIS que a
    // cobrança foi criada com sucesso no Asaas — se a criação falhar (catch
    // abaixo), nada muda no Tenant, nenhuma pendência órfã sem cobrança
    // nenhuma pra confirmar. plano_pendente_payment_id (Fase 8A, correção
    // pós-revisão) é o que o webhook usa pra só aplicar este upgrade quando
    // EXATAMENTE esta cobrança confirmar — nunca uma renovação normal ou
    // qualquer outro pagamento do tenant (ver pagamentoConfirmaPendencia em
    // asaasClient.ts).
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { plano_pendente_id: resultado.planoNovo.id, plano_pendente_payment_id: cobranca.id },
    })

    res.status(201).json({
      valorProporcional: resultado.valorProporcional,
      diasRestantesCiclo: resultado.diasRestantesCiclo,
      cicloDias: resultado.cicloDias,
      invoiceUrl: cobranca.invoiceUrl || cobranca.bankSlipUrl || null,
      planoNovo: {
        id: resultado.planoNovo.id,
        nome: resultado.planoNovo.nome,
        valor: resultado.planoNovo.asaas_subscription_value,
        ciclo: resultado.planoNovo.asaas_billing_cycle,
      },
    })
  } catch (err) {
    console.error('Erro ao solicitar upgrade de plano self-service:', err)
    res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao solicitar upgrade no Asaas.' })
  }
}
