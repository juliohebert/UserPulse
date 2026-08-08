import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mapearEventoAsaas, calcularProximoVencimento, calcularAtualizacaoTenant, calcularSituacaoAsaas, criarClienteAsaas, atualizarClienteAsaas, buscarAssinaturaAsaas, listarCobrancasAsaas } from './asaasClient'
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
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && 'asaas_status' in resultado.dados, false)
  })

  test('PAYMENT_OVERDUE não escreve mais asaas_status nem mexe em status/licença', () => {
    const acao = {
      tipo: 'pagamento_vencido' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'OVERDUE',
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, { asaas_ultima_sincronizacao: agora })
  })

  test('SUBSCRIPTION_DELETED/INACTIVATED grava asaas_status="INACTIVE" (nunca o nome bruto do evento)', () => {
    const acao = { tipo: 'assinatura_cancelada' as const, subscriptionId: 'sub_1', customerId: 'cus_1', asaasStatus: 'SUBSCRIPTION_DELETED' }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, { asaas_status: 'INACTIVE', asaas_ultima_sincronizacao: agora, status: 'SUSPENDED' })
  })

  test('pagamento confirmado NÃO reativa tenant cuja assinatura já é INACTIVE (webhook fora de ordem)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'INACTIVE', licenca_inicio: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /assinatura já registrada como inativa/)
  })

  test('pagamento confirmado NÃO reativa tenant cuja assinatura já é EXPIRED', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'EXPIRED', licenca_inicio: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
  })

  test('fluxo normal: pagamento confirmado com assinatura ativa continua ativando/estendendo a licença', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'),
      dataVencimento: new Date('2026-08-08T00:00:00Z'),
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: null }, 'MONTHLY', agora)
    assert.deepEqual(resultado.dados, {
      asaas_ultima_sincronizacao: agora,
      status: 'ACTIVE',
      ultimo_pagamento_em: acao.dataPagamento,
      licenca_inicio: acao.dataPagamento,
      licenca_fim: new Date('2026-09-08T00:00:00Z'),
      proxima_cobranca: new Date('2026-09-08T00:00:00Z'),
    })
  })

  test('licenca_inicio já preenchido não é sobrescrito por um novo pagamento confirmado', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const licencaInicioOriginal = new Date('2026-01-01T00:00:00Z')
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'ACTIVE', licenca_inicio: licencaInicioOriginal }, 'MONTHLY', agora)
    assert.equal(resultado.dados !== null && resultado.dados.licenca_inicio, licencaInicioOriginal)
  })

  test('pagamento confirmado sem NENHUM asaas_status conhecido (null) não ativa por suposição', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: null, licenca_inicio: null }, null, agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /não é um status de assinatura confiável/)
  })

  test('pagamento confirmado NÃO reativa quando asaas_status é legado de evento cru (SUBSCRIPTION_DELETED, versão anterior desta correção)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'SUBSCRIPTION_DELETED', licenca_inicio: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
    assert.match(resultado.ignorado ?? '', /assinatura já registrada como inativa/)
  })

  test('pagamento confirmado NÃO reativa quando asaas_status é legado de evento cru (SUBSCRIPTION_INACTIVATED)', () => {
    const acao = {
      tipo: 'pagamento_confirmado' as const,
      paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
      dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
    }
    const resultado = calcularAtualizacaoTenant(acao, { asaas_status: 'SUBSCRIPTION_INACTIVATED', licenca_inicio: null }, 'MONTHLY', agora)
    assert.equal(resultado.dados, null)
  })

  for (const statusPagamentoContaminado of ['CONFIRMED', 'RECEIVED', 'OVERDUE', 'PENDING']) {
    test(`pagamento confirmado NÃO reativa quando asaas_status ficou contaminado com status de PAGAMENTO ("${statusPagamentoContaminado}", legado do bug corrigido)`, () => {
      const acao = {
        tipo: 'pagamento_confirmado' as const,
        paymentId: 'pay_1', customerId: 'cus_1', subscriptionId: 'sub_1', asaasStatus: 'CONFIRMED',
        dataPagamento: new Date('2026-08-08T00:00:00Z'), dataVencimento: null,
      }
      const resultado = calcularAtualizacaoTenant(acao, { asaas_status: statusPagamentoContaminado, licenca_inicio: null }, 'MONTHLY', agora)
      assert.equal(resultado.dados, null)
      assert.match(resultado.ignorado ?? '', /não é um status de assinatura confiável/)
    })
  }
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
