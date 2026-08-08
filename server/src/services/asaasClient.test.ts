import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mapearEventoAsaas, calcularProximoVencimento, criarClienteAsaas, atualizarClienteAsaas, buscarAssinaturaAsaas, listarCobrancasAsaas } from './asaasClient'

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
      assert.match(urlChamada ?? '', /\/payments\?subscription=sub_1/)
    } finally {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    }
  })
})
