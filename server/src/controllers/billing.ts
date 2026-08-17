import { Request, Response } from 'express'
import type { Plano, Tenant } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  obterSituacaoComercialTenant, situacaoAdimplenciaTenant, type TenantComPlano,
  contarUsoRecursosAtivos, avaliarEncaixeLimitesDowngrade, type RecursoIncompativelDowngrade,
} from '../lib/tenantGuards'
import {
  criarClienteAsaas, criarAssinaturaAsaas, atualizarClienteAsaas, buscarCobrancaAsaas,
  listarCobrancasAsaas, atualizarBillingTypeCobrancaAsaas,
  calcularSituacaoAsaas, buscarEntradaSituacaoAsaas, validarPlanoParaAssinaturaSelfService,
  validarFormaPagamentoSelfService,
  validarCobrancaParaRegularizacao, montarCobrancasEmAberto, bloqueioOperacaoFinanceiraSelfService,
  validarUpgradePlano, motivoUpgradePendenteBloqueiaNovaTroca, motivoDowngradeEmAndamentoBloqueiaUpgrade, duracaoCicloDiasReal,
  diasRestantesCicloAtual, calcularValorProporcionalUpgrade, criarCobrancaAvulsaAsaas,
  resolverVencimentoCicloAtual, cancelarCobrancaAsaas, motivoCancelamentoUpgradeBloqueado,
  erroAsaasStatus, type CobrancaAsaas, dataCivilBRT, resolverValorAssinaturaExibido,
  motivoDowngradePlano, motivoCobrancaAnteriorBloqueiaDowngrade,
  identificarCobrancaProximoCiclo, type CobrancaProximoCicloResultado,
  buscarAssinaturaAsaas, atualizarValorAssinaturaAsaas, decidirEstadoRemotoDowngrade,
  classificarClaimDowngrade, downgradeAgendamentoCompleto, downgradeDeveEfetivar,
  motivoRestauracaoDowngradeBloqueada, type ResolucaoCobrancaProximoCiclo,
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
      select: {
        plano_pendente_id: true,
        plano_pendente_payment_id: true,
        plano_pendente: { select: { nome: true, asaas_subscription_value: true, asaas_billing_cycle: true } },
      },
    })

    res.json({
      possuiAssinatura: Boolean(tenant.asaas_subscription_id),
      plano: tenant.plano ? {
        id: tenant.plano.id,
        nome: tenant.plano.nome,
        // Fase 8B — nivel (não preço) é o que o frontend usa pra classificar
        // upgrade/downgrade ao listar planos-disponiveis (ver
        // compararNivelPlanos em asaasClient.ts, mesma regra do backend,
        // nunca reimplementada por preço no cliente).
        nivel: tenant.plano.nivel,
        // Fase 8B (fundação) — valor REALMENTE contratado, não o preço de
        // catálogo puro (ver resolverValorAssinaturaExibido). Sem escrita
        // nenhuma aqui, só leitura em ordem de prioridade.
        valor: resolverValorAssinaturaExibido(
          tenant.valor_assinatura_atual,
          entrada.tipo === 'dados' ? entrada.assinatura.value : null,
          tenant.plano.asaas_subscription_value
        ),
        ciclo: tenant.plano.asaas_billing_cycle,
      } : null,
      // Fase 8B — downgrade agendado, exposto SOMENTE quando o agendamento
      // está COMPLETO (downgradeAgendamentoCompleto, mesma função usada por
      // solicitarDowngrade/cancelarDowngrade/o scheduler — nunca uma
      // segunda definição de estado). Um claim TÉCNICO incompleto (Asaas já
      // reprecificado, mas downgrade_valor_origem ainda null, ver
      // classificarClaimDowngrade) nunca aparece aqui — a UI não tem nada a
      // mostrar/cancelar até a persistência confirmar. valorDestino vem
      // sempre do SNAPSHOT (downgrade_valor_destino), nunca de
      // Plano.asaas_subscription_value — o catálogo pode ter mudado desde o
      // agendamento, o valor exibido tem que ser o combinado. Nunca expõe
      // downgrade_valor_origem nem qualquer id financeiro/técnico do claim.
      downgradeAgendado: (downgradeAgendamentoCompleto(tenant) && tenant.plano_downgrade) ? {
        plano: { id: tenant.plano_downgrade.id, nome: tenant.plano_downgrade.nome },
        efetivarEm: tenant.downgrade_efetivar_em!.toISOString(),
        valorDestino: tenant.downgrade_valor_destino,
      } : null,
      // Presente só entre a escolha do plano pago e a confirmação do
      // pagamento (webhook) — depois disso, plano_pendente_id é limpo e
      // este campo volta a null (ver calcularAtualizacaoTenant).
      planoPendente: tenantComPendente?.plano_pendente ? {
        nome: tenantComPendente.plano_pendente.nome,
        valor: tenantComPendente.plano_pendente.asaas_subscription_value,
        ciclo: tenantComPendente.plano_pendente.asaas_billing_cycle,
      } : null,
      // Correção pós-homologação — planoPendente sozinho não distingue
      // upgrade (Fase 8A, tem cobrança avulsa própria e É cancelável via
      // DELETE /billing/upgrade) de uma primeira assinatura ainda não paga
      // (criarAssinatura também grava plano_pendente_id, mas nunca
      // plano_pendente_payment_id — mesma cobrança recorrente da
      // assinatura, nada avulso pra cancelar). Booleano explícito em vez de
      // o frontend inferir por outro campo; nunca expõe o payment id em si
      // (só usado internamente por cancelarUpgrade, ver billing.ts).
      upgradePendenteCancelavel: Boolean(tenantComPendente?.plano_pendente_id && tenantComPendente?.plano_pendente_payment_id),
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
        id: true, nome: true, descricao: true, nivel: true,
        asaas_subscription_value: true, asaas_billing_cycle: true,
        limite_campanhas_ativas: true, limite_tours_ativos: true, limite_jornadas_ativas: true,
        permite_tours: true, permite_jornadas: true, permite_white_label: true,
      },
    })
    res.json(planos.map(p => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      // Fase 8B — hierarquia EXPLÍCITA (nunca por preço, ver compararNivelPlanos
      // em asaasClient.ts) que o frontend usa pra oferecer upgrade (nivel
      // maior) ou downgrade (nivel menor) na Minha Assinatura. null (plano
      // sem nivel configurado) nunca oferece troca self-service.
      nivel: p.nivel,
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

    // Correção pós-homologação — dia civil em America/Sao_Paulo, nunca
    // toISOString().slice(0,10) (UTC): a partir das 21h no horário de
    // Brasília, UTC já virou o dia seguinte.
    const hoje = dataCivilBRT()
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
// 'nivel' entrou no Pick só pra satisfazer o tipo PlanoParaUpgrade de
// validarUpgradePlano (asaasClient.ts), que passou a exigi-lo por causa de
// motivoDowngradePlano (mesmo tipo compartilhado pelas duas funções) —
// validarUpgradePlano em si CONTINUA decidindo superior/inferior por preço,
// não lê 'nivel' (ver comentário em validarUpgradePlano). Nenhuma mudança
// de comportamento do upgrade nesta rodada, só de tipo.
// 'plano_downgrade_id' (correção pós-revisão — auditoria 8B, bloqueador):
// motivoDowngradeEmAndamentoBloqueiaUpgrade precisa dele pra recusar
// upgrade enquanto existe QUALQUER downgrade em andamento (claim
// incompleto ou completo) na mesma assinatura.
export type TenantParaUpgrade = Pick<Tenant, 'status' | 'trial_fim' | 'licenca_fim' | 'asaas_subscription_id' | 'plano_pendente_id' | 'plano_downgrade_id'> & {
  plano: Pick<Plano, 'id' | 'nome' | 'ativo' | 'interno' | 'eh_plano_trial' | 'asaas_subscription_value' | 'asaas_billing_cycle' | 'nivel'> | null
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

  // Correção pós-revisão (auditoria 8B, bloqueador) — nunca permite upgrade
  // enquanto plano_downgrade_id estiver preenchido, seja claim TÉCNICO
  // incompleto ou agendamento COMPLETO (ver motivoDowngradeEmAndamentoBloqueiaUpgrade,
  // asaasClient.ts — deliberadamente não usa downgradeAgendamentoCompleto,
  // que só cobriria o caso completo). Cliente precisa cancelar ou deixar o
  // downgrade concluir antes de solicitar um upgrade.
  const motivoDowngradeAndamento = motivoDowngradeEmAndamentoBloqueiaUpgrade(tenant.plano_downgrade_id)
  if (motivoDowngradeAndamento) return { ok: false, status: 409, erro: motivoDowngradeAndamento }

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

  return { ok: true, planoNovo: planoNovo!, valorProporcional, diasRestantesCiclo: diasRestantes, cicloDias }
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

    // Correção pós-homologação — dueDate precisa ser o dia civil em
    // America/Sao_Paulo (dataCivilBRT), nunca new Date().toISOString().
    // slice(0,10) (dia civil em UTC): a partir das 21h no horário de
    // Brasília, UTC já virou o dia seguinte, e uma cobrança criada às
    // 21h06 do dia 12 vencia incorretamente no dia 13.
    const hoje = dataCivilBRT()
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

// Correção pós-homologação — DELETE /billing/upgrade. Único jeito de sair
// de um upgrade pendente que nunca foi pago (antes desta rota só existia
// saída por PAYMENT_CONFIRMED via webhook, deixando o tenant travado pra
// sempre se desistisse ou abandonasse a cobrança — ver
// motivoUpgradePendenteBloqueiaNovaTroca acima). O payment id usado é
// SEMPRE o persistido em Tenant.plano_pendente_payment_id — nunca um id
// vindo do body/params (nem existe campo pra isso nesta rota).
//
// Nunca toca: plano_id, asaas_subscription_id, valor da assinatura,
// cobrança recorrente, licenca_fim. Só plano_pendente_id/
// plano_pendente_payment_id, e só depois de confirmar no Asaas.
export async function cancelarUpgrade(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant

    // plano_pendente_id/plano_pendente_payment_id não fazem parte de
    // req.adminUser.tenant (mesma observação de obterSituacao acima) —
    // consulta à parte, só aqui onde são de fato usados.
    const tenantComPendente = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { plano_pendente_id: true, plano_pendente_payment_id: true },
    })
    const planoPendenteId = tenantComPendente?.plano_pendente_id ?? null
    const paymentId = tenantComPendente?.plano_pendente_payment_id ?? null

    if (!planoPendenteId || !paymentId) {
      res.status(400).json({ erro: 'Não há upgrade pendente para cancelar.' })
      return
    }

    // Busca a cobrança real no Asaas ANTES de decidir qualquer coisa — nunca
    // confia só no que está no banco. 404 aqui significa que a cobrança já
    // não existe mais no Asaas (cobranca fica null, tratado como já-
    // cancelado por motivoCancelamentoUpgradeBloqueado) — cobre o retry de
    // um cancelamento anterior que teve sucesso no Asaas mas falhou antes de
    // limpar o Tenant. Qualquer outra falha (rede, 401, 500) propaga como
    // erro 502, sem tocar em nada local — permite nova tentativa.
    let cobranca: CobrancaAsaas | null = null
    try {
      cobranca = await buscarCobrancaAsaas(paymentId)
    } catch (err) {
      if (erroAsaasStatus(err) !== 404) {
        console.error('Erro ao consultar cobrança do upgrade pendente no Asaas:', err)
        res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao consultar cobrança no Asaas.' })
        return
      }
    }

    const motivoBloqueio = motivoCancelamentoUpgradeBloqueado(
      { plano_pendente_id: planoPendenteId, plano_pendente_payment_id: paymentId, asaas_customer_id: tenant.asaas_customer_id },
      cobranca
    )
    if (motivoBloqueio) {
      res.status(409).json({ erro: motivoBloqueio })
      return
    }

    // cobranca === null já significa "sem nada pra cancelar no Asaas" (ver
    // acima) — só chama o DELETE quando ela ainda existe de verdade. Mesmo
    // tratamento de 404 do GET: corrida entre este GET e o DELETE (alguém
    // cancelou por fora entre as duas chamadas) também conta como já-
    // cancelado, nunca como falha.
    if (cobranca) {
      try {
        await cancelarCobrancaAsaas(paymentId)
      } catch (err) {
        if (erroAsaasStatus(err) !== 404) {
          console.error('Erro ao cancelar cobrança do upgrade pendente no Asaas:', err)
          res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao cancelar cobrança no Asaas.' })
          return
        }
      }
    }

    // updateMany (não update) condicionado ao MESMO payment id que acabou de
    // ser cancelado — se uma troca concorrente já tiver substituído
    // plano_pendente_payment_id por outra cobrança nesse meio-tempo, este
    // WHERE não bate e count fica 0: nunca limpa a pendência de uma troca
    // posterior por engano.
    await prisma.tenant.updateMany({
      where: { id: tenant.id, plano_pendente_payment_id: paymentId },
      data: { plano_pendente_id: null, plano_pendente_payment_id: null },
    })

    res.json({ cancelado: true })
  } catch (err) {
    console.error('Erro ao cancelar upgrade de plano pendente:', err)
    res.status(500).json({ erro: 'Erro ao cancelar upgrade pendente.' })
  }
}

// ─── Fase 8B (fundação) — downgrade agendado self-service ──────────────────
// Só o preview nesta etapa (GET, sem efeito colateral nenhum): nunca grava
// Tenant, nunca chama atualizarValorAssinaturaAsaas/criarCobrancaAvulsaAsaas,
// nunca cria payment. POST /downgrade (solicitação de verdade, que grava
// plano_downgrade_id/downgrade_efetivar_em/os 2 snapshots de valor E
// reprecifica a assinatura Asaas) fica pra uma próxima etapa.

// 'nivel' é o que motivoDowngradePlano usa pra decidir superior/inferior/
// mesmo/indeterminado agora (compararNivelPlanos, asaasClient.ts) — nunca
// mais 'asaas_subscription_value' pra essa decisão (esse campo continua no
// Pick só porque valorDestino do preview ainda vem dele).
// Correção pós-revisão (concorrência/recovery) — o claim atômico só é
// criado por updateMany({ WHERE plano_downgrade_id: null }), gravando
// plano_downgrade_id + downgrade_efetivar_em + downgrade_valor_destino
// TODOS DE UMA VEZ, antes de chamar o Asaas; nunca sobrescrito depois (ver
// solicitarDowngrade abaixo) — só downgrade_valor_origem fica null até o
// Asaas confirmar. classificarClaimDowngrade usa esse campo pra distinguir
// "claim incompleto/recuperável" (mesmo plano, origem ainda null) de
// bloqueio de verdade. downgrade_valor_destino entra no Pick porque
// recovery precisa reler o DESTINO já congelado no claim, nunca o preço
// atual do catálogo (bug corrigido: catálogo pode mudar entre a primeira
// tentativa e o retry).
export type TenantParaDowngrade = Pick<Tenant, 'id' | 'status' | 'trial_fim' | 'licenca_fim' | 'asaas_subscription_id' | 'plano_pendente_id' | 'plano_downgrade_id' | 'downgrade_efetivar_em' | 'downgrade_valor_origem' | 'downgrade_valor_destino' | 'valor_assinatura_atual'> & {
  plano: Pick<Plano, 'id' | 'nome' | 'ativo' | 'interno' | 'eh_plano_trial' | 'asaas_subscription_value' | 'asaas_billing_cycle' | 'nivel'> | null
}

type ValidacaoPreviewDowngrade =
  | {
      ok: true
      planoNovo: Plano
      valorAtualContratado: number
      efetivarEm: Date
      limitesIncompativeis: RecursoIncompativelDowngrade[]
      cobrancaAnteriorBloqueio: string | null
      cobrancaProximoCiclo: CobrancaProximoCicloResultado
    }
  | { ok: false; status: number; erro: string }

// Reaproveitada só por previewDowngrade nesta etapa (mesmo padrão de
// validarECalcularUpgrade — exportada pra teste direto, nunca importada
// por outro controller). Mesma ORDEM de checagens de validarECalcularUpgrade
// (bloqueio financeiro → adimplência local → assinatura vinculada →
// cross-check Asaas ao vivo → concorrência → plano), com 2 diferenças
// deliberadas da 8B: bloqueia tanto upgrade pendente QUANTO downgrade já
// agendado (dois campos independentes), e o valor "atual" pra validar o
// plano vem do Asaas ao vivo (entrada.assinatura.value), nunca do catálogo.
export async function validarECalcularPreviewDowngrade(
  tenant: TenantParaDowngrade,
  planoIdBruto: unknown
): Promise<ValidacaoPreviewDowngrade> {
  const motivoBloqueio = bloqueioOperacaoFinanceiraSelfService(tenant.status)
  if (motivoBloqueio) return { ok: false, status: 403, erro: motivoBloqueio }

  if (situacaoAdimplenciaTenant(tenant) !== 'em_dia') {
    return { ok: false, status: 403, erro: 'Regularize os pagamentos em aberto antes de solicitar um downgrade de plano.' }
  }

  if (!tenant.asaas_subscription_id) {
    return { ok: false, status: 400, erro: 'Tenant ainda não tem uma assinatura ativa. Não é possível calcular downgrade.' }
  }

  // Mesmo cross-check ao vivo de validarECalcularUpgrade (Tenant.licenca_fim
  // pode estar desatualizado até o próximo PAYMENT_CONFIRMED) — reaproveita
  // buscarEntradaSituacaoAsaas/calcularSituacaoAsaas, nunca duplica a regra.
  const entradaAsaas = await buscarEntradaSituacaoAsaas(tenant)
  const situacaoAsaasDowngrade = calcularSituacaoAsaas(entradaAsaas)
  if (situacaoAsaasDowngrade.decisao === 'INADIMPLENTE') {
    return { ok: false, status: 403, erro: 'Regularize os pagamentos em aberto antes de solicitar um downgrade de plano.' }
  }
  if (situacaoAsaasDowngrade.decisao === 'INDETERMINADO' || entradaAsaas.tipo !== 'dados') {
    return { ok: false, status: 503, erro: 'Não foi possível confirmar sua situação financeira no Asaas agora. Tente novamente em instantes.' }
  }

  const motivoUpgradePendente = motivoUpgradePendenteBloqueiaNovaTroca(tenant.plano_pendente_id)
  if (motivoUpgradePendente) return { ok: false, status: 409, erro: motivoUpgradePendente }

  // planoId precisa vir ANTES do check de claim agora (diferente da ordem de
  // validarECalcularUpgrade) — classificarClaimDowngrade precisa saber PRA
  // QUAL plano esta solicitação é, pra distinguir "recuperável" (mesmo
  // plano, claim incompleto) de bloqueio de verdade (ver função, asaasClient.ts).
  // Preview só usa o resultado pra decidir bloqueado/não — 'recuperavel'
  // conta como liberado aqui (mesma UX de antes: mostra a prévia
  // normalmente); é o POST (solicitarDowngrade) quem de fato usa os
  // snapshots do estado 'recuperavel', nunca este preview.
  const planoId = typeof planoIdBruto === 'string' ? planoIdBruto.trim() : ''
  if (!planoId) return { ok: false, status: 400, erro: 'plano_id é obrigatório.' }

  const classificacaoClaim = classificarClaimDowngrade(tenant, planoId)
  if (classificacaoClaim.estado === 'bloqueado') return { ok: false, status: 409, erro: classificacaoClaim.motivo }

  const planoNovo = await prisma.plano.findUnique({ where: { id: planoId } })

  // Preço ATUAL da operação: valor REAL da assinatura no Asaas agora (nunca
  // tenant.plano.asaas_subscription_value, que é catálogo e pode já ter
  // divergido). Só usado pra exibição no preview (valorAtualContratado
  // abaixo) e, mais adiante, pro snapshot downgrade_valor_origem — não
  // decide mais direção (upgrade/downgrade), ver motivoDowngradePlano.
  const valorAtualContratado = Number(entradaAsaas.assinatura.value)
  if (!Number.isFinite(valorAtualContratado)) {
    return { ok: false, status: 503, erro: 'Não foi possível confirmar o valor atual da assinatura no Asaas agora. Tente novamente em instantes.' }
  }

  // Correção pós-revisão (Fase 8B) — direção (superior/inferior) decidida
  // por Plano.nivel (compararNivelPlanos), nunca mais por preço: preço pode
  // subir num downgrade funcional (catálogo mudou, valor contratado ficou
  // pra trás) sem que isso deixe de ser um downgrade — ver comparação no
  // response de previewDowngrade abaixo, que expõe os dois valores sem
  // assumir qual é maior.
  const motivoPlano = motivoDowngradePlano(tenant.plano, planoNovo)
  if (motivoPlano) return { ok: false, status: 400, erro: motivoPlano }

  // efetivarEm = fim do ciclo já pago — mesma fonte de resolução robusta já
  // usada por upgrade (licenca_fim, com fallback pro Asaas quando ainda
  // vazio), nunca recalculada aqui.
  const efetivarEm = await resolverVencimentoCicloAtual(tenant)
  if (!efetivarEm) {
    return { ok: false, status: 400, erro: 'Não foi possível calcular a data de efetivação do downgrade no momento. Tente novamente em alguns instantes.' }
  }

  const uso = await contarUsoRecursosAtivos(tenant.id)
  const limitesIncompativeis = avaliarEncaixeLimitesDowngrade(uso, planoNovo!)

  // cobrancas já vieram no mesmo buscarEntradaSituacaoAsaas acima — nenhuma
  // chamada extra ao Asaas só pra isso.
  const cobrancaAnteriorBloqueio = motivoCobrancaAnteriorBloqueiaDowngrade(entradaAsaas.cobrancas, efetivarEm)
  const cobrancaProximoCiclo = identificarCobrancaProximoCiclo(entradaAsaas.cobrancas, tenant.asaas_subscription_id, efetivarEm)

  return { ok: true, planoNovo: planoNovo!, valorAtualContratado, efetivarEm, limitesIncompativeis, cobrancaAnteriorBloqueio, cobrancaProximoCiclo }
}

// GET /billing/downgrade/preview — só leitura, nenhum efeito colateral (ver
// comentário acima da seção). Nunca expõe IDs financeiros internos
// (asaas_customer_id/asaas_subscription_id, payment id da cobrança do
// próximo ciclo) — só o que a UI precisa pra mostrar a prévia.
export async function previewDowngrade(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const resultado = await validarECalcularPreviewDowngrade(tenant, req.query.plano_id)
    if (!resultado.ok) { res.status(resultado.status).json({ erro: resultado.erro }); return }

    const cobrancaProximoCiclo = resultado.cobrancaProximoCiclo.situacao === 'identificada'
      ? {
          situacao: 'identificada' as const,
          status: resultado.cobrancaProximoCiclo.cobranca.status,
          value: resultado.cobrancaProximoCiclo.cobranca.value,
          dueDate: resultado.cobrancaProximoCiclo.cobranca.dueDate,
        }
      : resultado.cobrancaProximoCiclo.situacao === 'ambigua'
      ? { situacao: 'ambigua' as const, quantidade: resultado.cobrancaProximoCiclo.quantidade }
      : { situacao: 'nao_encontrada' as const }

    // "ambigua" bloqueia (situação que precisa de intervenção antes de
    // qualquer operação financeira futura, ver identificarCobrancaProximoCiclo);
    // "nao_encontrada" NÃO bloqueia — é o estado comum quando o Asaas ainda
    // não gerou a cobrança do próximo ciclo, nada de errado nisso.
    const podeSolicitar =
      resultado.limitesIncompativeis.length === 0 &&
      resultado.cobrancaAnteriorBloqueio === null &&
      resultado.cobrancaProximoCiclo.situacao !== 'ambigua'

    res.json({
      planoAtual: tenant.plano ? { id: tenant.plano.id, nome: tenant.plano.nome } : null,
      planoDestino: { id: resultado.planoNovo.id, nome: resultado.planoNovo.nome },
      valorAtualContratado: resultado.valorAtualContratado,
      valorDestino: resultado.planoNovo.asaas_subscription_value,
      efetivarEm: resultado.efetivarEm.toISOString(),
      limites: {
        compativel: resultado.limitesIncompativeis.length === 0,
        detalhes: resultado.limitesIncompativeis,
      },
      cobrancaAnteriorBloqueio: resultado.cobrancaAnteriorBloqueio,
      cobrancaProximoCiclo,
      podeSolicitar,
    })
  } catch (err) {
    console.error('Erro ao calcular prévia de downgrade de plano:', err)
    res.status(500).json({ erro: 'Erro ao calcular prévia de downgrade.' })
  }
}

// POST /billing/downgrade — solicitação de verdade. Duas fases bem
// separadas, deliberadamente:
//
// (1) NOVA SOLICITAÇÃO — só quando classificarClaimDowngrade diz
//     'sem_claim': refaz TODA a validação (validarECalcularPreviewDowngrade
//     — plano/nivel/adimplência/assinatura/limites/cobranças) com dados
//     ATUAIS do catálogo/licenca_fim, e só então tenta CRIAR o claim.
//
// (2) RECOVERY — classificarClaimDowngrade diz 'recuperavel' (direto, ou
//     depois de perder a corrida pra criar o claim em (1)): NUNCA revalida
//     com dados mutáveis (catálogo/nivel/limites/adimplência) — usa só os
//     snapshots já congelados no claim (downgrade_valor_destino/
//     downgrade_efetivar_em) e reconcilia com o Asaas via leitura do valor
//     remoto + decidirEstadoRemotoDowngrade. Existe pra terminar uma
//     operação financeira já iniciada, não pra reavaliar se ela ainda faz
//     sentido pelas regras de hoje.
//
// Concorrência — mesmo padrão já usado no projeto (updateMany condicionado,
// ver cancelarUpgrade acima e reivindicarRegistro em trialAlertasScheduler.ts):
// nenhum SELECT FOR UPDATE/transação interativa com lock explícito existe
// hoje neste código-base (investigado antes de implementar) — o padrão
// estabelecido é sempre um UPDATE condicionado ao estado esperado, decidido
// pelo COUNT de linhas afetadas, nunca um mutex em memória.
//
// Correção pós-revisão (concorrência/recovery) — o claim só é CRIADO com
// WHERE plano_downgrade_id: null, e NUNCA sobrescrito depois (desenho
// anterior aceitava um segundo ramo "mesmo plano + origem null" no WHERE de
// criação, que podia REGRAVAR destino/data a cada retry — abria brecha pra
// sobrescrever o snapshot de quem já tinha ganhado a corrida). Se a criação
// perder a corrida (count=0), recarrega o Tenant e reclassifica: os
// snapshots de quem ganhou (nunca os que esta requisição calculou) é que
// valem — corrige o cenário obrigatório "A ganha com destino 149; B perde,
// recarrega, usa 149 — nunca grava 179 mesmo que o catálogo tenha mudado".
export async function solicitarDowngrade(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant
    const { plano_id } = req.body as { plano_id?: string }

    const motivoBloqueio = bloqueioOperacaoFinanceiraSelfService(tenant.status)
    if (motivoBloqueio) { res.status(403).json({ erro: motivoBloqueio }); return }

    const planoId = typeof plano_id === 'string' ? plano_id.trim() : ''
    if (!planoId) { res.status(400).json({ erro: 'plano_id é obrigatório.' }); return }

    const classificacao = classificarClaimDowngrade(tenant, planoId)
    if (classificacao.estado === 'bloqueado') { res.status(409).json({ erro: classificacao.motivo }); return }

    let valorDestino: number
    let efetivarEm: Date
    let planoDestino: { id: string; nome: string }
    let valorOrigem: number

    if (classificacao.estado === 'recuperavel') {
      // RECOVERY direto — claim de uma tentativa anterior (desta ou de
      // outra requisição) já existe pra ESTE plano. valor_assinatura_atual
      // já deveria estar resolvido desde a solicitação original (que roda
      // ANTES de criar o claim, ver ramo `else` abaixo) — se ainda está
      // null aqui, é estado inconsistente: fail-closed, nunca tenta
      // resolver de novo (isso seria "recalcular" durante o recovery).
      if (tenant.valor_assinatura_atual == null) {
        res.status(409).json({ erro: 'O agendamento de downgrade deste tenant está em um estado inconsistente — contate o suporte antes de tentar novamente.' })
        return
      }
      valorOrigem = Number(tenant.valor_assinatura_atual)
      valorDestino = Number(classificacao.valorDestino)
      efetivarEm = classificacao.efetivarEm
      const plano = await prisma.plano.findUnique({ where: { id: planoId }, select: { id: true, nome: true } })
      if (!plano) { res.status(409).json({ erro: 'O plano de destino deste downgrade não foi encontrado — contate o suporte.' }); return }
      planoDestino = plano
    } else {
      // NOVA SOLICITAÇÃO — valida tudo com dados ATUAIS (catálogo/licenca_fim/
      // nivel/limites/cobranças) — única fase que faz isso.
      const resultado = await validarECalcularPreviewDowngrade(tenant, planoId)
      if (!resultado.ok) { res.status(resultado.status).json({ erro: resultado.erro }); return }
      if (resultado.limitesIncompativeis.length > 0) {
        res.status(409).json({ erro: 'O uso atual não cabe nos limites do plano de destino.', limites: resultado.limitesIncompativeis })
        return
      }
      if (resultado.cobrancaAnteriorBloqueio) { res.status(409).json({ erro: resultado.cobrancaAnteriorBloqueio }); return }
      if (resultado.cobrancaProximoCiclo.situacao === 'ambigua') {
        res.status(409).json({ erro: 'Existe mais de uma cobrança candidata ao próximo ciclo da assinatura — solicitação bloqueada por segurança.' })
        return
      }

      // Origem ESTÁVEL — nunca o valor "ao vivo" usado só pra validar acima.
      // tenant.valor_assinatura_atual é a fonte; tenant legado (nunca
      // passou por um upgrade que gravasse este campo) inicializa com o
      // valor real do Asaas (resultado.valorAtualContratado, já lido e
      // validado por validarECalcularPreviewDowngrade) — persiste ANTES de
      // mexer na assinatura, só inicialização do espelho local.
      valorOrigem = tenant.valor_assinatura_atual != null ? Number(tenant.valor_assinatura_atual) : resultado.valorAtualContratado
      if (tenant.valor_assinatura_atual == null) {
        await prisma.tenant.update({ where: { id: tenant.id }, data: { valor_assinatura_atual: valorOrigem } })
      }

      const valorDestinoCalculado = Number(resultado.planoNovo.asaas_subscription_value)
      const efetivarEmCalculado = resultado.efetivarEm
      planoDestino = { id: resultado.planoNovo.id, nome: resultado.planoNovo.nome }

      // Cria o claim SÓ se ainda null — nunca sobrescreve um já existente,
      // nem do mesmo plano (se já existe, outra requisição ganhou a
      // corrida, e são os snapshots DELA que valem).
      const claim = await prisma.tenant.updateMany({
        where: { id: tenant.id, plano_downgrade_id: null },
        data: { plano_downgrade_id: planoId, downgrade_efetivar_em: efetivarEmCalculado, downgrade_valor_destino: valorDestinoCalculado },
      })

      if (claim.count === 1) {
        valorDestino = valorDestinoCalculado
        efetivarEm = efetivarEmCalculado
      } else {
        // Perdeu a corrida — recarrega e reclassifica. Nunca assume "eu
        // calculei X, uso X": o vencedor pode ter congelado outro valor com
        // um catálogo diferente, e é ISSO que precisa ser respeitado.
        const recarregado = await prisma.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          select: { plano_downgrade_id: true, downgrade_efetivar_em: true, downgrade_valor_origem: true, downgrade_valor_destino: true },
        })
        const reclassificado = classificarClaimDowngrade(recarregado, planoId)
        if (reclassificado.estado !== 'recuperavel') {
          res.status(409).json({
            erro: reclassificado.estado === 'bloqueado' ? reclassificado.motivo : 'Não foi possível reivindicar o downgrade agora. Tente novamente em instantes.',
          })
          return
        }
        valorDestino = Number(reclassificado.valorDestino)
        efetivarEm = reclassificado.efetivarEm
        // planoDestino continua o mesmo (mesmo planoId) — nome não muda
        // por causa da corrida, sem precisar de outra consulta.
      }
    }

    // Reconciliação com o Asaas — comum aos dois caminhos acima (recovery
    // direto, recovery via corrida perdida, ou 1ª tentativa recém-criada).
    // Leitura fresca do valor remoto (nunca reaproveita um valor lido
    // antes): a única forma do remoto ter mudado é uma tentativa ANTERIOR
    // deste mesmo tenant — exatamente o que decidirEstadoRemotoDowngrade
    // existe pra reconciliar. "Assinatura não existe" fail-closed aqui
    // cobre também o caminho de recovery (validarECalcularPreviewDowngrade
    // já cobria isso na nova solicitação, mas recovery pula essa função).
    if (!tenant.asaas_subscription_id) {
      res.status(400).json({ erro: 'Tenant ainda não tem uma assinatura ativa. Não é possível concluir o downgrade.' })
      return
    }
    let assinaturaAtual
    try {
      assinaturaAtual = await buscarAssinaturaAsaas(tenant.asaas_subscription_id)
    } catch (err) {
      console.error('Erro ao consultar assinatura no Asaas antes de solicitar downgrade:', err)
      res.status(503).json({ erro: 'Não foi possível confirmar o estado atual da assinatura no Asaas agora. Tente novamente em instantes.' })
      return
    }
    const valorRemoto = Number(assinaturaAtual.value)
    if (!Number.isFinite(valorRemoto)) {
      res.status(503).json({ erro: 'Não foi possível confirmar o estado atual da assinatura no Asaas agora. Tente novamente em instantes.' })
      return
    }

    // remoto === origem: ainda não aplicado (1ª tentativa de verdade, ou
    // recovery ANTES do Asaas ter sido tocado) — sincroniza. remoto ===
    // destino (sempre o SNAPSHOT, nunca recalculado): PUT de uma tentativa
    // anterior já foi aplicado — retry idempotente, só falta persistir.
    // Qualquer outro valor bloqueia fail-closed (nunca sobrescreve o Asaas
    // às cegas).
    const decisaoRemota = decidirEstadoRemotoDowngrade(valorRemoto, valorOrigem, valorDestino)
    if (decisaoRemota === 'divergencia_bloqueia') {
      res.status(409).json({ erro: 'O valor atual da assinatura no Asaas não corresponde ao esperado — solicitação bloqueada por segurança. Tente novamente ou contate o suporte.' })
      return
    }

    // 'primeira_tentativa' OU 'retry_idempotente' chamam o MESMO PUT —
    // repetir com o mesmo valorDestino é seguro/idempotente do lado do
    // Asaas (ver atualizarValorAssinaturaAsaas). Se isto falhar, o claim
    // FICA retido (downgrade_valor_origem ainda null) — não tentamos
    // desfazer: não dá pra saber com certeza se o PUT chegou a aplicar
    // parcialmente no Asaas antes de falhar, então a próxima tentativa
    // (mesmo plano_id) entra direto em RECOVERY e reconcilia de novo,
    // usando os MESMOS snapshots já congelados.
    try {
      await atualizarValorAssinaturaAsaas(tenant.asaas_subscription_id, valorDestino)
    } catch (err) {
      console.error('Erro ao reprecificar a assinatura no Asaas para o downgrade solicitado:', err)
      res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao reprecificar a assinatura no Asaas.' })
      return
    }

    // Persistência final, só depois da confirmação do Asaas — plano_id do
    // Tenant NUNCA é tocado aqui (o downgrade só efetiva de verdade quando
    // o scheduler, de uma próxima etapa, aplicar downgrade_efetivar_em).
    // valor_assinatura_atual continua sendo o valor do plano ATUAL durante
    // todo o agendamento. Só downgrade_valor_origem falta — é o único
    // campo que, ao ser preenchido, completa downgradeAgendamentoCompleto.
    // Condicionada ao MESMO claim (tenant + plano_downgrade_id +
    // downgrade_efetivar_em + downgrade_valor_destino + origem ainda null)
    // — se count=0, outra requisição (reconciliando o MESMO claim, ex.: a
    // vencedora da corrida enquanto esta estava em RECOVERY) pode já ter
    // persistido antes: recarrega e reconhece sucesso idempotente em vez de
    // reportar erro pra um downgrade que já foi agendado com sucesso.
    const persistencia = await prisma.tenant.updateMany({
      where: {
        id: tenant.id, plano_downgrade_id: planoId,
        downgrade_efetivar_em: efetivarEm, downgrade_valor_destino: valorDestino,
        downgrade_valor_origem: null,
      },
      data: { downgrade_valor_origem: valorOrigem },
    })
    if (persistencia.count !== 1) {
      const verificacao = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
        select: { plano_downgrade_id: true, downgrade_efetivar_em: true, downgrade_valor_origem: true, downgrade_valor_destino: true },
      })
      const jaCompleto = verificacao.plano_downgrade_id === planoId && downgradeAgendamentoCompleto(verificacao)
      if (!jaCompleto) {
        res.status(409).json({ erro: 'Não foi possível confirmar o agendamento do downgrade — tente novamente.' })
        return
      }
    }

    res.status(201).json({
      planoAtual: tenant.plano ? { id: tenant.plano.id, nome: tenant.plano.nome } : null,
      planoDestino,
      valorAtualContratado: valorOrigem,
      valorDestino,
      efetivarEm: efetivarEm.toISOString(),
      downgradeAgendado: true,
    })
  } catch (err) {
    console.error('Erro ao solicitar downgrade de plano self-service:', err)
    res.status(500).json({ erro: 'Erro ao solicitar downgrade de plano.' })
  }
}

// DELETE /billing/downgrade — cancela um downgrade agendado, seja ele um
// claim INCOMPLETO (POST chegou a reprecificar no Asaas, mas nunca terminou
// de persistir localmente) ou um agendamento COMPLETO (persistido com
// sucesso, ainda dentro do ciclo). Reaproveita as MESMAS funções puras de
// estado já usadas por preview/POST (classificarClaimDowngrade,
// downgradeAgendamentoCompleto, decidirEstadoRemotoDowngrade,
// motivoRestauracaoDowngradeBloqueada, identificarCobrancaProximoCiclo,
// downgradeDeveEfetivar) — nenhuma máquina de estado paralela criada aqui.
// valor_assinatura_atual NUNCA é tocado por este handler: o plano vigente
// nunca deixou de ser o atual (Tenant.plano_id nunca muda por causa de um
// downgrade agendado, só o scheduler — ver services/downgradeScheduler.ts —
// mexe nisso, e só na data de efetivação).
export async function cancelarDowngrade(req: Request, res: Response) {
  try {
    const tenant = req.adminUser!.tenant

    if (!tenant.plano_downgrade_id) {
      res.status(409).json({ erro: 'Não existe downgrade agendado para cancelar.' })
      return
    }
    if (!tenant.asaas_subscription_id) {
      res.status(400).json({ erro: 'Tenant sem assinatura Asaas vinculada.' })
      return
    }

    if (!downgradeAgendamentoCompleto(tenant)) {
      // ─── Claim INCOMPLETO ────────────────────────────────────────────
      // classificarClaimDowngrade (mesmo planoId do próprio Tenant, já que
      // aqui não existe um "solicitado" diferente do que já está gravado)
      // reaproveita a MESMA checagem de consistência do POST: só devolve
      // 'recuperavel' quando downgrade_efetivar_em/downgrade_valor_destino
      // também estão presentes; qualquer outra coisa é 'bloqueado' com o
      // motivo apropriado — nunca uma segunda definição de "o que é um
      // claim incompleto válido".
      const classificacao = classificarClaimDowngrade(tenant, tenant.plano_downgrade_id)
      if (classificacao.estado !== 'recuperavel') {
        res.status(409).json({
          erro: classificacao.estado === 'bloqueado' ? classificacao.motivo : 'Não existe downgrade agendado para cancelar.',
        })
        return
      }
      if (tenant.valor_assinatura_atual == null) {
        res.status(409).json({ erro: 'O agendamento de downgrade deste tenant está em um estado inconsistente — contate o suporte antes de tentar novamente.' })
        return
      }
      const valorOrigem = Number(tenant.valor_assinatura_atual)
      const valorDestino = Number(classificacao.valorDestino)

      const entrada = await buscarEntradaSituacaoAsaas(tenant)
      if (entrada.tipo !== 'dados') {
        res.status(503).json({ erro: 'Não foi possível confirmar o estado atual da assinatura no Asaas agora. Tente novamente em instantes.' })
        return
      }
      const valorRemoto = Number(entrada.assinatura.value)
      if (!Number.isFinite(valorRemoto)) {
        res.status(503).json({ erro: 'Não foi possível confirmar o estado atual da assinatura no Asaas agora. Tente novamente em instantes.' })
        return
      }

      // remoto === origem: o Asaas ainda não foi reprecificado (a
      // solicitação nunca chegou a mexer nele) — não faz PUT nenhum.
      // remoto === destino: o Asaas FOI reprecificado (a solicitação
      // chegou a aplicar, só não terminou de persistir localmente) —
      // restaura. Qualquer outro valor bloqueia fail-closed, sem tocar em
      // nada.
      const decisao = decidirEstadoRemotoDowngrade(valorRemoto, valorOrigem, valorDestino)
      if (decisao === 'divergencia_bloqueia') {
        res.status(409).json({ erro: 'O valor atual da assinatura no Asaas não corresponde ao esperado — cancelamento bloqueado por segurança. Tente novamente ou contate o suporte.' })
        return
      }
      if (decisao === 'retry_idempotente') {
        try {
          await atualizarValorAssinaturaAsaas(tenant.asaas_subscription_id, valorOrigem)
        } catch (err) {
          console.error('Erro ao restaurar o valor da assinatura no Asaas ao cancelar downgrade (claim incompleto):', err)
          res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao restaurar a assinatura no Asaas.' })
          return
        }
      }

      // Limpeza atômica, condicionada aos MESMOS snapshots que acabamos de
      // ler (nunca um update cego) — se count=0, outra requisição pode já
      // ter limpado (ou restaurado) este MESMO claim; recarrega e
      // reconhece sucesso idempotente em vez de reportar erro.
      const limpeza = await prisma.tenant.updateMany({
        where: {
          id: tenant.id, plano_downgrade_id: tenant.plano_downgrade_id,
          downgrade_efetivar_em: tenant.downgrade_efetivar_em, downgrade_valor_destino: tenant.downgrade_valor_destino,
          downgrade_valor_origem: null,
        },
        data: { plano_downgrade_id: null, downgrade_efetivar_em: null, downgrade_valor_destino: null, downgrade_valor_origem: null },
      })
      if (limpeza.count !== 1) {
        const recarregado = await prisma.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          select: { plano_downgrade_id: true, downgrade_efetivar_em: true, downgrade_valor_origem: true, downgrade_valor_destino: true },
        })
        const jaLimpo = recarregado.plano_downgrade_id === null && recarregado.downgrade_efetivar_em === null
          && recarregado.downgrade_valor_origem === null && recarregado.downgrade_valor_destino === null
        if (!jaLimpo) { res.status(409).json({ erro: 'Não foi possível confirmar o cancelamento do downgrade — tente novamente.' }); return }
      }

      res.status(200).json({ cancelado: true })
      return
    }

    // ─── Downgrade COMPLETO ──────────────────────────────────────────────
    // Cutoff por data ANTES de qualquer outra coisa — nunca cancela algo
    // que já devia ter efetivado, mesmo que o scheduler (ver
    // services/downgradeScheduler.ts) ainda não tenha rodado essa rodada.
    if (downgradeDeveEfetivar(tenant.downgrade_efetivar_em!)) {
      res.status(409).json({ erro: 'Este downgrade já chegou à data de efetivação e não pode mais ser cancelado.' })
      return
    }

    const entrada = await buscarEntradaSituacaoAsaas(tenant)
    // motivoRestauracaoDowngradeBloqueada espera a RESOLUÇÃO completa da
    // consulta — 'falha_consulta' bate direto com a tag de erro de
    // buscarEntradaSituacaoAsaas ('sem_vinculo' cai no mesmo ramo, mas é
    // impossível chegar aqui sem asaas_subscription_id, já checado acima).
    // Quando há dados, reaproveita identificarCobrancaProximoCiclo — MESMA
    // função usada pelo preview/POST, nunca duplicada.
    const resolucaoCobranca: ResolucaoCobrancaProximoCiclo =
      entrada.tipo === 'dados'
        ? { tipo: 'consultada', ...identificarCobrancaProximoCiclo(entrada.cobrancas, tenant.asaas_subscription_id, tenant.downgrade_efetivar_em!) }
        : { tipo: 'falha_consulta' }

    const motivoBloqueio = motivoRestauracaoDowngradeBloqueada(resolucaoCobranca)
    if (motivoBloqueio) { res.status(409).json({ erro: motivoBloqueio }); return }

    if (entrada.tipo !== 'dados') {
      // Nunca alcançado em runtime (falha_consulta já bloqueou acima via
      // motivoRestauracaoDowngradeBloqueada) — só pro TypeScript conseguir
      // estreitar `entrada` pra 'dados' dali em diante.
      res.status(503).json({ erro: 'Não foi possível confirmar o estado atual da assinatura no Asaas agora. Tente novamente em instantes.' })
      return
    }

    // Restaura SEMPRE com o snapshot downgrade_valor_origem — nunca preço
    // atual do Plano, nunca subscription.value como origem, nunca valor
    // vindo do frontend (esta rota não recebe body nenhum).
    const valorOrigem = Number(tenant.downgrade_valor_origem)
    const valorDestino = Number(tenant.downgrade_valor_destino)
    if (!Number.isFinite(valorOrigem) || !Number.isFinite(valorDestino)) {
      res.status(409).json({ erro: 'O agendamento de downgrade deste tenant está em um estado inconsistente — contate o suporte antes de tentar novamente.' })
      return
    }
    const valorRemoto = Number(entrada.assinatura.value)
    if (!Number.isFinite(valorRemoto)) {
      res.status(503).json({ erro: 'Não foi possível confirmar o estado atual da assinatura no Asaas agora. Tente novamente em instantes.' })
      return
    }

    // Mesma decisão pura reaproveitada (decidirEstadoRemotoDowngrade), com
    // origem/destino DELIBERADAMENTE invertidos: no sentido do
    // cancelamento, o valor "esperado ANTES de mexer" é o DESTINO (é o que
    // a assinatura já reflete desde que este downgrade completou) e o
    // valor "esperado DEPOIS" é a ORIGEM (pra onde estamos restaurando).
    // remoto === destino (1º parâmetro passado como "origem" da função) =>
    // 'primeira_tentativa' => ainda não restaurado, chama o PUT. remoto ===
    // origem (2º parâmetro passado como "destino") => 'retry_idempotente'
    // => já restaurado por uma tentativa anterior (Asaas ok, só a limpeza
    // local falhou) — reconhece e NÃO chama o PUT de novo, só limpa.
    // Qualquer outro valor bloqueia fail-closed.
    const decisao = decidirEstadoRemotoDowngrade(valorRemoto, valorDestino, valorOrigem)
    if (decisao === 'divergencia_bloqueia') {
      res.status(409).json({ erro: 'O valor atual da assinatura no Asaas não corresponde ao esperado — cancelamento bloqueado por segurança. Tente novamente ou contate o suporte.' })
      return
    }
    if (decisao === 'primeira_tentativa') {
      try {
        await atualizarValorAssinaturaAsaas(tenant.asaas_subscription_id, valorOrigem)
      } catch (err) {
        console.error('Erro ao restaurar o valor da assinatura no Asaas ao cancelar downgrade:', err)
        res.status(502).json({ erro: err instanceof Error ? err.message : 'Erro ao restaurar a assinatura no Asaas.' })
        return
      }
    }

    // Limpeza local, condicionada aos MESMOS snapshots — se count=0, outra
    // requisição já deve ter concluído este MESMO cancelamento; recarrega
    // e reconhece sucesso idempotente antes de reportar erro.
    const limpeza = await prisma.tenant.updateMany({
      where: {
        id: tenant.id, plano_downgrade_id: tenant.plano_downgrade_id,
        downgrade_efetivar_em: tenant.downgrade_efetivar_em, downgrade_valor_origem: tenant.downgrade_valor_origem,
        downgrade_valor_destino: tenant.downgrade_valor_destino,
      },
      data: { plano_downgrade_id: null, downgrade_efetivar_em: null, downgrade_valor_origem: null, downgrade_valor_destino: null },
    })
    if (limpeza.count !== 1) {
      const recarregado = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
        select: { plano_downgrade_id: true, downgrade_efetivar_em: true, downgrade_valor_origem: true, downgrade_valor_destino: true },
      })
      const jaLimpo = recarregado.plano_downgrade_id === null && recarregado.downgrade_efetivar_em === null
        && recarregado.downgrade_valor_origem === null && recarregado.downgrade_valor_destino === null
      if (!jaLimpo) { res.status(409).json({ erro: 'Não foi possível confirmar o cancelamento do downgrade — tente novamente.' }); return }
    }

    res.status(200).json({ cancelado: true })
  } catch (err) {
    console.error('Erro ao cancelar downgrade de plano agendado:', err)
    res.status(500).json({ erro: 'Erro ao cancelar downgrade agendado.' })
  }
}
