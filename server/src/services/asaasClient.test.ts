import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapearEventoAsaas, calcularProximoVencimento, calcularAtualizacaoTenant, calcularSituacaoAsaas,
  validarPlanoParaAssinaturaSelfService, validarFormaPagamentoSelfService, validarCobrancaParaRegularizacao, bloqueioOperacaoFinanceiraSelfService,
  criarClienteAsaas, atualizarClienteAsaas, buscarAssinaturaAsaas, listarCobrancasAsaas,
  atualizarBillingTypeCobrancaAsaas,
  validarUpgradePlano, motivoUpgradePendenteBloqueiaNovaTroca, calcularVencimentoAnterior, duracaoCicloDiasReal,
  diasRestantesCicloAtual, calcularValorProporcionalUpgrade, deveSincronizarAssinaturaAntesDeAplicar,
  pagamentoConfirmaPendencia, criarCobrancaAvulsaAsaas, atualizarValorAssinaturaAsaas,
  resolverVencimentoCicloAtual,
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
    })
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
const PLANO_STARTER = { id: 'plano-starter', ativo: true, interno: false, eh_plano_trial: false, asaas_subscription_value: 100 }
const PLANO_GROWTH = { id: 'plano-growth', ativo: true, interno: false, eh_plano_trial: false, asaas_subscription_value: 200 }

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

describe('motivoUpgradePendenteBloqueiaNovaTroca', () => {
  test('já existe plano_pendente_id => bloqueia com mensagem clara', () => {
    const motivo = motivoUpgradePendenteBloqueiaNovaTroca('algum-plano-id')
    assert.match(motivo ?? '', /já existe uma troca de plano pendente/i)
  })
  test('sem plano_pendente_id => libera', () => {
    assert.equal(motivoUpgradePendenteBloqueiaNovaTroca(null), null)
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
