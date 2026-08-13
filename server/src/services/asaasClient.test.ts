import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapearEventoAsaas, calcularProximoVencimento, calcularAtualizacaoTenant, calcularSituacaoAsaas,
  validarPlanoParaAssinaturaSelfService, validarFormaPagamentoSelfService, validarCobrancaParaRegularizacao,
  montarCobrancasEmAberto, bloqueioOperacaoFinanceiraSelfService,
  criarClienteAsaas, atualizarClienteAsaas, buscarAssinaturaAsaas, listarCobrancasAsaas,
  atualizarBillingTypeCobrancaAsaas,
  validarUpgradePlano, motivoUpgradePendenteBloqueiaNovaTroca, motivoDowngradeEmAndamentoBloqueiaUpgrade,
  calcularVencimentoAnterior, duracaoCicloDiasReal,
  diasRestantesCicloAtual, calcularValorProporcionalUpgrade, deveSincronizarAssinaturaAntesDeAplicar,
  pagamentoConfirmaPendencia, criarCobrancaAvulsaAsaas, atualizarValorAssinaturaAsaas,
  resolverVencimentoCicloAtual, motivoCancelamentoUpgradeBloqueado, cancelarCobrancaAsaas, erroAsaasStatus,
  dataCivilBRT, resolverValorAssinaturaExibido, downgradeDeveEfetivar, motivoRestauracaoDowngradeBloqueada,
  motivoDowngradePlano, classificarClaimDowngrade, motivoCobrancaAnteriorBloqueiaDowngrade,
  identificarCobrancaProximoCiclo, compararNivelPlanos, decidirEstadoRemotoDowngrade,
  downgradeAgendamentoCompleto,
} from './asaasClient'
import type { AssinaturaAsaas, CobrancaAsaas } from './asaasClient'

// Cobertura da Fase 1 da integração Asaas (fundação/sandbox) — só funções
// puras (mapearEventoAsaas, calcularProximoVencimento) e um teste de
// não-vazamento de segredo via mock de fetch, mesmo padrão de
// tenantGuards.test.ts: nada de banco/HTTP de verdade.

describe('mapearEventoAsaas — pagamento confirmado', () => {
  test('PAYMENT_CONFIRMED mapeia pra pagamento_confirmado', () => {
    const acao = mapearEventoAsaas({
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_1', customer: 'cus_1', subscription: 'sub_1', status: 'CONFIRMED', paymentDate: '2026-08-08', dueDate: '2026-09-08' },
    })
    assert.equal(acao.tipo, 'pagamento_confirmado')
    if (acao.tipo === 'pagamento_confirmado') {
      assert.equal(acao.paymentId, 'pay_1')
      assert.equal(acao.customerId, 'cus_1')
      assert.equal(acao.subscriptionId, 'sub_1')
      assert.equal(acao.asaasStatus, 'CONFIRMED')
      assert.equal(acao.dataPagamento.toISOString().slice(0, 10), '2026-08-08')
      assert.equal(acao.dataVencimento?.toISOString().slice(0, 10), '2026-09-08')
    }
  })

  test('PAYMENT_RECEIVED também mapeia pra pagamento_confirmado', () => {
    const acao = mapearEventoAsaas({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_2', customer: 'cus_2', status: 'RECEIVED', clientPaymentDate: '2026-08-08' },
    })
    assert.equal(acao.tipo, 'pagamento_confirmado')
  })

  test('sem payment.paymentDate/clientPaymentDate usa a data atual', () => {
    const antes = Date.now()
    const acao = mapearEventoAsaas({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_3', customer: 'cus_3', status: 'RECEIVED' } })
    assert.equal(acao.tipo, 'pagamento_confirmado')
    if (acao.tipo === 'pagamento_confirmado') {
      assert.ok(acao.dataPagamento.getTime() >= antes)
    }
  })

  test('sem payment.dueDate, dataVencimento fica null', () => {
    const acao = mapearEventoAsaas({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_4', customer: 'cus_4' } })
    assert.equal(acao.tipo, 'pagamento_confirmado')
    if (acao.tipo === 'pagamento_confirmado') assert.equal(acao.dataVencimento, null)
  })
})

describe('mapearEventoAsaas — pagamento vencido', () => {
  test('PAYMENT_OVERDUE mapeia pra pagamento_vencido, sem tocar em datas', () => {
    const acao = mapearEventoAsaas({
      event: 'PAYMENT_OVERDUE',
      payment: { id: 'pay_5', customer: 'cus_5', subscription: 'sub_5', status: 'OVERDUE' },
    })
    assert.equal(acao.tipo, 'pagamento_vencido')
    if (acao.tipo === 'pagamento_vencido') {
      assert.equal(acao.paymentId, 'pay_5')
      assert.equal(acao.customerId, 'cus_5')
      assert.equal(acao.subscriptionId, 'sub_5')
      assert.equal(acao.asaasStatus, 'OVERDUE')
    }
  })
})

describe('mapearEventoAsaas — assinatura cancelada', () => {
  test('SUBSCRIPTION_DELETED mapeia pra assinatura_cancelada', () => {
    const acao = mapearEventoAsaas({ event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_9', customer: 'cus_9' } })
    assert.equal(acao.tipo, 'assinatura_cancelada')
    if (acao.tipo === 'assinatura_cancelada') {
      assert.equal(acao.subscriptionId, 'sub_9')
      assert.equal(acao.customerId, 'cus_9')
      assert.equal(acao.asaasStatus, 'SUBSCRIPTION_DELETED')
    }
  })

  test('SUBSCRIPTION_INACTIVATED também mapeia pra assinatura_cancelada', () => {
    const acao = mapearEventoAsaas({ event: 'SUBSCRIPTION_INACTIVATED', subscription: { id: 'sub_10' } })
    assert.equal(acao.tipo, 'assinatura_cancelada')
    if (acao.tipo === 'assinatura_cancelada') assert.equal(acao.customerId, null)
  })
})

describe('mapearEventoAsaas — ignorado', () => {
  test('payload não-objeto', () => {
    assert.equal(mapearEventoAsaas(null).tipo, 'ignorado')
    assert.equal(mapearEventoAsaas('string').tipo, 'ignorado')
  })

  test('sem campo event', () => {
    assert.equal(mapearEventoAsaas({}).tipo, 'ignorado')
  })

  test('evento não mapeado nesta fase (ex.: PAYMENT_CREATED, SUBSCRIPTION_UPDATED)', () => {
    assert.equal(mapearEventoAsaas({ event: 'PAYMENT_CREATED' }).tipo, 'ignorado')
    assert.equal(mapearEventoAsaas({ event: 'SUBSCRIPTION_UPDATED' }).tipo, 'ignorado')
  })

  test('PAYMENT_CONFIRMED sem objeto payment', () => {
    assert.equal(mapearEventoAsaas({ event: 'PAYMENT_CONFIRMED' }).tipo, 'ignorado')
  })

  test('PAYMENT_CONFIRMED com payment sem id/customer', () => {
    assert.equal(mapearEventoAsaas({ event: 'PAYMENT_CONFIRMED', payment: { status: 'CONFIRMED' } }).tipo, 'ignorado')
  })

  test('SUBSCRIPTION_DELETED sem objeto subscription', () => {
    assert.equal(mapearEventoAsaas({ event: 'SUBSCRIPTION_DELETED' }).tipo, 'ignorado')
  })

  test('SUBSCRIPTION_DELETED com subscription sem id', () => {
    assert.equal(mapearEventoAsaas({ event: 'SUBSCRIPTION_DELETED', subscription: { customer: 'cus_1' } }).tipo, 'ignorado')
  })
})

describe('calcularProximoVencimento', () => {
  const base = new Date('2026-08-08T00:00:00Z')

  test('sem ciclo definido, usa MONTHLY como padrão', () => {
    const resultado = calcularProximoVencimento(base, null)
    assert.equal(resultado.toISOString().slice(0, 10), '2026-09-08')
  })

  test('MONTHLY', () => {
    assert.equal(calcularProximoVencimento(base, 'MONTHLY').toISOString().slice(0, 10), '2026-09-08')
  })

  test('WEEKLY soma 7 dias', () => {
    assert.equal(calcularProximoVencimento(base, 'WEEKLY').toISOString().slice(0, 10), '2026-08-15')
  })

  test('BIWEEKLY soma 14 dias', () => {
    assert.equal(calcularProximoVencimento(base, 'BIWEEKLY').toISOString().slice(0, 10), '2026-08-22')
  })

  test('YEARLY soma 12 meses', () => {
    assert.equal(calcularProximoVencimento(base, 'YEARLY').toISOString().slice(0, 10), '2027-08-08')
  })

  test('ciclo em minúsculo é normalizado', () => {
    assert.equal(calcularProximoVencimento(base, 'quarterly').toISOString().slice(0, 10), '2026-11-08')
  })
})

describe('calcularAtualizacaoTenant', () => {
  const agora = new Date('2026-08-08T12:00:00Z')

  test('PAYMENT_CONFIRMED/RECEIVED não escreve mais asaas_status (só campos de licença)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1',
      asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && 'asaas_status' in resultado.dados, false)
  })

  test('PAYMENT_OVERDUE não escreve mais asaas_status nem mexe em status/licença', () => {
    const acao = {
      tipo: 'pagamento_vencido' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'OVERDUE',
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, { asaas_ultima_sincronizacao: agora })
  })

  test('SUBSCRIPTION_DELETED/INACTIVATED grava asaas_status="INACTIVE" (nunca o nome bruto do evento)', () => {
    const acao = { tipo: 'assinatura_cancelada' as const, subscriptionId: 'sub_1', customerId: 'cus_1', asaasStatus: 'SUBSCRIPTION_DELETED' }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, { asaas_status: 'INACTIVE', asaas_ultima_sincronizacao: agora, status: 'SUSPENDED' })
  })

  // ─── Correção de segurança pós-revisão: CANCELED nunca é rebaixado por
  // automação Asaas (SUBSCRIPTION_DELETED/INACTIVATED atrasado/reentregue) ─

  test('CANCELED + SUBSCRIPTION_DELETED -> permanece sem alteração (nunca vira SUSPENDED)', () => {
    const acao = { tipo: 'assinatura_cancelada' as const, subscriptionId: 'sub_1', customerId: 'cus_1', asaasStatus: 'SUBSCRIPTION_DELETED' }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'CANCELED' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /já está CANCELED/)
  })

  test('CANCELED + SUBSCRIPTION_INACTIVATED -> permanece sem alteração (nunca vira SUSPENDED)', () => {
    const acao = { tipo: 'assinatura_cancelada' as const, subscriptionId: 'sub_1', customerId: 'cus_1', asaasStatus: 'SUBSCRIPTION_INACTIVATED' }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'CANCELED' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /já está CANCELED/)
  })

  test('ACTIVE + SUBSCRIPTION_INACTIVATED -> continua virando SUSPENDED (comportamento preservado pra quem não é CANCELED)', () => {
    const acao = { tipo: 'assinatura_cancelada' as const, subscriptionId: 'sub_1', customerId: 'cus_1', asaasStatus: 'SUBSCRIPTION_INACTIVATED' }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, { asaas_status: 'INACTIVE', asaas_ultima_sincronizacao: agora, status: 'SUSPENDED' })
  })

  test('pagamento confirmado NÃO reativa tenant cuja assinatura já é INACTIVE (webhook fora de ordem)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'INACTIVE', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /assinatura já registrada como inativa/)
  })

  test('pagamento confirmado NÃO reativa tenant cuja assinatura já é EXPIRED', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'EXPIRED', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
  })

  test('fluxo normal: pagamento confirmado com assinatura ativa continua ativando/estendendo a licença', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, {
      asaas_ultima_sincronizacao: agora,
      status: 'ACTIVE',
      ultimo_pagamento_em: acao.dataPagamento,
      licenca_inicio: acao.dataPagamento,
      licenca_fim: new Date('2026-09-08T00:00:00Z'),
      proxima_cobranca: new Date('2026-09-08T00:00:00Z'),
    })
  })

  // ─── Fase 6B — conversão trial->pago / troca de plano via plano_pendente_id ─

  test('pagamento confirmado com plano_pendente_id aplica o plano pendente e limpa o campo', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(
      acao,
      { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'TRIAL', plano_pendente_id: 'plano-growth-id' },
      'MONTHLY',
      agora
    )
    assert.deepEqual(resultado.dados, {
      asaas_ultima_sincronizacao: agora,
      status: 'ACTIVE',
      ultimo_pagamento_em: acao.dataPagamento,
      licenca_inicio: acao.dataPagamento,
      licenca_fim: new Date('2026-09-08T00:00:00Z'),
      proxima_cobranca: new Date('2026-09-08T00:00:00Z'),
      plano: { connect: { id: 'plano-growth-id' } },
      plano_pendente: { disconnect: true },
      plano_pendente_payment_id: null,
      valor_assinatura_atual: null,
    })
  })

  // Fase 8B (fundação) — mesmo branch acima, agora com
  // plano_pendente.asaas_subscription_value presente (caso real: tenant
  // buscado com include: { plano_pendente: true }) — confirma que o valor
  // é propagado pra valor_assinatura_atual, não só o fallback null do
  // teste anterior (tenant sem plano_pendente carregado).
  test('pagamento confirmado com plano_pendente carregado grava valor_assinatura_atual com o valor do plano aplicado', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(
      acao,
      {
        asaas_status: 'ACTIVE', licenca_inicio: null, status: 'TRIAL', plano_pendente_id: 'plano-growth-id',
        plano_pendente: { asaas_subscription_value: 349 },
      },
      'MONTHLY',
      agora
    )
    assert.equal((resultado.dados as { valor_assinatura_atual?: unknown } | null)?.valor_assinatura_atual, 349)
  })

  // Renovação normal (fora do branch de plano_pendente) nunca grava
  // valor_assinatura_atual — só a troca de plano de verdade grava.
  test('renovação normal (sem plano_pendente_id) NUNCA grava valor_assinatura_atual', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE', plano_pendente_id: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && 'valor_assinatura_atual' in resultado.dados, false)
  })

  // Fase 8A (correção pós-revisão) — plano_pendente_payment_id presente:
  // só aplica quando o payment.id confirmado é EXATAMENTE o esperado.
  test('pagamento confirmado com plano_pendente_id E plano_pendente_payment_id CORRETO aplica o plano pendente', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_upgrade_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(
      acao,
      { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE', plano_pendente_id: 'plano-growth-id', plano_pendente_payment_id: 'pay_upgrade_1' },
      'MONTHLY',
      agora
    )
    assert.ok(resultado.dados && 'plano' in resultado.dados)
    assert.deepEqual((resultado.dados as { plano?: unknown }).plano, { connect: { id: 'plano-growth-id' } })
  })

  test('pagamento confirmado com plano_pendente_id mas payment.id ERRADO (renovação normal chegando enquanto upgrade pendente) NÃO aplica o plano — só estende a licença', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_renovacao_normal', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(
      acao,
      { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE', plano_pendente_id: 'plano-growth-id', plano_pendente_payment_id: 'pay_upgrade_1' },
      'MONTHLY',
      agora
    )
    // Licença ainda estende normalmente (renovação legítima)...
    assert.equal((resultado.dados as { licenca_fim?: Date } | null)?.licenca_fim?.toISOString(), '2026-09-08T00:00:00.000Z')
    // ...mas o plano pendente NUNCA é aplicado por esse pagamento.
    assert.equal(resultado.dados !== null && 'plano' in resultado.dados, false)
    assert.equal(resultado.dados !== null && 'plano_pendente' in resultado.dados, false)
  })

  test('pagamento confirmado sem plano_pendente_id nunca mexe em plano/plano_pendente (renovação normal, comportamento preservado)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'ACTIVE', plano_pendente_id: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && 'plano' in resultado.dados, false)
    assert.equal(resultado.dados !== null && 'plano_pendente' in resultado.dados, false)
  })

  test('plano_pendente_id é ignorado quando tenant está SUSPENDED (bloqueio já existente roda antes)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(
      acao,
      { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'SUSPENDED', plano_pendente_id: 'plano-growth-id' },
      'MONTHLY',
      agora
    )
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /SUSPENDED/)
  })

  test('plano_pendente_id é ignorado quando tenant está CANCELED (bloqueio já existente roda antes)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(
      acao,
      { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'CANCELED', plano_pendente_id: 'plano-growth-id' },
      'MONTHLY',
      agora
    )
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /CANCELED/)
  })

  test('licenca_inicio já preenchido não é sobrescrito por um novo pagamento confirmado', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const licencaInicioOriginal = new Date('2026-01-01T00:00:00Z')
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: licencaInicioOriginal, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && resultado.dados.licenca_inicio, licencaInicioOriginal)
  })

  test('pagamento confirmado sem NENHUM asaas_status conhecido (null) não ativa por suposição', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: null, licenca_inicio: null, status: 'ACTIVE' }, null, agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /não é um status de assinatura confiável/)
  })

  test('pagamento confirmado NÃO reativa quando asaas_status é legado de evento cru (SUBSCRIPTION_DELETED, versão anterior desta correção)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'SUBSCRIPTION_DELETED', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /assinatura já registrada como inativa/)
  })

  test('pagamento confirmado NÃO reativa quando asaas_status é legado de evento cru (SUBSCRIPTION_INACTIVATED)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'SUBSCRIPTION_INACTIVATED', licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
  })

  for (const statusPagamentoContaminado of ['CONFIRMED', 'RECEIVED', 'OVERDUE', 'PENDING']) {
    test(`pagamento confirmado NÃO reativa quando asaas_status ficou contaminado com status de PAGAMENTO ("${statusPagamentoContaminado}", legado do bug corrigido)`, () => {
      const acao = {
        tipo: 'pagamento_confirmado' as const,
        paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
        dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
      }
      const resultado = calcularAtualizacaoTenant(acao, { asaas_status: statusPagamentoContaminado, licenca_inicio: null, status: 'ACTIVE' }, 'MONTHLY', agora)
      assert.equal(resultado.dados, null)
      assert.match(resultado.ignorado ?? '', /não é um status de assinatura confiável/)
    })
  }

  // ─── Correção de segurança pós-revisão: Tenant.status agora tem prioridade
  // sobre asaas_status pra pagamento_confirmado ────────────────────────────

  test('SUSPENDED + asaas_status ACTIVE + pagamento confirmado -> NÃO ativa (bloqueio incondicional)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'SUSPENDED' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /tenant está SUSPENDED/)
  })

  test('CANCELED + asaas_status ACTIVE + pagamento confirmado -> NÃO ativa (bloqueio incondicional)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'CANCELED' }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /tenant está CANCELED/)
  })

  test('EXPIRED + asaas_status ACTIVE + pagamento confirmado -> continua renovando normalmente', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'EXPIRED' }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && resultado.dados.status, 'ACTIVE')
    assert.equal(resultado.dados !== null && resultado.dados.licenca_fim?.toISOString().slice(0, 10), '2026-09-08')
  })

  test('TRIAL + asaas_status ACTIVE + pagamento confirmado -> continua ativando normalmente', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null, status: 'TRIAL' }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && resultado.dados.status, 'ACTIVE')
  })
})

describe('calcularSituacaoAsaas', () => {
  const assinatura = (status: string): AssinaturaAsaas => ({ id: 'sub_1', status, nextDueDate: '2026-09-08' })
  const cobranca = (status: string, id = 'pay_1'): CobrancaAsaas => ({
    id, status, value: 100, customer: 'cus_1', subscription: 'sub_1', dueDate: '2026-08-01', paymentDate: null,
  })

  test('sem vínculo Asaas -> INDETERMINADO, sem status/cobrança', () => {
    const resultado = calcularSituacaoAsaas({ tipo: 'sem_vinculo' })
    assert.equal(resultado.decisao, 'INDETERMINADO')
    assert.equal(resultado.statusAssinatura, null)
    assert.equal(resultado.quantidadeCobrancasVencidas, 0)
    assert.match(resultado.motivo, /sem assinatura Asaas vinculada/)
  })

  test('falha ao consultar o Asaas -> INDETERMINADO, motivo inclui o erro', () => {
    const resultado = calcularSituacaoAsaas({ tipo: 'falha_consulta', erro: 'Asaas respondeu 503: indisponível' })
    assert.equal(resultado.decisao, 'INDETERMINADO')
    assert.equal(resultado.statusAssinatura, null)
    assert.match(resultado.motivo, /Asaas respondeu 503/)
  })

  test('assinatura ACTIVE sem cobrança vencida, hasMore=false -> OK', () => {
    const resultado = calcularSituacaoAsaas({
      tipo: 'dados', assinatura: assinatura('ACTIVE'), cobrancas: [cobranca('CONFIRMED'), cobranca('RECEIVED', 'pay_2')], hasMore: false,
    })
    assert.equal(resultado.decisao, 'OK')
    assert.equal(resultado.statusAssinatura, 'ACTIVE')
    assert.equal(resultado.quantidadeCobrancasVencidas, 0)
  })

  test('assinatura ACTIVE sem nenhuma cobrança, hasMore=false -> OK', () => {
    const resultado = calcularSituacaoAsaas({ tipo: 'dados', assinatura: assinatura('ACTIVE'), cobrancas: [], hasMore: false })
    assert.equal(resultado.decisao, 'OK')
  })

  test('assinatura ACTIVE sem OVERDUE analisada, hasMore=true -> INDETERMINADO (pode haver vencida fora do lote de 50)', () => {
    const resultado = calcularSituacaoAsaas({
      tipo: 'dados', assinatura: assinatura('ACTIVE'), cobrancas: [cobranca('CONFIRMED')], hasMore: true,
    })
    assert.equal(resultado.decisao, 'INDETERMINADO')
    assert.equal(resultado.statusAssinatura, 'ACTIVE')
    assert.match(resultado.motivo, /Existem cobranças adicionais que não foram analisadas/)
  })

  test('assinatura ACTIVE com cobrança OVERDUE analisada -> INADIMPLENTE', () => {
    const resultado = calcularSituacaoAsaas({
      tipo: 'dados', assinatura: assinatura('ACTIVE'), cobrancas: [cobranca('OVERDUE')], hasMore: false,
    })
    assert.equal(resultado.decisao, 'INADIMPLENTE')
    assert.equal(resultado.statusAssinatura, 'ACTIVE')
    assert.equal(resultado.quantidadeCobrancasVencidas, 1)
  })

  test('assinatura ACTIVE com OVERDUE analisada e hasMore=true -> INADIMPLENTE tem prioridade (não vira INDETERMINADO)', () => {
    const resultado = calcularSituacaoAsaas({
      tipo: 'dados', assinatura: assinatura('ACTIVE'), cobrancas: [cobranca('OVERDUE')], hasMore: true,
    })
    assert.equal(resultado.decisao, 'INADIMPLENTE')
    assert.equal(resultado.quantidadeCobrancasVencidas, 1)
  })

  test('assinatura ACTIVE com múltiplas cobranças, pelo menos uma OVERDUE -> INADIMPLENTE e conta só as vencidas', () => {
    const resultado = calcularSituacaoAsaas({
      tipo: 'dados',
      assinatura: assinatura('ACTIVE'),
      cobrancas: [cobranca('CONFIRMED', 'pay_1'), cobranca('OVERDUE', 'pay_2'), cobranca('OVERDUE', 'pay_3'), cobranca('RECEIVED', 'pay_4')],
      hasMore: false,
    })
    assert.equal(resultado.decisao, 'INADIMPLENTE')
    assert.equal(resultado.quantidadeCobrancasVencidas, 2)
  })

  test('assinatura INACTIVE -> ASSINATURA_INATIVA (independe de cobranças/hasMore)', () => {
    const resultado = calcularSituacaoAsaas({
      tipo: 'dados', assinatura: assinatura('INACTIVE'), cobrancas: [cobranca('CONFIRMED')], hasMore: true,
    })
    assert.equal(resultado.decisao, 'ASSINATURA_INATIVA')
    assert.equal(resultado.statusAssinatura, 'INACTIVE')
  })

  test('assinatura EXPIRED -> ASSINATURA_INATIVA', () => {
    const resultado = calcularSituacaoAsaas({ tipo: 'dados', assinatura: assinatura('EXPIRED'), cobrancas: [], hasMore: false })
    assert.equal(resultado.decisao, 'ASSINATURA_INATIVA')
    assert.equal(resultado.statusAssinatura, 'EXPIRED')
  })

  test('status de assinatura desconhecido (fora de ACTIVE/EXPIRED/INACTIVE) -> INDETERMINADO, nunca presume OK', () => {
    const resultado = calcularSituacaoAsaas({ tipo: 'dados', assinatura: assinatura('PENDING'), cobrancas: [], hasMore: false })
    assert.equal(resultado.decisao, 'INDETERMINADO')
    assert.equal(resultado.statusAssinatura, 'PENDING')
  })
})

describe('validarPlanoParaAssinaturaSelfService (Fase 5, plano escolhido pelo cliente desde a Fase 6B)', () => {
  test('plano nulo (id inválido/inexistente) é bloqueado', () => {
    assert.match(validarPlanoParaAssinaturaSelfService(null) ?? '', /plano não encontrado/i)
  })

  test('plano interno é bloqueado, mesmo com valor Asaas configurado', () => {
    const motivo = validarPlanoParaAssinaturaSelfService({ interno: true, eh_plano_trial: false, asaas_subscription_value: 99.9 })
    assert.match(motivo ?? '', /não está disponível para contratação self-service/)
  })

  // Fase 6B — o motivo original do bug: teste-gratis não tem
  // asaas_subscription_value (nunca deveria ter), então antes desta
  // checagem específica o cliente via "Plano sem valor de assinatura
  // configurado" ao tentar assinar o próprio trial. Agora bloqueia com uma
  // mensagem que faz sentido, mesmo que alguém envie o id do plano de
  // trial direto (o plano nem aparece em GET /billing/planos-disponiveis,
  // mas esta é a defesa de verdade).
  test('plano de trial não pode ser contratado como plano pago', () => {
    const motivo = validarPlanoParaAssinaturaSelfService({ interno: false, eh_plano_trial: true, asaas_subscription_value: null })
    assert.match(motivo ?? '', /teste grátis não pode ser contratado/)
  })

  test('plano de trial é bloqueado mesmo que tenha valor Asaas configurado por engano', () => {
    const motivo = validarPlanoParaAssinaturaSelfService({ interno: false, eh_plano_trial: true, asaas_subscription_value: 0 })
    assert.match(motivo ?? '', /teste grátis não pode ser contratado/)
  })

  test('plano sem asaas_subscription_value configurado é bloqueado', () => {
    const motivo = validarPlanoParaAssinaturaSelfService({ interno: false, eh_plano_trial: false, asaas_subscription_value: null })
    assert.match(motivo ?? '', /sem valor de assinatura configurado/)
  })

  test('plano comercial com valor configurado é permitido', () => {
    assert.equal(validarPlanoParaAssinaturaSelfService({ interno: false, eh_plano_trial: false, asaas_subscription_value: 149.9 }), null)
  })
})

// Correção de produto — a PRIMEIRA assinatura self-service parou de mandar
// billingType:'UNDEFINED' fixo (que deixava o Asaas decidir o que mostrar
// na página hospedada, indesejado): agora o cliente escolhe explicitamente
// Cartão, Pix ou Boleto no UserPulse, e só esse enum validado aqui chega
// até criarAssinaturaAsaas (POST /billing/assinatura em
// controllers/billing.ts nunca repassa o valor cru do body). UNDEFINED
// continua rejeitado aqui — só a Gestão SaaS ainda usa (ver
// resolverBillingTypeGestaoSaas em adminTenantsAsaas.ts — fluxo diferente,
// não tocado aqui).
describe('validarFormaPagamentoSelfService — CREDIT_CARD, PIX ou BOLETO na primeira assinatura self-service', () => {
  test('CREDIT_CARD é aceito', () => {
    assert.equal(validarFormaPagamentoSelfService('CREDIT_CARD'), 'CREDIT_CARD')
  })

  test('PIX é aceito', () => {
    assert.equal(validarFormaPagamentoSelfService('PIX'), 'PIX')
  })

  test('BOLETO é aceito', () => {
    assert.equal(validarFormaPagamentoSelfService('BOLETO'), 'BOLETO')
  })

  test('UNDEFINED é rejeitado (nunca deixa a forma de pagamento implícita nesta tela)', () => {
    assert.equal(validarFormaPagamentoSelfService('UNDEFINED'), null)
  })

  test('ausente é rejeitado', () => {
    assert.equal(validarFormaPagamentoSelfService(undefined), null)
  })

  test('valor arbitrário é rejeitado (nunca confia no frontend além do enum)', () => {
    assert.equal(validarFormaPagamentoSelfService(''), null)
    assert.equal(validarFormaPagamentoSelfService('credit_card'), null)
    assert.equal(validarFormaPagamentoSelfService(123), null)
    assert.equal(validarFormaPagamentoSelfService('PIX_AUTOMATICO'), null)
  })
})

// Pontos 7 e 8 pedidos na revisão — confirmados por leitura de código,
// sem teste de controller novo (convenção do projeto: criarAssinatura toca
// Prisma/Asaas de verdade, controllers com I/O não são testados aqui, ver
// CLAUDE.md "Tests"):
// 7. controller encaminha os 3 billingTypes corretamente — em billing.ts,
//    `const billingType = validarFormaPagamentoSelfService(forma_pagamento)`
//    é passado direto pra `criarAssinaturaAsaas(..., { billingType, ... })`,
//    sem transformação nenhuma no meio — os 3 testes de aceitação acima
//    (identidade: entrada === saída) já garantem isso.
// 8. preço/plano/ciclo continuam só do backend — inalterado por esta
//    correção: `planoEscolhido` é sempre recarregado via
//    `prisma.plano.findUnique({ where: { id: plano_id.trim() } })`; nada no
//    corpo da requisição além de `plano_id`/`forma_pagamento` é lido.

describe('validarCobrancaParaRegularizacao (Fase 5 — ação "Pagar")', () => {
  const cobranca = (status: string, subscription: string | null) => ({ status, subscription })

  test('cobrança de outra assinatura (outro tenant) é bloqueada', () => {
    const motivo = validarCobrancaParaRegularizacao(cobranca('OVERDUE', 'sub_outro_tenant'), 'sub_deste_tenant')
    assert.match(motivo ?? '', /não pertence à assinatura deste tenant/)
  })

  test('cobrança já paga (RECEIVED/CONFIRMED) não pode ser preparada novamente', () => {
    assert.match(validarCobrancaParaRegularizacao(cobranca('RECEIVED', 'sub_1'), 'sub_1') ?? '', /não está pendente ou vencida/)
    assert.match(validarCobrancaParaRegularizacao(cobranca('CONFIRMED', 'sub_1'), 'sub_1') ?? '', /não está pendente ou vencida/)
  })

  test('somente PENDING/OVERDUE são aceitas', () => {
    assert.equal(validarCobrancaParaRegularizacao(cobranca('PENDING', 'sub_1'), 'sub_1'), null)
    assert.equal(validarCobrancaParaRegularizacao(cobranca('OVERDUE', 'sub_1'), 'sub_1'), null)
  })
})

// Correção de produto — cliente pode trocar a forma de pagamento de uma
// cobrança ANTES do vencimento (PENDING), não só depois de vencer
// (OVERDUE). GET /billing/situacao expõe cobrancasEmAberto a partir desta
// função pura (nunca chama o Asaas — `cobrancas` já vem de
// listarCobrancasAsaas, buscado uma vez só em buscarEntradaSituacaoAsaas).
describe('resolverValorAssinaturaExibido — GET /billing/situacao (Fase 8B, fundação)', () => {
  test('valor_assinatura_atual presente => sempre vence, ignora ao vivo/catálogo', () => {
    assert.equal(resolverValorAssinaturaExibido(149, 349, 179), 149)
  })
  test('sem valor_assinatura_atual, com valor ao vivo do Asaas => usa o ao vivo, ignora catálogo', () => {
    assert.equal(resolverValorAssinaturaExibido(null, 349, 179), 349)
  })
  test('sem valor_assinatura_atual e sem ao vivo (sem_vinculo/falha_consulta) => cai no catálogo', () => {
    assert.equal(resolverValorAssinaturaExibido(null, null, 179), 179)
  })
  test('undefined tratado igual a null em todos os 3 níveis', () => {
    assert.equal(resolverValorAssinaturaExibido(undefined, undefined, 179), 179)
  })
  test('nenhum dos 3 disponível => null (nunca inventa um valor)', () => {
    assert.equal(resolverValorAssinaturaExibido(null, null, null), null)
  })
})

describe('montarCobrancasEmAberto — GET /billing/situacao (correção de produto)', () => {
  const cobranca = (over: Partial<CobrancaAsaas> = {}): CobrancaAsaas => ({
    id: 'pay_x', status: 'PENDING', value: 149.9, customer: 'cus_1', subscription: 'sub_1',
    dueDate: '2026-09-08', paymentDate: null, billingType: 'CREDIT_CARD',
    ...over,
  })

  test('PENDING antes do vencimento entra na lista', () => {
    const resultado = montarCobrancasEmAberto([cobranca({ id: 'pay_1', status: 'PENDING' })], 'sub_1')
    assert.equal(resultado.length, 1)
    assert.equal(resultado[0].status, 'PENDING')
  })

  test('OVERDUE continua entrando na lista', () => {
    const resultado = montarCobrancasEmAberto([cobranca({ id: 'pay_1', status: 'OVERDUE' })], 'sub_1')
    assert.equal(resultado.length, 1)
    assert.equal(resultado[0].status, 'OVERDUE')
  })

  test('CONFIRMED/RECEIVED (já paga) nunca entra na lista — nada a alterar', () => {
    const resultado = montarCobrancasEmAberto([
      cobranca({ id: 'pay_1', status: 'CONFIRMED' }),
      cobranca({ id: 'pay_2', status: 'RECEIVED' }),
    ], 'sub_1')
    assert.equal(resultado.length, 0)
  })

  test('cobrança de outra assinatura (ou avulsa, subscription diferente) nunca entra — defesa em profundidade', () => {
    const resultado = montarCobrancasEmAberto([
      cobranca({ id: 'pay_outro_tenant', subscription: 'sub_outro_tenant' }),
      cobranca({ id: 'pay_avulsa', subscription: null }),
    ], 'sub_1')
    assert.equal(resultado.length, 0)
  })

  test('ordena por vencimento, mais próxima primeiro — nunca presume qual é "a cobrança do mês atual"', () => {
    const resultado = montarCobrancasEmAberto([
      cobranca({ id: 'pay_setembro', dueDate: '2026-09-08' }),
      cobranca({ id: 'pay_agosto', dueDate: '2026-08-08', status: 'OVERDUE' }),
      cobranca({ id: 'pay_outubro', dueDate: '2026-10-08' }),
    ], 'sub_1')
    assert.deepEqual(resultado.map(c => c.id), ['pay_agosto', 'pay_setembro', 'pay_outubro'])
  })

  test('formato do item: id, value, dueDate, status, billingType, invoiceUrl (fallback pra bankSlipUrl)', () => {
    const resultado = montarCobrancasEmAberto([
      cobranca({ invoiceUrl: null, bankSlipUrl: 'https://sandbox.asaas.com/b/xyz' }),
    ], 'sub_1')
    assert.deepEqual(resultado[0], {
      id: 'pay_x', value: 149.9, dueDate: '2026-09-08', status: 'PENDING',
      billingType: 'CREDIT_CARD', invoiceUrl: 'https://sandbox.asaas.com/b/xyz',
    })
  })
})

describe('bloqueioOperacaoFinanceiraSelfService (correção de segurança pós-revisão)', () => {
  test('SUSPENDED bloqueia', () => {
    assert.match(bloqueioOperacaoFinanceiraSelfService('SUSPENDED') ?? '', /suspensa ou cancelada/)
  })

  test('CANCELED bloqueia', () => {
    assert.match(bloqueioOperacaoFinanceiraSelfService('CANCELED') ?? '', /suspensa ou cancelada/)
  })

  test('EXPIRED NÃO bloqueia — regularização de licença vencida é o caso legítimo do self-service', () => {
    assert.equal(bloqueioOperacaoFinanceiraSelfService('EXPIRED'), null)
  })

  test('ACTIVE não bloqueia', () => {
    assert.equal(bloqueioOperacaoFinanceiraSelfService('ACTIVE'), null)
  })

  test('TRIAL não bloqueia', () => {
    assert.equal(bloqueioOperacaoFinanceiraSelfService('TRIAL'), null)
  })
})

// ─── Fase 8A — upgrade de plano self-service ────────────────────────────────
// nivel segue o mesmo backfill oficial (starter=1, growth=2) — não é
// coincidência, é o mesmo dado que a migration 20260813140000_add_plano_nivel
// grava pros 5 planos oficiais.
const PLANO_STARTER = { id: 'plano-starter', ativo: true, interno: false, eh_plano_trial: false, asaas_subscription_value: 100, nivel: 1 }
const PLANO_GROWTH = { id: 'plano-growth', ativo: true, interno: false, eh_plano_trial: false, asaas_subscription_value: 200, nivel: 2 }

describe('validarUpgradePlano', () => {
  test('plano novo não encontrado é bloqueado (reaproveita validarPlanoParaAssinaturaSelfService)', () => {
    assert.match(validarUpgradePlano(PLANO_STARTER, null) ?? '', /plano não encontrado/i)
  })
  test('plano novo interno é bloqueado (reaproveita validarPlanoParaAssinaturaSelfService)', () => {
    const motivo = validarUpgradePlano(PLANO_STARTER, { ...PLANO_GROWTH, interno: true })
    assert.match(motivo ?? '', /não está disponível para contratação self-service/)
  })
  test('plano novo de trial é bloqueado (reaproveita validarPlanoParaAssinaturaSelfService)', () => {
    const motivo = validarUpgradePlano(PLANO_STARTER, { ...PLANO_GROWTH, eh_plano_trial: true })
    assert.match(motivo ?? '', /teste grátis não pode ser contratado/)
  })
  test('plano novo desativado é bloqueado', () => {
    const motivo = validarUpgradePlano(PLANO_STARTER, { ...PLANO_GROWTH, ativo: false })
    assert.match(motivo ?? '', /não está disponível para contratação/)
  })
  test('sem plano atual (tenant sem plano vinculado) é bloqueado', () => {
    assert.match(validarUpgradePlano(null, PLANO_GROWTH) ?? '', /sem plano atual/i)
  })
  test('tentativa para o MESMO plano é bloqueada', () => {
    const motivo = validarUpgradePlano(PLANO_STARTER, PLANO_STARTER)
    assert.match(motivo ?? '', /já está neste plano/i)
  })
  test('plano INFERIOR (valor menor) é bloqueado — downgrade não é permitido nesta fase', () => {
    const motivo = validarUpgradePlano(PLANO_GROWTH, PLANO_STARTER)
    assert.match(motivo ?? '', /superior ao atual/i)
  })
  test('plano de MESMO valor (não é upgrade de verdade) é bloqueado', () => {
    const motivo = validarUpgradePlano(PLANO_STARTER, { ...PLANO_GROWTH, asaas_subscription_value: PLANO_STARTER.asaas_subscription_value })
    assert.match(motivo ?? '', /superior ao atual/i)
  })
  test('upgrade válido (plano novo superior, diferente, ativo, comercial) é permitido', () => {
    assert.equal(validarUpgradePlano(PLANO_STARTER, PLANO_GROWTH), null)
  })
})

// Correção pós-revisão (Fase 8B) — compararNivelPlanos é a ÚNICA fonte de
// hierarquia agora (Plano.nivel, nunca preço). Coberto isoladamente aqui
// pra não misturar "como comparo nivel" com as demais regras de
// motivoDowngradePlano abaixo (plano ativo/interno/trial/mesmo id).
describe('compararNivelPlanos', () => {
  test('destino com nivel maior => superior', () => {
    assert.equal(compararNivelPlanos(PLANO_STARTER, PLANO_GROWTH), 'superior')
  })
  test('destino com nivel menor => inferior', () => {
    assert.equal(compararNivelPlanos(PLANO_GROWTH, PLANO_STARTER), 'inferior')
  })
  test('mesmo nivel => mesmo', () => {
    assert.equal(compararNivelPlanos(PLANO_GROWTH, { ...PLANO_STARTER, nivel: PLANO_GROWTH.nivel }), 'mesmo')
  })
  test('nivel ausente (null) no atual => indeterminado', () => {
    assert.equal(compararNivelPlanos({ ...PLANO_GROWTH, nivel: null }, PLANO_STARTER), 'indeterminado')
  })
  test('nivel ausente (null) no destino => indeterminado', () => {
    assert.equal(compararNivelPlanos(PLANO_GROWTH, { ...PLANO_STARTER, nivel: null }), 'indeterminado')
  })
  test('atual null (nenhum plano vinculado) => indeterminado', () => {
    assert.equal(compararNivelPlanos(null, PLANO_STARTER), 'indeterminado')
  })
  test('destino null => indeterminado', () => {
    assert.equal(compararNivelPlanos(PLANO_GROWTH, null), 'indeterminado')
  })
})

// Fase 8B — mesmo padrão de validarUpgradePlano acima, sentido oposto.
// Correção pós-revisão: direção decidida por compararNivelPlanos (nivel),
// NUNCA mais por preço — valorAtualContratado deixou de ser parâmetro desta
// função (ver comentário em asaasClient.ts).
describe('motivoDowngradePlano', () => {
  test('plano novo não encontrado é bloqueado (reaproveita validarPlanoParaAssinaturaSelfService)', () => {
    assert.match(motivoDowngradePlano(PLANO_GROWTH, null) ?? '', /plano não encontrado/i)
  })
  test('plano novo interno é bloqueado', () => {
    const motivo = motivoDowngradePlano(PLANO_GROWTH, { ...PLANO_STARTER, interno: true })
    assert.match(motivo ?? '', /não está disponível para contratação self-service/)
  })
  test('plano novo de trial é bloqueado (destino nunca pode ser o plano de teste grátis)', () => {
    const motivo = motivoDowngradePlano(PLANO_GROWTH, { ...PLANO_STARTER, eh_plano_trial: true })
    assert.match(motivo ?? '', /teste grátis não pode ser contratado/)
  })
  test('plano novo desativado é bloqueado', () => {
    const motivo = motivoDowngradePlano(PLANO_GROWTH, { ...PLANO_STARTER, ativo: false })
    assert.match(motivo ?? '', /não está disponível para contratação/)
  })
  test('sem plano atual é bloqueado', () => {
    assert.match(motivoDowngradePlano(null, PLANO_STARTER) ?? '', /sem plano atual/i)
  })
  test('tentativa para o MESMO plano é bloqueada', () => {
    const motivo = motivoDowngradePlano(PLANO_GROWTH, PLANO_GROWTH)
    assert.match(motivo ?? '', /já está neste plano/i)
  })
  test('plano de NIVEL SUPERIOR é bloqueado (isso é upgrade, não downgrade)', () => {
    const motivo = motivoDowngradePlano(PLANO_STARTER, PLANO_GROWTH)
    assert.match(motivo ?? '', /nível inferior ao atual/i)
  })
  test('plano de MESMO nivel é bloqueado (não é downgrade de verdade)', () => {
    const motivo = motivoDowngradePlano(PLANO_GROWTH, { ...PLANO_STARTER, nivel: PLANO_GROWTH.nivel })
    assert.match(motivo ?? '', /nível inferior ao atual/i)
  })
  test('downgrade válido (plano novo de nivel inferior) é permitido', () => {
    assert.equal(motivoDowngradePlano(PLANO_GROWTH, PLANO_STARTER), null)
  })
  test('nivel ausente no plano atual bloqueia (indeterminado, fail-closed — nunca assume direção)', () => {
    const motivo = motivoDowngradePlano({ ...PLANO_GROWTH, nivel: null }, PLANO_STARTER)
    assert.match(motivo ?? '', /hierarquia/i)
  })
  test('nivel ausente no plano destino bloqueia (indeterminado, fail-closed)', () => {
    const motivo = motivoDowngradePlano(PLANO_GROWTH, { ...PLANO_STARTER, nivel: null })
    assert.match(motivo ?? '', /hierarquia/i)
  })
  test('caso obrigatório da tarefa: Growth nivel 2 contratado R$299, Starter nivel 1 catálogo R$349 — continua sendo downgrade (preço invertido não muda a direção)', () => {
    const growthContratado299 = { ...PLANO_GROWTH, asaas_subscription_value: 299 }
    const starterCatalogo349 = { ...PLANO_STARTER, asaas_subscription_value: 349 }
    assert.equal(motivoDowngradePlano(growthContratado299, starterCatalogo349), null)
  })
})

describe('motivoUpgradePendenteBloqueiaNovaTroca', () => {
  test('já existe plano_pendente_id => bloqueia com mensagem clara', () => {
    const motivo = motivoUpgradePendenteBloqueiaNovaTroca('algum-plano-id')
    assert.match(motivo ?? '', /já existe uma troca de plano pendente/i)
  })
  test('sem plano_pendente_id => libera', () => {
    assert.equal(motivoUpgradePendenteBloqueiaNovaTroca(null), null)
  })
})

// Correção pós-revisão (auditoria 8B, bloqueador) — upgrade precisa
// recusar QUALQUER plano_downgrade_id preenchido, não só agendamento
// completo: um claim técnico incompleto já pode ter reprecificado a
// assinatura no Asaas, e um upgrade concorrente calcularia o proporcional
// em cima de um valor de catálogo desatualizado.
describe('motivoDowngradeEmAndamentoBloqueiaUpgrade', () => {
  test('sem downgrade nenhum (plano_downgrade_id null) => segue, não bloqueia', () => {
    assert.equal(motivoDowngradeEmAndamentoBloqueiaUpgrade(null), null)
  })
  test('claim incompleto (plano_downgrade_id preenchido, independente de downgrade_valor_origem) => bloqueia', () => {
    const motivo = motivoDowngradeEmAndamentoBloqueiaUpgrade('plano-starter')
    assert.match(motivo ?? '', /downgrade em andamento/i)
  })
  test('downgrade completo (plano_downgrade_id preenchido) => bloqueia — mesma mensagem, função nem distingue completo de incompleto de propósito', () => {
    const motivo = motivoDowngradeEmAndamentoBloqueiaUpgrade('plano-starter')
    assert.match(motivo ?? '', /cancele ou conclua essa alteração antes de solicitar um upgrade/i)
  })
})

// Correção pós-revisão (concorrência/recovery) — plano_downgrade_id
// funciona como o claim que POST /billing/downgrade reivindica antes de
// reprecificar no Asaas (ver solicitarDowngrade em billing.ts).
// classificarClaimDowngrade substitui motivoDowngradeJaAgendadoBloqueiaNovo
// (removida): além de bloquear/liberar, devolve os SNAPSHOTS já congelados
// quando o estado é 'recuperavel' — nunca precisam ser recalculados.
describe('classificarClaimDowngrade', () => {
  const CLAIM_COMPLETO = {
    plano_downgrade_id: 'plano-novo', downgrade_efetivar_em: new Date('2026-09-12'),
    downgrade_valor_origem: 349, downgrade_valor_destino: 149,
  }
  const CLAIM_INCOMPLETO = { ...CLAIM_COMPLETO, downgrade_valor_origem: null }

  test('sem plano_downgrade_id => sem_claim', () => {
    const r = classificarClaimDowngrade({ plano_downgrade_id: null, downgrade_efetivar_em: null, downgrade_valor_origem: null, downgrade_valor_destino: null }, 'plano-novo')
    assert.equal(r.estado, 'sem_claim')
  })
  test('plano_downgrade_id de OUTRO plano (concorrente com destino diferente, ou agendamento anterior de verdade) => bloqueado', () => {
    const r = classificarClaimDowngrade({ ...CLAIM_INCOMPLETO, plano_downgrade_id: 'plano-x' }, 'plano-novo')
    assert.equal(r.estado, 'bloqueado')
    if (r.estado === 'bloqueado') assert.match(r.motivo, /outro plano/i)
  })
  test('mesmo plano, downgrade_valor_origem já preenchido (agendamento concluído) => bloqueado', () => {
    const r = classificarClaimDowngrade(CLAIM_COMPLETO, 'plano-novo')
    assert.equal(r.estado, 'bloqueado')
    if (r.estado === 'bloqueado') assert.match(r.motivo, /já existe um downgrade agendado/i)
  })
  test('mesmo plano, origem null, mas efetivar_em/destino ausentes (estado inconsistente — nunca deveria acontecer com o claim atômico atual) => bloqueado fail-closed', () => {
    const r = classificarClaimDowngrade({ plano_downgrade_id: 'plano-novo', downgrade_efetivar_em: null, downgrade_valor_origem: null, downgrade_valor_destino: null }, 'plano-novo')
    assert.equal(r.estado, 'bloqueado')
    if (r.estado === 'bloqueado') assert.match(r.motivo, /inconsistente/i)
  })
  // Recovery nunca depende do catálogo/nivel/preço atual do plano — a
  // função nem RECEBE esses dados como parâmetro (só os 4 campos do
  // Tenant + o planoId solicitado), então devolve sempre o snapshot já
  // congelado (149), estruturalmente impossível de "vazar" um valor de
  // catálogo (ex.: 179) pra dentro da decisão.
  test('mesmo plano, origem null, efetivar_em/destino congelados => recuperavel, com os snapshots (nunca o catálogo — função nem recebe esse dado)', () => {
    const r = classificarClaimDowngrade(CLAIM_INCOMPLETO, 'plano-novo')
    assert.equal(r.estado, 'recuperavel')
    if (r.estado === 'recuperavel') {
      assert.equal(r.valorDestino, 149)
      assert.deepEqual(r.efetivarEm, new Date('2026-09-12'))
    }
  })
})

// Estado explícito único — nunca plano_downgrade_id nem downgrade_efetivar_em
// sozinhos como sinal de "downgrade ativo" (ambos já vêm preenchidos desde
// o claim, antes do Asaas confirmar — ver comentário na função).
describe('downgradeAgendamentoCompleto', () => {
  const AGENDADO_COMPLETO = {
    plano_downgrade_id: 'plano-starter', downgrade_efetivar_em: new Date('2026-09-12'),
    downgrade_valor_origem: 349, downgrade_valor_destino: 149,
  }

  test('nenhum downgrade (todos null) => false', () => {
    assert.equal(downgradeAgendamentoCompleto({ plano_downgrade_id: null, downgrade_efetivar_em: null, downgrade_valor_origem: null, downgrade_valor_destino: null }), false)
  })
  test('claim incompleto (destino/data congelados, origem ainda null) => false', () => {
    assert.equal(downgradeAgendamentoCompleto({ ...AGENDADO_COMPLETO, downgrade_valor_origem: null }), false)
  })
  test('plano_downgrade_id sozinho, mais nada preenchido (nunca deveria acontecer, mas defensivo) => false', () => {
    assert.equal(downgradeAgendamentoCompleto({ plano_downgrade_id: 'plano-starter', downgrade_efetivar_em: null, downgrade_valor_origem: null, downgrade_valor_destino: null }), false)
  })
  test('downgrade_efetivar_em sozinho, sem plano_downgrade_id (nunca deveria acontecer, mas defensivo) => false', () => {
    assert.equal(downgradeAgendamentoCompleto({ plano_downgrade_id: null, downgrade_efetivar_em: new Date('2026-09-12'), downgrade_valor_origem: null, downgrade_valor_destino: null }), false)
  })
  test('os 4 campos preenchidos => true, agendamento completo', () => {
    assert.equal(downgradeAgendamentoCompleto(AGENDADO_COMPLETO), true)
  })
})

// POST /billing/downgrade — decide o que fazer com o valor REAL da
// assinatura no Asaas, lido ao vivo imediatamente antes de reprecificar,
// comparado contra origem estável (tenant.valor_assinatura_atual ou
// inicializado dele) e destino (planoDestino.asaas_subscription_value).
describe('decidirEstadoRemotoDowngrade', () => {
  test('remoto === origem => primeira_tentativa (cobre tanto a 1ª tentativa de verdade quanto um retry ANTES do PUT no Asaas ter rodado)', () => {
    assert.equal(decidirEstadoRemotoDowngrade(349, 349, 149), 'primeira_tentativa')
  })
  test('remoto === destino (PUT de uma tentativa anterior já aplicado, persistência local que falhou) => retry_idempotente', () => {
    assert.equal(decidirEstadoRemotoDowngrade(149, 349, 149), 'retry_idempotente')
  })
  test('remoto diferente de origem E destino => divergencia_bloqueia (fail-closed, nunca sobrescreve às cegas)', () => {
    assert.equal(decidirEstadoRemotoDowngrade(299, 349, 149), 'divergencia_bloqueia')
  })
  test('origem === destino (empate, caso extremo) resolve como primeira_tentativa por prioridade documentada', () => {
    assert.equal(decidirEstadoRemotoDowngrade(200, 200, 200), 'primeira_tentativa')
  })

  // Cenário exato do bug corrigido nesta rodada: catálogo do plano destino
  // mudou de 149 pra 179 ENTRE a 1ª tentativa (que já reprecificou o Asaas
  // pra 149) e o retry. O snapshot congelado no claim (downgrade_valor_destino
  // = 149) é o que chega aqui como `valorDestino` — 179 nunca é passado pra
  // esta função (billing.ts usa o snapshot, nunca resultado.planoNovo.
  // asaas_subscription_value, quando `retomando` é true). Com o snapshot
  // certo, remoto (149) bate com destino (149): retry idempotente, nunca
  // bloqueia por uma divergência que a própria tentativa anterior causou.
  test('retry com catálogo alterado: snapshot de destino (149) é reconhecido, catálogo novo (179) nunca entra na decisão', () => {
    const valorDestinoSnapshot = 149 // downgrade_valor_destino persistido no claim da 1ª tentativa
    const catalogoAtualIrrelevante = 179 // resultado.planoNovo.asaas_subscription_value hoje — NUNCA usado aqui
    const remoto = 149 // Asaas já reprecificado pela 1ª tentativa
    assert.equal(decidirEstadoRemotoDowngrade(remoto, 349, valorDestinoSnapshot), 'retry_idempotente')
    assert.notEqual(valorDestinoSnapshot, catalogoAtualIrrelevante)
  })
})

// DELETE /billing/downgrade (cancelarDowngrade, billing.ts) reaproveita
// decidirEstadoRemotoDowngrade pras duas situações de reconciliação — sem
// criar nenhuma decisão pura nova, conforme pedido ("não duplicar a máquina
// de estados já existente"). Os testes acima já cobrem exaustivamente as 3
// saídas da função em si; os testes abaixo só documentam/confirmam que a
// MESMA função, chamada com os argumentos na ordem que cancelarDowngrade
// usa em cada situação, produz a decisão certa.
describe('decidirEstadoRemotoDowngrade — reaproveitada por DELETE /billing/downgrade', () => {
  test('claim INCOMPLETO, remoto === origem (chamada direta, mesma ordem do POST): Asaas nunca foi tocado => primeira_tentativa => cancelarDowngrade NÃO chama PUT', () => {
    // origem=349 (valor_assinatura_atual), destino=149 (downgrade_valor_destino)
    assert.equal(decidirEstadoRemotoDowngrade(349, 349, 149), 'primeira_tentativa')
  })
  test('claim INCOMPLETO, remoto === destino: POST chegou a reprecificar mas não persistiu => retry_idempotente => cancelarDowngrade restaura pra origem', () => {
    assert.equal(decidirEstadoRemotoDowngrade(149, 349, 149), 'retry_idempotente')
  })
  test('claim INCOMPLETO, remoto num terceiro valor => divergencia_bloqueia => cancelarDowngrade bloqueia sem tocar em nada', () => {
    assert.equal(decidirEstadoRemotoDowngrade(299, 349, 149), 'divergencia_bloqueia')
  })

  // Downgrade COMPLETO: cancelarDowngrade chama decidirEstadoRemotoDowngrade
  // com origem/destino DELIBERADAMENTE invertidos (destino no lugar de
  // "origem", origem no lugar de "destino") — porque no sentido do
  // cancelamento o valor "esperado ANTES de mexer" é o DESTINO (a
  // assinatura já reflete esse valor desde que o downgrade completou).
  test('downgrade COMPLETO, remoto === destino (chamada invertida): ainda não restaurado => primeira_tentativa => cancelarDowngrade chama o PUT restaurando pra origem', () => {
    const origem = 349
    const destino = 149
    const remoto = destino // assinatura ainda no valor destino (downgrade completou, nunca cancelado antes)
    assert.equal(decidirEstadoRemotoDowngrade(remoto, destino, origem), 'primeira_tentativa')
  })
  test('downgrade COMPLETO, remoto === origem (chamada invertida): retry depois de "Asaas restaurado + limpeza local falhou" => retry_idempotente => cancelarDowngrade reconhece e só limpa local, sem chamar o PUT de novo', () => {
    const origem = 349
    const destino = 149
    const remoto = origem // uma tentativa anterior já restaurou a assinatura pra origem
    assert.equal(decidirEstadoRemotoDowngrade(remoto, destino, origem), 'retry_idempotente')
  })
  test('downgrade COMPLETO, remoto num terceiro valor (chamada invertida) => divergencia_bloqueia => cancelarDowngrade bloqueia sem tocar em nada', () => {
    assert.equal(decidirEstadoRemotoDowngrade(299, 149, 349), 'divergencia_bloqueia')
  })
})

// Correção pós-homologação — DELETE /billing/upgrade (cancelamento de
// upgrade pendente ainda não pago). tenantBase/cobrancaBase seguem o mesmo
// padrão de fixtures pequenas já usado no resto deste arquivo (ex.:
// validarCobrancaParaRegularizacao acima).
describe('motivoCancelamentoUpgradeBloqueado — cancelamento de upgrade pendente (correção pós-homologação)', () => {
  const tenantBase = (over: Partial<{ plano_pendente_id: string | null; plano_pendente_payment_id: string | null; asaas_customer_id: string | null }> = {}) => ({
    plano_pendente_id: 'plano-growth',
    plano_pendente_payment_id: 'pay_proporcional_1',
    asaas_customer_id: 'cus_1',
    ...over,
  })
  const cobrancaBase = (over: Partial<{ id: string; customer: string; subscription: string | null | undefined; status: string }> = {}) => ({
    id: 'pay_proporcional_1',
    customer: 'cus_1',
    subscription: null,
    status: 'PENDING',
    ...over,
  })

  // 1. sem upgrade pendente
  test('sem plano_pendente_id => bloqueia, nada para cancelar', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase({ plano_pendente_id: null }), cobrancaBase())
    assert.match(motivo ?? '', /não há upgrade pendente/i)
  })

  // 2. sem payment id
  test('sem plano_pendente_payment_id => bloqueia, nada para cancelar', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase({ plano_pendente_payment_id: null }), cobrancaBase())
    assert.match(motivo ?? '', /não há upgrade pendente/i)
  })

  // 3. payment diferente do persistido
  test('cobrança encontrada com id diferente do persistido => bloqueia', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ id: 'pay_outro' }))
    assert.match(motivo ?? '', /não corresponde ao upgrade pendente/i)
  })

  // 4. customer diferente
  test('cobrança de outro customer => bloqueia (nunca cancela cobrança de outro tenant)', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ customer: 'cus_outro' }))
    assert.match(motivo ?? '', /não pertence a este tenant/i)
  })

  test('cobrança com subscription vinculada (string real) => bloqueia (não é a avulsa esperada)', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ subscription: 'sub_1' }))
    assert.match(motivo ?? '', /não é a cobrança avulsa esperada/i)
  })

  // Bug de homologação (correção pós-homologação) — CobrancaAsaas.subscription
  // é tipado "string | null" (nunca opcional), mas isso é garantia do TS, não
  // do Asaas: uma cobrança avulsa real chegou sem a chave "subscription" no
  // JSON (undefined em runtime), e o antigo `!== null` bloqueava um
  // cancelamento legítimo com 409. null e undefined/campo ausente precisam
  // ser equivalentes aqui — só uma subscription de verdade bloqueia.
  test('subscription undefined (explícito) => permite, mesmo tratamento de null', () => {
    assert.equal(motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ subscription: undefined })), null)
  })
  test('subscription ausente do objeto (chave omitida pelo Asaas, cenário real do bug) => permite', () => {
    const { subscription: _omitido, ...semSubscription } = cobrancaBase()
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase(), semSubscription as ReturnType<typeof cobrancaBase>)
    assert.equal(motivo, null)
  })

  // 5. PENDING pode cancelar
  test('PENDING => libera o cancelamento', () => {
    assert.equal(motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ status: 'PENDING' })), null)
  })

  // 6. OVERDUE pode cancelar
  test('OVERDUE => libera o cancelamento', () => {
    assert.equal(motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ status: 'OVERDUE' })), null)
  })

  // 7. CONFIRMED/RECEIVED não pode
  test('CONFIRMED => bloqueia, preserva o plano pendente pro webhook concluir', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ status: 'CONFIRMED' }))
    assert.match(motivo ?? '', /já foi pago/i)
  })
  test('RECEIVED => bloqueia, preserva o plano pendente pro webhook concluir', () => {
    const motivo = motivoCancelamentoUpgradeBloqueado(tenantBase(), cobrancaBase({ status: 'RECEIVED' }))
    assert.match(motivo ?? '', /já foi pago/i)
  })

  // Retry: cobrança já não existe mais no Asaas (404 ao buscar, ver
  // erroAsaasStatus/cancelarUpgrade) — tratada como já-cancelada, libera
  // direto pra limpeza local em vez de bloquear pra sempre.
  test('cobrança null (já removida no Asaas) => libera pra limpeza local, mesmo sem mais nada pra validar', () => {
    assert.equal(motivoCancelamentoUpgradeBloqueado(tenantBase(), null), null)
  })
})

describe('erroAsaasStatus — extrai o status HTTP do erro lançado por asaasFetch', () => {
  test('mensagem no formato "Asaas respondeu 404: ..." => 404', () => {
    assert.equal(erroAsaasStatus(new Error('Asaas respondeu 404: [{"description":"Cobrança não encontrada"}]')), 404)
  })
  test('outro status (500) => 500, nunca tratado como "não encontrado"', () => {
    assert.equal(erroAsaasStatus(new Error('Asaas respondeu 500: [{"description":"Erro interno"}]')), 500)
  })
  test('erro sem o formato esperado => null', () => {
    assert.equal(erroAsaasStatus(new Error('falha de rede')), null)
  })
  test('não é um Error => null', () => {
    assert.equal(erroAsaasStatus('string qualquer'), null)
  })
})

// Fase 8A (correção pós-revisão) — substitui a aproximação fixa (mês=30/
// ano=360) por calendário real: calcularVencimentoAnterior é o inverso
// exato de calcularProximoVencimento (já testada acima), e
// duracaoCicloDiasReal mede a distância de verdade entre o início do
// ciclo (achado invertendo a partir de licenca_fim) e o próprio
// licenca_fim.
describe('calcularVencimentoAnterior — inverso de calcularProximoVencimento (calendário real)', () => {
  test('MONTHLY: 1 mês pra trás', () => {
    const resultado = calcularVencimentoAnterior(new Date('2026-08-10T12:00:00Z'), 'MONTHLY')
    assert.equal(resultado.toISOString(), new Date('2026-07-10T12:00:00Z').toISOString())
  })
  test('YEARLY: 1 ano pra trás', () => {
    const resultado = calcularVencimentoAnterior(new Date('2026-08-10T12:00:00Z'), 'YEARLY')
    assert.equal(resultado.toISOString(), new Date('2025-08-10T12:00:00Z').toISOString())
  })
  test('WEEKLY: 7 dias corridos pra trás (ciclo em dias fixos, não mês de calendário)', () => {
    const resultado = calcularVencimentoAnterior(new Date('2026-08-10T12:00:00Z'), 'WEEKLY')
    assert.equal(resultado.toISOString(), new Date('2026-08-03T12:00:00Z').toISOString())
  })
  test('é o inverso exato de calcularProximoVencimento — ida e volta reproduz a mesma data', () => {
    const dataOriginal = new Date('2026-05-15T09:00:00Z')
    const proximo = calcularProximoVencimento(dataOriginal, 'MONTHLY')
    const volta = calcularVencimentoAnterior(proximo, 'MONTHLY')
    assert.equal(volta.toISOString(), dataOriginal.toISOString())
  })
})

describe('duracaoCicloDiasReal — duração REAL do ciclo (calendário de verdade, não aproximação 30/360)', () => {
  test('ciclo MONTHLY que atravessa fevereiro (28 dias em 2026, não bissexto) => 28, não 30', () => {
    // licenca_fim = 10/mar; início do ciclo (calcularVencimentoAnterior) = 10/fev.
    const licencaFim = new Date('2026-03-10T00:00:00Z')
    assert.equal(duracaoCicloDiasReal(licencaFim, 'MONTHLY'), 28)
  })
  test('ciclo MONTHLY num mês de 31 dias (julho) => 31, não 30', () => {
    // licenca_fim = 10/ago; início do ciclo = 10/jul (31 dias).
    const licencaFim = new Date('2026-08-10T00:00:00Z')
    assert.equal(duracaoCicloDiasReal(licencaFim, 'MONTHLY'), 31)
  })
  test('ciclo WEEKLY => sempre 7 dias exatos (dias fixos, sem variação de calendário)', () => {
    const licencaFim = new Date('2026-08-10T00:00:00Z')
    assert.equal(duracaoCicloDiasReal(licencaFim, 'WEEKLY'), 7)
  })
  test('ciclo YEARLY sem fevereiro bissexto no meio => 365, não 360', () => {
    const licencaFim = new Date('2026-08-10T00:00:00Z')
    assert.equal(duracaoCicloDiasReal(licencaFim, 'YEARLY'), 365)
  })
})

describe('diasRestantesCicloAtual', () => {
  const AGORA = new Date('2026-07-10T12:00:00Z')
  const DIA_MS = 86_400_000

  test('metade do ciclo restante', () => {
    const licencaFim = new Date(AGORA.getTime() + 15 * DIA_MS)
    assert.equal(diasRestantesCicloAtual(licencaFim, 30, AGORA), 15)
  })
  test('ciclo inteiro restante (acabou de renovar)', () => {
    const licencaFim = new Date(AGORA.getTime() + 30 * DIA_MS)
    assert.equal(diasRestantesCicloAtual(licencaFim, 30, AGORA), 30)
  })
  test('licenca_fim além do ciclo (não deveria acontecer, mas nunca ultrapassa 100% do ciclo)', () => {
    const licencaFim = new Date(AGORA.getTime() + 90 * DIA_MS)
    assert.equal(diasRestantesCicloAtual(licencaFim, 30, AGORA), 30)
  })
  test('licenca_fim já vencido => 0 dias restantes, nunca negativo', () => {
    const licencaFim = new Date(AGORA.getTime() - 5 * DIA_MS)
    assert.equal(diasRestantesCicloAtual(licencaFim, 30, AGORA), 0)
  })

  // Bug de homologação (Fase 8A, correção pós-revisão N): preview às
  // 17:44 e cobrança real às 17:57 (mesmo dia) davam valores diferentes
  // porque a versão anterior subtraía instantes em ms, então cada minuto
  // que passava "consumia" uma fração de dia. Trunca pro dia civil (UTC)
  // ANTES de subtrair — mesma data, qualquer hora, mesmo resultado.
  test('mesmo dia civil, chamado às 00:05 e às 23:55 => mesmo resultado (cenário real: upgrade 12/08, vencimento 12/09, ciclo de 31 dias)', () => {
    const licencaFim = new Date('2026-09-12T00:00:00Z')
    const inicioDoDia = new Date('2026-08-12T00:05:00Z')
    const fimDoDia = new Date('2026-08-12T23:55:00Z')
    assert.equal(diasRestantesCicloAtual(licencaFim, 31, inicioDoDia), 31)
    assert.equal(diasRestantesCicloAtual(licencaFim, 31, fimDoDia), 31)
  })

  // Correção pós-revisão 2: truncar "agora" por UTC (em vez de
  // America/Sao_Paulo) fazia o dia virar às 21h no horário do Brasil —
  // 21:01 BRT já é 00:01 UTC do dia seguinte. Os 4 horários abaixo são
  // todos ainda 12/08 no Brasil (o último, 23:55 BRT, já é 13/08 em UTC) e
  // precisam produzir o mesmo resultado; só às 00:01 BRT do dia seguinte
  // (13/08) o dia deve de fato virar.
  test('mesmo dia civil BRASILEIRO em horários que cruzam a virada UTC (20:59 vs 21:01 vs 23:55 BRT) => mesmo resultado', () => {
    const licencaFim = new Date('2026-09-12T00:00:00Z')
    const horariosBrt = [
      '2026-08-12T00:05:00-03:00',
      '2026-08-12T20:59:00-03:00',
      '2026-08-12T21:01:00-03:00', // já é 13/08 em UTC — não pode contar como o dia seguinte
      '2026-08-12T23:55:00-03:00', // já é 13/08 em UTC — não pode contar como o dia seguinte
    ]
    for (const horario of horariosBrt) {
      assert.equal(diasRestantesCicloAtual(licencaFim, 31, new Date(horario)), 31, horario)
    }
  })

  test('13/08 00:01 BRT (dia seguinte de verdade no Brasil) => reduz exatamente 1 dia', () => {
    const licencaFim = new Date('2026-09-12T00:00:00Z')
    const diaSeguinte = new Date('2026-08-13T00:01:00-03:00')
    assert.equal(diasRestantesCicloAtual(licencaFim, 31, diaSeguinte), 30)
  })

  test('ciclo de 30 dias (abril) — dia civil, hora não interfere', () => {
    const licencaFim = new Date('2026-05-12T00:00:00Z')
    const agora = new Date('2026-04-12T08:30:00Z')
    assert.equal(diasRestantesCicloAtual(licencaFim, 30, agora), 30)
  })

  test('fevereiro não bissexto (2026, 28 dias) — dia civil, hora não interfere', () => {
    const licencaFim = new Date('2026-03-10T00:00:00Z')
    const agora = new Date('2026-02-10T21:00:00Z')
    assert.equal(diasRestantesCicloAtual(licencaFim, 28, agora), 28)
  })

  test('fevereiro bissexto (2028, 29 dias) — dia civil, hora não interfere', () => {
    const licencaFim = new Date('2028-03-10T00:00:00Z')
    const agora = new Date('2028-02-10T03:00:00Z')
    assert.equal(diasRestantesCicloAtual(licencaFim, 29, agora), 29)
  })

  test('último dia do ciclo (agora é o próprio dia do vencimento, qualquer hora) => 0 dias restantes', () => {
    const licencaFim = new Date('2026-09-12T00:00:00Z')
    const agora = new Date('2026-09-12T23:59:00Z')
    assert.equal(diasRestantesCicloAtual(licencaFim, 31, agora), 0)
  })
})

// Bug de homologação (correção pós-homologação) — solicitarUpgrade usava
// new Date().toISOString().slice(0, 10) (dia civil em UTC) pro dueDate da
// cobrança proporcional, mesma classe de bug já corrigida em
// diasRestantesCicloAtual: a partir das 21h em Brasília, UTC já virou o dia
// seguinte, então uma cobrança criada às 21h06 do dia 12 vencia incorretamente
// no dia 13.
describe('dataCivilBRT — dia civil (YYYY-MM-DD) em America/Sao_Paulo, nunca UTC', () => {
  test('12/08 00:05 BRT => 2026-08-12', () => {
    assert.equal(dataCivilBRT(new Date('2026-08-12T00:05:00-03:00')), '2026-08-12')
  })
  test('12/08 20:59 BRT => 2026-08-12', () => {
    assert.equal(dataCivilBRT(new Date('2026-08-12T20:59:00-03:00')), '2026-08-12')
  })
  test('12/08 21:01 BRT => 2026-08-12 (já é 13/08 em UTC, mas ainda 12/08 no Brasil)', () => {
    assert.equal(dataCivilBRT(new Date('2026-08-12T21:01:00-03:00')), '2026-08-12')
  })
  test('12/08 23:59 BRT => 2026-08-12', () => {
    assert.equal(dataCivilBRT(new Date('2026-08-12T23:59:00-03:00')), '2026-08-12')
  })
  test('13/08 00:01 BRT (dia seguinte de verdade no Brasil) => 2026-08-13', () => {
    assert.equal(dataCivilBRT(new Date('2026-08-13T00:01:00-03:00')), '2026-08-13')
  })
})

// Fase 8B (fundação) — efetivarEm codificado como meia-noite UTC do dia
// civil pretendido (mesma convenção de licenca_fim/dueDate). Downgrade
// agendado pra efetivar em 12/09.
describe('downgradeDeveEfetivar — comparação por dia civil BRT (Fase 8B, fundação)', () => {
  const efetivarEm12set = new Date('2026-09-12T00:00:00Z')

  test('11/09 23:59 BRT => false (ainda não chegou, mesmo faltando 1 minuto)', () => {
    assert.equal(downgradeDeveEfetivar(efetivarEm12set, new Date('2026-09-11T23:59:00-03:00')), false)
  })
  test('12/09 00:00 BRT => true (chegou no exato instante da virada civil)', () => {
    assert.equal(downgradeDeveEfetivar(efetivarEm12set, new Date('2026-09-12T00:00:00-03:00')), true)
  })
  test('12/09 23:59 BRT => true (ainda dentro do dia de efetivação)', () => {
    assert.equal(downgradeDeveEfetivar(efetivarEm12set, new Date('2026-09-12T23:59:00-03:00')), true)
  })
  test('dia seguinte (13/09) => true (scheduler atrasado, efetivação continua valendo)', () => {
    assert.equal(downgradeDeveEfetivar(efetivarEm12set, new Date('2026-09-13T10:00:00-03:00')), true)
  })
  test('bem antes (01/09 BRT) => false', () => {
    assert.equal(downgradeDeveEfetivar(efetivarEm12set, new Date('2026-09-01T12:00:00-03:00')), false)
  })
})

// Correção pós-revisão (Fase 8B) — a versão anterior recebia só
// `cobranca: Pick<CobrancaAsaas,'status'> | null` e tratava null como um
// único bloqueio, confundindo "ainda não gerada" (deveria liberar) com
// "falha ao consultar" (deve bloquear). Agora recebe a RESOLUÇÃO completa
// (ResolucaoCobrancaProximoCiclo) — os 6 estados pedidos pela tarefa.
describe('motivoRestauracaoDowngradeBloqueada — resolução explícita fail-closed pro cancelamento (Fase 8B)', () => {
  const cobranca = (status: string): CobrancaAsaas => ({
    id: 'pay_x', status, value: 349, customer: 'cus_1', subscription: 'sub_1', dueDate: '2026-09-12', paymentDate: null,
  })

  test('nao_encontrada (nenhuma cobrança gerada ainda) => permite restaurar (só o subscription.value, nada a tocar na cobrança)', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'nao_encontrada' })
    assert.equal(motivo, null)
  })
  test('identificada + PENDING => permite restaurar (com updatePendingPayments:true)', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'identificada', cobranca: cobranca('PENDING') })
    assert.equal(motivo, null)
  })
  test('identificada + OVERDUE => permite restaurar', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'identificada', cobranca: cobranca('OVERDUE') })
    assert.equal(motivo, null)
  })
  test('identificada + CONFIRMED => bloqueia (já foi paga no valor destino, restaurar não desfaz o pagamento)', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'identificada', cobranca: cobranca('CONFIRMED') })
    assert.match(motivo ?? '', /já foi processada/i)
  })
  test('identificada + RECEIVED => bloqueia', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'identificada', cobranca: cobranca('RECEIVED') })
    assert.match(motivo ?? '', /já foi processada/i)
  })
  test('identificada + status desconhecido => bloqueia (fail-closed, nunca whitelist por exclusão)', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'identificada', cobranca: cobranca('REFUNDED') })
    assert.match(motivo ?? '', /já foi processada/i)
  })
  test('ambigua (múltiplas candidatas) => bloqueia — nunca resolvida arbitrariamente', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'consultada', situacao: 'ambigua', quantidade: 2 })
    assert.match(motivo ?? '', /mais de uma cobrança/i)
  })
  test('falha_consulta => bloqueia — nunca confundida com "nao_encontrada"', () => {
    const motivo = motivoRestauracaoDowngradeBloqueada({ tipo: 'falha_consulta' })
    assert.match(motivo ?? '', /não foi possível confirmar/i)
  })
})

describe('motivoCobrancaAnteriorBloqueiaDowngrade — proteção antes de uma futura reprecificação (Fase 8B, fundação)', () => {
  const efetivarEm = new Date('2026-09-12T00:00:00Z')
  const cobranca = (over: Partial<{ status: string; dueDate: string }> = {}) => ({ status: 'PENDING', dueDate: '2026-09-12', ...over })

  test('PENDING com dueDate ANTERIOR à efetivação => bloqueia', () => {
    const motivo = motivoCobrancaAnteriorBloqueiaDowngrade([cobranca({ dueDate: '2026-08-12' })], efetivarEm)
    assert.match(motivo ?? '', /cobrança em aberto/i)
  })
  test('OVERDUE com dueDate ANTERIOR à efetivação => bloqueia', () => {
    const motivo = motivoCobrancaAnteriorBloqueiaDowngrade([cobranca({ status: 'OVERDUE', dueDate: '2026-08-12' })], efetivarEm)
    assert.match(motivo ?? '', /cobrança em aberto/i)
  })
  test('PENDING com dueDate NA data de efetivação => não é "anterior", não bloqueia por este motivo', () => {
    assert.equal(motivoCobrancaAnteriorBloqueiaDowngrade([cobranca({ dueDate: '2026-09-12' })], efetivarEm), null)
  })
  test('PENDING com dueDate POSTERIOR à efetivação => não bloqueia', () => {
    assert.equal(motivoCobrancaAnteriorBloqueiaDowngrade([cobranca({ dueDate: '2026-10-12' })], efetivarEm), null)
  })
  test('CONFIRMED/RECEIVED anteriores nunca bloqueiam (já pagas, fora do domínio desta proteção)', () => {
    assert.equal(motivoCobrancaAnteriorBloqueiaDowngrade([cobranca({ status: 'CONFIRMED', dueDate: '2026-08-12' })], efetivarEm), null)
  })
  test('lista vazia => não bloqueia', () => {
    assert.equal(motivoCobrancaAnteriorBloqueiaDowngrade([], efetivarEm), null)
  })
  test('comparação por dia civil, não ms — dueDate um dia antes só bloqueia de verdade (garante que não há deslocamento de fuso na comparação)', () => {
    // dueDate=2026-09-11 é literalmente 1 dia civil antes de 2026-09-12,
    // sem ambiguidade nenhuma de fuso possível (ambos strings YYYY-MM-DD).
    const motivo = motivoCobrancaAnteriorBloqueiaDowngrade([cobranca({ dueDate: '2026-09-11' })], efetivarEm)
    assert.match(motivo ?? '', /cobrança em aberto/i)
  })
})

describe('identificarCobrancaProximoCiclo — fail-closed (Fase 8B, fundação)', () => {
  const efetivarEm = new Date('2026-09-12T00:00:00Z')
  const cobranca = (over: Partial<CobrancaAsaas> = {}): CobrancaAsaas => ({
    id: 'pay_x', status: 'PENDING', value: 349, customer: 'cus_1', subscription: 'sub_1',
    dueDate: '2026-09-12', paymentDate: null, ...over,
  })

  test('exatamente 1 candidata (mesma subscription, dueDate = efetivarEm) => identificada', () => {
    const resultado = identificarCobrancaProximoCiclo([cobranca()], 'sub_1', efetivarEm)
    assert.equal(resultado.situacao, 'identificada')
    assert.equal(resultado.situacao === 'identificada' && resultado.cobranca.id, 'pay_x')
  })
  test('nenhuma candidata (Asaas ainda não gerou a cobrança do próximo ciclo) => nao_encontrada', () => {
    const resultado = identificarCobrancaProximoCiclo([cobranca({ dueDate: '2026-08-12' })], 'sub_1', efetivarEm)
    assert.equal(resultado.situacao, 'nao_encontrada')
  })
  test('mais de 1 candidata => ambigua, nunca resolvida arbitrariamente', () => {
    const resultado = identificarCobrancaProximoCiclo([cobranca({ id: 'pay_a' }), cobranca({ id: 'pay_b' })], 'sub_1', efetivarEm)
    assert.equal(resultado.situacao, 'ambigua')
    assert.equal(resultado.situacao === 'ambigua' && resultado.quantidade, 2)
  })
  test('candidata de OUTRA assinatura (mesma data) nunca conta', () => {
    const resultado = identificarCobrancaProximoCiclo([cobranca({ subscription: 'sub_outro' })], 'sub_1', efetivarEm)
    assert.equal(resultado.situacao, 'nao_encontrada')
  })
  test('candidata em horário tarde do dia (dueDate ainda YYYY-MM-DD) casa normalmente — comparação por dia civil, não por instante', () => {
    // dueDate do Asaas é sempre "YYYY-MM-DD" (sem hora) — mesmo assim
    // confirma que new Date(dueDate) comparado via dia civil bate com
    // efetivarEm codificado da mesma forma (meia-noite UTC do dia).
    const resultado = identificarCobrancaProximoCiclo([cobranca({ dueDate: '2026-09-12' })], 'sub_1', new Date('2026-09-12T00:00:00Z'))
    assert.equal(resultado.situacao, 'identificada')
  })
})

// Cenário real de homologação: Starter (R$149) -> Growth (R$349), ciclo
// MONTHLY, upgrade solicitado no primeiro dia do ciclo (12/08), vencimento
// 12/09 (31 dias de ciclo, agosto tem 31 dias) — pipeline completo
// duracaoCicloDiasReal + diasRestantesCicloAtual + calcularValorProporcionalUpgrade,
// a mesma sequência de billing.ts:validarECalcularUpgrade. Antes da correção
// esse cenário retornava ~R$193,89-193,91 (variava por minuto); com dia
// civil, upgrade no primeiro dia do ciclo cobra a diferença cheia.
describe('pipeline de upgrade (cenário real de homologação) — determinístico por dia civil', () => {
  test('upgrade Starter->Growth em 12/08, vencimento 12/09 => R$200,00 (diferença cheia, ciclo completo restante)', () => {
    const vencimentoCiclo = new Date('2026-09-12T00:00:00Z')
    const cicloDias = duracaoCicloDiasReal(vencimentoCiclo, 'MONTHLY')
    assert.equal(cicloDias, 31)

    const agoraManha = new Date('2026-08-12T09:00:00Z')
    const agoraNoite = new Date('2026-08-12T21:00:00Z')
    const diasRestantesManha = diasRestantesCicloAtual(vencimentoCiclo, cicloDias, agoraManha)
    const diasRestantesNoite = diasRestantesCicloAtual(vencimentoCiclo, cicloDias, agoraNoite)
    assert.equal(diasRestantesManha, 31)
    assert.equal(diasRestantesNoite, diasRestantesManha)

    const valor = calcularValorProporcionalUpgrade({
      valorAtual: 149, valorNovo: 349, diasRestantesCiclo: diasRestantesManha, cicloDias,
    })
    assert.equal(valor, 200)
  })

  test('arredondamento em centavos determinístico — mesma entrada sempre produz o mesmo centavo (meio do ciclo de 31 dias)', () => {
    const params = { valorAtual: 149, valorNovo: 349, diasRestantesCiclo: 15, cicloDias: 31 }
    const valor1 = calcularValorProporcionalUpgrade(params)
    const valor2 = calcularValorProporcionalUpgrade(params)
    assert.equal(valor1, valor2)
    // diferenca=20000 centavos * 15/31 = 9677,419... -> arredonda pra 9677 centavos
    assert.equal(valor1, 96.77)
  })
})

describe('calcularValorProporcionalUpgrade — valores monetários em centavos, nunca ponto flutuante direto', () => {
  test('metade do ciclo restante => metade da diferença', () => {
    const valor = calcularValorProporcionalUpgrade({ valorAtual: 100, valorNovo: 200, diasRestantesCiclo: 15, cicloDias: 30 })
    assert.equal(valor, 50)
  })
  test('ciclo inteiro restante => diferença cheia', () => {
    const valor = calcularValorProporcionalUpgrade({ valorAtual: 100, valorNovo: 200, diasRestantesCiclo: 30, cicloDias: 30 })
    assert.equal(valor, 100)
  })
  test('nenhum dia restante (upgrade no último instante do ciclo) => 0', () => {
    const valor = calcularValorProporcionalUpgrade({ valorAtual: 100, valorNovo: 200, diasRestantesCiclo: 0, cicloDias: 30 })
    assert.equal(valor, 0)
  })
  test('cicloDias <= 0 (proteção defensiva, nunca deveria acontecer) => 0, nunca divide por zero', () => {
    const valor = calcularValorProporcionalUpgrade({ valorAtual: 100, valorNovo: 200, diasRestantesCiclo: 10, cicloDias: 0 })
    assert.equal(valor, 0)
  })
  test('nunca negativo, mesmo se valorNovo < valorAtual por engano (proteção defensiva — validarUpgradePlano já bloqueia isso antes)', () => {
    const valor = calcularValorProporcionalUpgrade({ valorAtual: 200, valorNovo: 100, diasRestantesCiclo: 15, cicloDias: 30 })
    assert.equal(valor, 0)
  })
  test('centavos: valores com fração não acumulam erro de ponto flutuante', () => {
    // (219.90 - 99.90) * (10/30) = 120 * 0.333... = 40.00 (arredondado em
    // centavos, não em ponto flutuante direto)
    const valor = calcularValorProporcionalUpgrade({ valorAtual: 99.9, valorNovo: 219.9, diasRestantesCiclo: 10, cicloDias: 30 })
    assert.equal(valor, 40)
  })
})

// Fase 8A (correção pós-revisão) — o gate que decide se o webhook precisa
// sincronizar a assinatura Asaas ANTES de aplicar um plano pendente (ver
// tratarWebhookAsaas). Só verdadeiro pra pagamento_confirmado que está de
// fato aplicando uma troca de plano (tinha pendência + dados!=null).
// Fase 8A (correção pós-revisão) — pagamentoConfirmaPendencia é o novo 4º
// sinal que deveSincronizarAssinaturaAntesDeAplicar passou a exigir: sem
// isso, uma renovação normal confirmando enquanto um upgrade está pendente
// sincronizaria a assinatura Asaas pro valor do plano PENDENTE mesmo sem
// aplicar a troca de verdade (ver comentário na função).
describe('pagamentoConfirmaPendencia', () => {
  test('sem payment.id esperado (null) => permissivo, qualquer pagamento corresponde', () => {
    assert.equal(pagamentoConfirmaPendencia('pay_qualquer', null), true)
  })
  test('sem payment.id esperado (undefined) => permissivo, mesmo raciocínio', () => {
    assert.equal(pagamentoConfirmaPendencia('pay_qualquer', undefined), true)
  })
  test('payment.id esperado e o pagamento confirmado é EXATAMENTE esse => true', () => {
    assert.equal(pagamentoConfirmaPendencia('pay_upgrade_1', 'pay_upgrade_1'), true)
  })
  test('payment.id esperado mas o pagamento confirmado é OUTRO (ex.: renovação normal) => false', () => {
    assert.equal(pagamentoConfirmaPendencia('pay_renovacao_2', 'pay_upgrade_1'), false)
  })
})

describe('deveSincronizarAssinaturaAntesDeAplicar', () => {
  test('pagamento_confirmado + tinha pendência + dados aplicados + payment correto => true', () => {
    assert.equal(deveSincronizarAssinaturaAntesDeAplicar('pagamento_confirmado', true, { status: 'ACTIVE' }, true), true)
  })
  test('pagamento_confirmado + tinha pendência + dados aplicados MAS payment NÃO corresponde (renovação normal) => false', () => {
    assert.equal(deveSincronizarAssinaturaAntesDeAplicar('pagamento_confirmado', true, { status: 'ACTIVE' }, false), false)
  })
  test('pagamento_confirmado sem pendência (renovação normal) => false', () => {
    assert.equal(deveSincronizarAssinaturaAntesDeAplicar('pagamento_confirmado', false, { status: 'ACTIVE' }, true), false)
  })
  test('pagamento_confirmado com pendência mas dados=null (ex.: SUSPENDED bloqueou antes) => false', () => {
    assert.equal(deveSincronizarAssinaturaAntesDeAplicar('pagamento_confirmado', true, null, true), false)
  })
  test('pagamento_vencido nunca sincroniza, mesmo com pendência e payment correspondente', () => {
    assert.equal(deveSincronizarAssinaturaAntesDeAplicar('pagamento_vencido', true, { status: 'ACTIVE' }, true), false)
  })
  test('assinatura_cancelada nunca sincroniza, mesmo com pendência e payment correspondente', () => {
    assert.equal(deveSincronizarAssinaturaAntesDeAplicar('assinatura_cancelada', true, { status: 'SUSPENDED' }, true), false)
  })
})

describe('asaasClient — nunca vaza a API key', () => {
  test('erro de uma chamada Asaas com falha não contém a API key configurada', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch

    const SEGREDO = 'segredo-de-teste-nao-deve-vazar-9f3a'
    process.env.ASAAS_API_KEY = SEGREDO
    process.env.ASAAS_ENV = 'sandbox'

    let headerRecebido: string | null = null
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      headerRecebido = headers?.access_token ?? null
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ errors: [{ description: 'cpfCnpj inválido' }] }),
      } as Response
    }) as typeof fetch

    try {
      await assert.rejects(
        () => criarClienteAsaas({ id: 't1' }, { nome: 'Tenant Teste', cpfCnpj: '00000000000' }),
        (err: unknown) => {
          const mensagem = err instanceof Error ? err.message : String(err)
          assert.equal(mensagem.includes(SEGREDO), false)
          assert.match(mensagem, /cpfCnpj inválido/)
          return true
        }
      )
      // A key É usada corretamente pra autenticar a chamada de saída (só não
      // pode aparecer numa mensagem de erro/log).
      assert.equal(headerRecebido, SEGREDO)
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('ASAAS_ENV=production é sempre bloqueado, mesmo com API key configurada', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(
        () => criarClienteAsaas({ id: 't1' }, { nome: 'Tenant Teste', cpfCnpj: '00000000000' }),
        /não é permitido nesta fase/
      )
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('buscarAssinaturaAsaas também bloqueia produção — usada pela sincronização manual (Fase 2)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(() => buscarAssinaturaAsaas('sub_1'), /não é permitido nesta fase/)
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('atualizarClienteAsaas (edição de dados de cobrança) também bloqueia produção', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(
        () => atualizarClienteAsaas('cus_1', { nome: 'Tenant Teste', cpfCnpj: '00000000000' }),
        /não é permitido nesta fase/
      )
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('listarCobrancasAsaas (seção Cobranças, Fase 3) também bloqueia produção', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(() => listarCobrancasAsaas('sub_1'), /não é permitido nesta fase/)
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('listarCobrancasAsaas — erro do Asaas é tratado com mensagem clara, sem vazar a API key', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch

    const SEGREDO = 'segredo-cobrancas-nao-deve-vazar-7c2d'
    process.env.ASAAS_API_KEY = SEGREDO
    process.env.ASAAS_ENV = 'sandbox'

    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ errors: [{ description: 'Assinatura não encontrada' }] }),
    } as Response)) as typeof fetch

    try {
      await assert.rejects(
        () => listarCobrancasAsaas('sub_inexistente'),
        (err: unknown) => {
          const mensagem = err instanceof Error ? err.message : String(err)
          assert.equal(mensagem.includes(SEGREDO), false)
          assert.match(mensagem, /Assinatura não encontrada/)
          return true
        }
      )
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('listarCobrancasAsaas — retorna { data, hasMore } (campos do envelope de paginação Asaas)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch

    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let urlChamada: string | null = null
    globalThis.fetch = (async (url: unknown) => {
      urlChamada = String(url)
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          object: 'list', hasMore: true, totalCount: 51,
          data: [{ id: 'pay_1', status: 'RECEIVED', value: 100, customer: 'cus_1', subscription: 'sub_1', dueDate: '2026-09-08', paymentDate: '2026-08-08' }],
        }),
      } as Response
    }) as typeof fetch

    try {
      const resultado = await listarCobrancasAsaas('sub_1')
      assert.equal(resultado.data.length, 1)
      assert.equal(resultado.data[0].id, 'pay_1')
      assert.equal(resultado.hasMore, true)
      // limit=50 (LIMITE_COBRANCAS) sempre vai junto — sem isso a Fase 3
      // buscaria o limite padrão do Asaas, não o combinado no painel.
      assert.match(urlChamada ?? '', /\/payments\?subscription=sub_1&limit=50/)
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('listarCobrancasAsaas — escapa subscriptionId na URL e repassa hasMore=false', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch

    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let urlChamada: string | null = null
    globalThis.fetch = (async (url: unknown) => {
      urlChamada = String(url)
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ object: 'list', hasMore: false, totalCount: 0, data: [] }),
      } as Response
    }) as typeof fetch

    try {
      // Espaço e "&" no subscriptionId não devem virar parâmetros extras na
      // querystring — precisam sair codificados (encodeURIComponent).
      const resultado = await listarCobrancasAsaas('sub 1&x')
      assert.equal(resultado.hasMore, false)
      assert.equal(resultado.data.length, 0)
      assert.match(urlChamada ?? '', /\/payments\?subscription=sub%201%26x&limit=50/)
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })
})

describe('atualizarBillingTypeCobrancaAsaas — regularização self-service (Fase 5)', () => {
  test('PUT reenvia value/dueDate junto com billingType — nunca omite (Asaas pode interpretar omissão como reset)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch

    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let metodoChamado: string | undefined
    let corpoChamado: string | undefined
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      metodoChamado = init?.method
      corpoChamado = init?.body as string
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'pay_1', status: 'PENDING', value: 149.9, customer: 'cus_1', subscription: 'sub_1',
          dueDate: '2026-09-08', paymentDate: null, billingType: 'UNDEFINED',
        }),
      } as Response
    }) as typeof fetch

    try {
      await atualizarBillingTypeCobrancaAsaas('pay_1', { billingType: 'UNDEFINED', value: 149.9, dueDate: '2026-09-08' })
      assert.equal(metodoChamado, 'PUT')
      const corpo = JSON.parse(corpoChamado ?? '{}')
      assert.deepEqual(corpo, { billingType: 'UNDEFINED', value: 149.9, dueDate: '2026-09-08' })
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  // Correção de produto — troca de forma de pagamento pontual de uma
  // cobrança (POST /billing/cobrancas/:id/pagar em controllers/billing.ts).
  // Casos 7 e 8 da revisão: confirma que a chamada ao Asaas SÓ atinge
  // /payments/:id (nunca /subscriptions/:id — a assinatura nunca é tocada
  // por esta troca) e que value/dueDate chegam exatamente como recebidos
  // (nunca recalculados), pros 3 billingTypes explícitos agora aceitos.
  test('CREDIT_CARD/PIX/BOLETO explícitos: PUT sempre em /payments/:id (nunca /subscriptions), value/dueDate exatos e inalterados', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    const chamadas: Array<{ url: string; metodo?: string; corpo: unknown }> = []
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      chamadas.push({ url: String(url), metodo: init?.method, corpo: JSON.parse((init?.body as string) ?? '{}') })
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          id: 'pay_1', status: 'PENDING', value: 149.9, customer: 'cus_1', subscription: 'sub_1',
          dueDate: '2026-09-08', paymentDate: null,
        }),
      } as Response
    }) as typeof fetch

    try {
      for (const billingType of ['CREDIT_CARD', 'PIX', 'BOLETO'] as const) {
        await atualizarBillingTypeCobrancaAsaas('pay_1', { billingType, value: 149.9, dueDate: '2026-09-08' })
      }
      assert.equal(chamadas.length, 3)
      for (const [i, billingType] of ['CREDIT_CARD', 'PIX', 'BOLETO'].entries()) {
        assert.match(chamadas[i].url, /\/payments\/pay_1$/)
        assert.doesNotMatch(chamadas[i].url, /\/subscriptions\//)
        assert.equal(chamadas[i].metodo, 'PUT')
        assert.deepEqual(chamadas[i].corpo, { billingType, value: 149.9, dueDate: '2026-09-08' })
      }
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })
})

describe('criarCobrancaAvulsaAsaas / atualizarValorAssinaturaAsaas — upgrade self-service (Fase 8A)', () => {
  test('criarCobrancaAvulsaAsaas faz POST /payments SEM subscription (cobrança avulsa, não do ciclo recorrente)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let urlChamada: string | undefined
    let metodoChamado: string | undefined
    let corpoChamado: string | undefined
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      urlChamada = String(url)
      metodoChamado = init?.method
      corpoChamado = init?.body as string
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'pay_avulso_1', status: 'PENDING', value: 40, customer: 'cus_1', subscription: null,
          dueDate: '2026-07-10', paymentDate: null, invoiceUrl: 'https://sandbox.asaas.com/i/pay_avulso_1',
        }),
      } as Response
    }) as typeof fetch

    try {
      const cobranca = await criarCobrancaAvulsaAsaas('cus_1', {
        value: 40, dueDate: '2026-07-10', description: 'Upgrade de plano', externalReference: 'plano-growth',
      })
      assert.match(urlChamada ?? '', /\/payments$/)
      assert.equal(metodoChamado, 'POST')
      const corpo = JSON.parse(corpoChamado ?? '{}')
      assert.equal(corpo.customer, 'cus_1')
      assert.equal(corpo.billingType, 'UNDEFINED')
      assert.equal(corpo.value, 40)
      assert.equal(corpo.subscription, undefined)
      assert.equal(cobranca.invoiceUrl, 'https://sandbox.asaas.com/i/pay_avulso_1')
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('atualizarValorAssinaturaAsaas faz PUT /subscriptions/:id com value e updatePendingPayments:true (repetir com o mesmo valor é seguro/idempotente do lado do Asaas)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let urlChamada: string | undefined
    let metodoChamado: string | undefined
    let corpoChamado: string | undefined
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      urlChamada = String(url)
      metodoChamado = init?.method
      corpoChamado = init?.body as string
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-08-10' }),
      } as Response
    }) as typeof fetch

    try {
      await atualizarValorAssinaturaAsaas('sub_1', 200)
      assert.match(urlChamada ?? '', /\/subscriptions\/sub_1$/)
      assert.equal(metodoChamado, 'PUT')
      assert.deepEqual(JSON.parse(corpoChamado ?? '{}'), { value: 200, updatePendingPayments: true })
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('criarCobrancaAvulsaAsaas também bloqueia produção, mesmo padrão das demais chamadas Asaas', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(
        () => criarCobrancaAvulsaAsaas('cus_1', { value: 40, dueDate: '2026-07-10', description: 'x' }),
        /não é permitido nesta fase/
      )
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('atualizarValorAssinaturaAsaas também bloqueia produção, mesmo padrão das demais chamadas Asaas', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(() => atualizarValorAssinaturaAsaas('sub_1', 200), /não é permitido nesta fase/)
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })
})

describe('cancelarCobrancaAsaas — cancelamento de upgrade pendente (correção pós-homologação)', () => {
  test('faz DELETE /payments/:id (nunca /subscriptions — cancelarAssinaturaAsaas é uma função diferente)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let urlChamada: string | undefined
    let metodoChamado: string | undefined
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      urlChamada = String(url)
      metodoChamado = init?.method
      return { ok: true, status: 200, text: async () => JSON.stringify({ deleted: true, id: 'pay_proporcional_1' }) } as Response
    }) as typeof fetch

    try {
      const resultado = await cancelarCobrancaAsaas('pay_proporcional_1')
      assert.match(urlChamada ?? '', /\/payments\/pay_proporcional_1$/)
      assert.equal(metodoChamado, 'DELETE')
      assert.deepEqual(resultado, { deleted: true, id: 'pay_proporcional_1' })
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('também bloqueia produção, mesmo padrão das demais chamadas Asaas', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    process.env.ASAAS_API_KEY = 'qualquer-coisa'
    process.env.ASAAS_ENV = 'production'
    try {
      await assert.rejects(() => cancelarCobrancaAsaas('pay_x'), /não é permitido nesta fase/)
    } finally {
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('404 (cobrança já removida) propaga como erro — quem decide tratar como já-cancelado é o controller (erroAsaasStatus), nunca este helper', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'
    globalThis.fetch = (async () => ({
      ok: false, status: 404, text: async () => JSON.stringify({ errors: [{ description: 'Cobrança não encontrada' }] }),
    } as Response)) as typeof fetch

    try {
      await assert.rejects(
        () => cancelarCobrancaAsaas('pay_ja_removido'),
        (err: unknown) => {
          assert.equal(erroAsaasStatus(err), 404)
          return true
        }
      )
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })
})

describe('resolverVencimentoCicloAtual — fallback pro Asaas quando licenca_fim está ausente (correção pós-revisão 2)', () => {
  test('licenca_fim presente no banco: retorna ela direto, sem chamar o Asaas', async () => {
    const fetchOriginal = globalThis.fetch
    let fetchChamado = false
    globalThis.fetch = (async () => { fetchChamado = true; throw new Error('não deveria chamar o Asaas') }) as typeof fetch

    try {
      const licencaFim = new Date('2026-10-07T00:00:00.000Z')
      const resultado = await resolverVencimentoCicloAtual({ licenca_fim: licencaFim, asaas_subscription_id: 'sub_1' })
      assert.equal(resultado, licencaFim)
      assert.equal(fetchChamado, false)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })

  // Caso do bug reportado: tenant pago, assinatura Asaas válida, GET
  // /billing/situacao já mostra "Próxima cobrança" (assinatura.nextDueDate),
  // mas Tenant.licenca_fim nunca foi preenchido (nenhum webhook de
  // pagamento confirmado ainda avançou esse campo). Resolve pela mesma
  // fonte que a tela já usa, em vez de bloquear o upgrade.
  test('licenca_fim ausente + assinatura Asaas válida com nextDueDate: resolve pelo Asaas (mesma fonte de "Próxima cobrança")', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'

    let urlChamada: string | undefined
    globalThis.fetch = (async (url: unknown) => {
      urlChamada = String(url)
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-07', value: 200, cycle: 'MONTHLY' }),
      } as Response
    }) as typeof fetch

    try {
      const resultado = await resolverVencimentoCicloAtual({ licenca_fim: null, asaas_subscription_id: 'sub_1' })
      assert.match(urlChamada ?? '', /\/subscriptions\/sub_1$/)
      assert.ok(resultado instanceof Date)
      assert.equal(resultado?.toISOString().slice(0, 10), '2026-10-07')
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })

  test('licenca_fim ausente + sem asaas_subscription_id: retorna null, nunca chama o Asaas', async () => {
    const fetchOriginal = globalThis.fetch
    let fetchChamado = false
    globalThis.fetch = (async () => { fetchChamado = true; throw new Error('não deveria chamar o Asaas') }) as typeof fetch

    try {
      const resultado = await resolverVencimentoCicloAtual({ licenca_fim: null, asaas_subscription_id: null })
      assert.equal(resultado, null)
      assert.equal(fetchChamado, false)
    } finally {
      globalThis.fetch = fetchOriginal
    }
  })

  test('licenca_fim ausente + falha ao consultar o Asaas: retorna null (nunca lança, chamador decide o 400)', async () => {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'
    globalThis.fetch = (async () => {
      return { ok: false, status: 404, text: async () => JSON.stringify({ errors: [{ description: 'Assinatura não encontrada' }] }) } as Response
    }) as typeof fetch

    try {
      const resultado = await resolverVencimentoCicloAtual({ licenca_fim: null, asaas_subscription_id: 'sub_inexistente' })
      assert.equal(resultado, null)
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })
})
