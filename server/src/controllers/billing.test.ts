import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarECalcularUpgrade, type TenantParaUpgrade, validarECalcularPreviewDowngrade, type TenantParaDowngrade } from './billing'

// Fase 8A (correção pós-revisão) — confirma em código, não só por leitura,
// que o bloqueio de upgrade rejeita os 4 casos pedidos: SUSPENDED, CANCELED,
// tolerância de inadimplência e inadimplência (tolerância expirada). Os 4
// retornam antes de qualquer prisma.plano.findUnique (ver ordem dos
// checks em validarECalcularUpgrade) — nenhum precisa de banco de verdade,
// mesmo padrão "só função pura/sem I/O" já usado no resto do projeto
// (ver CLAUDE.md, seção Tests).

const DIA_MS = 86_400_000

function tenantBase(overrides: Partial<TenantParaUpgrade> = {}): TenantParaUpgrade {
  return {
    status: 'ACTIVE',
    trial_fim: null,
    licenca_fim: new Date(Date.now() + 20 * DIA_MS),
    asaas_subscription_id: 'sub_1',
    plano_pendente_id: null,
    plano_downgrade_id: null,
    plano: {
      id: 'plano-atual', nome: 'Starter', ativo: true, interno: false, eh_plano_trial: false,
      asaas_subscription_value: 100, asaas_billing_cycle: 'MONTHLY', nivel: 1,
    },
    ...overrides,
  }
}

describe('validarECalcularUpgrade — confirma os 4 bloqueios (Fase 8A, correção pós-revisão)', () => {
  test('SUSPENDED é rejeitado (403, mensagem de suspensão/cancelamento)', async () => {
    const resultado = await validarECalcularUpgrade(tenantBase({ status: 'SUSPENDED' }), 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /suspensa ou cancelada/i)
  })

  test('CANCELED é rejeitado (403, mensagem de suspensão/cancelamento)', async () => {
    const resultado = await validarECalcularUpgrade(tenantBase({ status: 'CANCELED' }), 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /suspensa ou cancelada/i)
  })

  test('tolerância de inadimplência (licenca_fim vencida há 1 dia, dentro dos 5 dias) é rejeitada (403)', async () => {
    const tenant = tenantBase({ licenca_fim: new Date(Date.now() - 1 * DIA_MS) })
    const resultado = await validarECalcularUpgrade(tenant, 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /regularize/i)
  })

  test('inadimplência além da tolerância (licenca_fim vencida há 10 dias) é rejeitada (403)', async () => {
    const tenant = tenantBase({ licenca_fim: new Date(Date.now() - 10 * DIA_MS) })
    const resultado = await validarECalcularUpgrade(tenant, 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /regularize/i)
  })

  // Sem asaas_subscription_id retorna ANTES do check de adimplência ter
  // qualquer chance de confundir TRIAL com inadimplência paga (o motivo é
  // outro: "ainda não tem assinatura ativa") — nunca chega a tocar Prisma
  // (mesmo padrão dos testes acima, ver comentário no topo do arquivo).
  test('TRIAL nunca é confundido com inadimplência paga — bloqueado por outro motivo (sem assinatura), não por "regularize"', async () => {
    const tenant = tenantBase({ status: 'TRIAL', licenca_fim: null, asaas_subscription_id: null })
    const resultado = await validarECalcularUpgrade(tenant, 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.doesNotMatch(resultado.erro, /regularize/i)
  })

  // ACTIVE em dia, sem pendência: passa os 4 bloqueios e chega até
  // prisma.plano.findUnique — não testado aqui a partir daí (exigiria
  // banco de verdade, fora da convenção deste projeto pra testes
  // automatizados, ver CLAUDE.md "Tests"); o resto do cálculo
  // (duracaoCicloDiasReal, calcularValorProporcionalUpgrade,
  // validarUpgradePlano, resolverVencimentoCicloAtual — inclusive o caso do
  // bug de licenca_fim ausente, correção pós-revisão 2) já está coberto em
  // asaasClient.test.ts.
})

// Correção pós-revisão 3 — Tenant.licenca_fim pode dizer "em dia" (nenhum
// PAYMENT_CONFIRMED ainda o atrasou) enquanto a assinatura recorrente já
// tem cobrança OVERDUE de verdade no Asaas. Cross-check com
// buscarEntradaSituacaoAsaas/calcularSituacaoAsaas (mesma fonte de GET
// /billing/situacao) — precisa mockar fetch porque, diferente dos testes
// acima, esse trecho só é alcançado depois do check local de licenca_fim
// passar (mesmo padrão de mock de globalThis.fetch já usado em
// asaasClient.test.ts, com save/restore de env e fetch original).
describe('validarECalcularUpgrade — cross-check financeiro real no Asaas (correção pós-revisão 3)', () => {
  function mockAsaasFetch(cobrancas: Array<{ status: string }>, opts: { hasMore?: boolean; falhar?: boolean } = {}) {
    return (async (url: unknown) => {
      const urlStr = String(url)
      if (opts.falhar) return { ok: false, status: 500, text: async () => JSON.stringify({ errors: [{ description: 'Erro interno' }] }) } as Response
      if (urlStr.includes('/payments')) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            object: 'list', hasMore: opts.hasMore ?? false, totalCount: cobrancas.length,
            data: cobrancas.map((c, i) => ({ id: `pay_${i}`, status: c.status, value: 100, customer: 'cus_1', subscription: 'sub_1', dueDate: '2026-08-07' })),
          }),
        } as Response
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-07', value: 100, cycle: 'MONTHLY' }),
      } as Response
    }) as typeof fetch
  }

  function comAmbienteAsaas(fetchMock: typeof fetch, run: () => Promise<void>) {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'
    globalThis.fetch = fetchMock
    return run().finally(() => {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    })
  }

  test('local em_dia + Asaas sem cobrança vencida: passa pro próximo check (plano_id ausente), não pro de "regularize"', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'CONFIRMED' }]), async () => {
      const resultado = await validarECalcularUpgrade(tenantBase(), '')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 400)
      assert.match(resultado.erro, /plano_id/i)
    })
  })

  test('local em_dia + Asaas com cobrança OVERDUE na assinatura: bloqueia com 403 "regularize"', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'OVERDUE' }]), async () => {
      const resultado = await validarECalcularUpgrade(tenantBase(), 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 403)
      assert.match(resultado.erro, /regularize/i)
    })
  })

  test('local em tolerância: bloqueia sem sequer chamar o Asaas (short-circuit antes do cross-check)', async () => {
    let fetchChamado = false
    const fetchQueNuncaDeveriaRodar = (async () => { fetchChamado = true; throw new Error('não deveria chamar o Asaas') }) as typeof fetch
    await comAmbienteAsaas(fetchQueNuncaDeveriaRodar, async () => {
      const tenant = tenantBase({ licenca_fim: new Date(Date.now() - 1 * DIA_MS) })
      const resultado = await validarECalcularUpgrade(tenant, 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 403)
      assert.match(resultado.erro, /regularize/i)
    })
    assert.equal(fetchChamado, false)
  })

  test('Asaas indisponível: falha segura (503, não cria upgrade), nunca assume "em dia"', async () => {
    await comAmbienteAsaas(mockAsaasFetch([], { falhar: true }), async () => {
      const resultado = await validarECalcularUpgrade(tenantBase(), 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 503)
      assert.match(resultado.erro, /não foi possível confirmar/i)
    })
  })

  // Correção pós-revisão (auditoria 8B, bloqueador) — confirma a fiação de
  // motivoDowngradeEmAndamentoBloqueiaUpgrade dentro da orquestração real
  // (não só a função pura isolada, ver asaasClient.test.ts): tenant em dia,
  // Asaas sem cobrança vencida, MAS com plano_downgrade_id preenchido —
  // upgrade tem que ser recusado mesmo assim.
  test('downgrade em andamento (plano_downgrade_id preenchido) bloqueia upgrade com 409, mesmo tenant em dia', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'CONFIRMED' }]), async () => {
      const tenant = tenantBase({ plano_downgrade_id: 'plano-starter' })
      const resultado = await validarECalcularUpgrade(tenant, 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 409)
      assert.match(resultado.erro, /downgrade em andamento/i)
    })
  })
})

// GET /billing/upgrade/preview e POST /billing/upgrade chamam exatamente
// validarECalcularUpgrade (única definição, ver import no topo deste
// arquivo) — não há uma segunda cópia da regra pro POST, então os 403/503
// acima valem idênticos pros dois endpoints por construção, não só por
// convenção. Confirmado por leitura de controllers/billing.ts (previewUpgrade
// e o handler de POST chamam o mesmo `await validarECalcularUpgrade(tenant, ...)`).

// ─── Fase 8B — validarECalcularPreviewDowngrade ─────────────────────────────
// Mesmo limite de escopo do bloco de upgrade acima: só os checks que
// retornam ANTES de tocar Prisma (prisma.plano.findUnique, depois disso
// contarUsoRecursosAtivos) são testados aqui sem banco de verdade. "mesmo
// plano / destino superior / trial inválido / destino inferior válido" (a
// regra em si, motivoDowngradePlano) já estão cobertos em
// asaasClient.test.ts — não duplicados aqui.

function tenantBaseDowngrade(overrides: Partial<TenantParaDowngrade> = {}): TenantParaDowngrade {
  return {
    id: 'tenant-1',
    status: 'ACTIVE',
    trial_fim: null,
    licenca_fim: new Date(Date.now() + 20 * DIA_MS),
    asaas_subscription_id: 'sub_1',
    plano_pendente_id: null,
    plano_downgrade_id: null,
    downgrade_efetivar_em: null,
    downgrade_valor_origem: null,
    downgrade_valor_destino: null,
    valor_assinatura_atual: null,
    plano: {
      id: 'plano-atual', nome: 'Growth', ativo: true, interno: false, eh_plano_trial: false,
      asaas_subscription_value: 200, asaas_billing_cycle: 'MONTHLY', nivel: 2,
    },
    ...overrides,
  }
}

describe('validarECalcularPreviewDowngrade — bloqueios locais (sem tocar Prisma)', () => {
  test('SUSPENDED é rejeitado (403, mensagem de suspensão/cancelamento)', async () => {
    const resultado = await validarECalcularPreviewDowngrade(tenantBaseDowngrade({ status: 'SUSPENDED' }), 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /suspensa ou cancelada/i)
  })

  test('CANCELED é rejeitado (403, mensagem de suspensão/cancelamento)', async () => {
    const resultado = await validarECalcularPreviewDowngrade(tenantBaseDowngrade({ status: 'CANCELED' }), 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /suspensa ou cancelada/i)
  })

  test('tolerância de inadimplência (licenca_fim vencida há 1 dia) é rejeitada (403, "regularize... downgrade")', async () => {
    const tenant = tenantBaseDowngrade({ licenca_fim: new Date(Date.now() - 1 * DIA_MS) })
    const resultado = await validarECalcularPreviewDowngrade(tenant, 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /regularize/i)
    assert.match(resultado.erro, /downgrade/i)
  })

  test('inadimplência além da tolerância (licenca_fim vencida há 10 dias) é rejeitada (403)', async () => {
    const tenant = tenantBaseDowngrade({ licenca_fim: new Date(Date.now() - 10 * DIA_MS) })
    const resultado = await validarECalcularPreviewDowngrade(tenant, 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 403)
    assert.match(resultado.erro, /regularize/i)
  })

  test('sem assinatura Asaas vinculada é rejeitado (400), nunca confundido com "regularize"', async () => {
    const tenant = tenantBaseDowngrade({ status: 'TRIAL', licenca_fim: null, asaas_subscription_id: null })
    const resultado = await validarECalcularPreviewDowngrade(tenant, 'plano-novo')
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.status, 400)
    assert.doesNotMatch(resultado.erro, /regularize/i)
  })
})

// Cross-check ao vivo no Asaas (mesmo padrão de mock de globalThis.fetch já
// usado no bloco de upgrade acima) — necessário porque, além do
// cross-check em si, é dali que valorAtualContratado (entrada.assinatura.
// value) e as cobranças usadas por motivoUpgradePendenteBloqueiaNovaTroca/
// motivoDowngradeJaAgendadoBloqueiaNovo (concorrência) vêm.
describe('validarECalcularPreviewDowngrade — cross-check financeiro real no Asaas e concorrência', () => {
  function mockAsaasFetch(
    cobrancas: Array<{ status: string }>,
    opts: { hasMore?: boolean; falhar?: boolean; valorAssinatura?: number } = {}
  ) {
    return (async (url: unknown) => {
      const urlStr = String(url)
      if (opts.falhar) return { ok: false, status: 500, text: async () => JSON.stringify({ errors: [{ description: 'Erro interno' }] }) } as Response
      if (urlStr.includes('/payments')) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            object: 'list', hasMore: opts.hasMore ?? false, totalCount: cobrancas.length,
            data: cobrancas.map((c, i) => ({ id: `pay_${i}`, status: c.status, value: 200, customer: 'cus_1', subscription: 'sub_1', dueDate: '2026-08-07' })),
          }),
        } as Response
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-07', value: opts.valorAssinatura ?? 200, cycle: 'MONTHLY' }),
      } as Response
    }) as typeof fetch
  }

  function comAmbienteAsaas(fetchMock: typeof fetch, run: () => Promise<void>) {
    const apiKeyOriginal = process.env.ASAAS_API_KEY
    const envOriginal = process.env.ASAAS_ENV
    const fetchOriginal = globalThis.fetch
    process.env.ASAAS_API_KEY = 'chave-sandbox-teste'
    process.env.ASAAS_ENV = 'sandbox'
    globalThis.fetch = fetchMock
    return run().finally(() => {
      globalThis.fetch = fetchOriginal
      if (apiKeyOriginal === undefined) delete process.env.ASAAS_API_KEY
      else process.env.ASAAS_API_KEY = apiKeyOriginal
      if (envOriginal === undefined) delete process.env.ASAAS_ENV
      else process.env.ASAAS_ENV = envOriginal
    })
  }

  test('local em_dia + Asaas sem cobrança vencida: passa pro próximo check (plano_id ausente), não pro de "regularize"', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'CONFIRMED' }]), async () => {
      const resultado = await validarECalcularPreviewDowngrade(tenantBaseDowngrade(), '')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 400)
      assert.match(resultado.erro, /plano_id/i)
    })
  })

  test('local em_dia + Asaas com cobrança OVERDUE na assinatura: bloqueia com 403 "regularize"', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'OVERDUE' }]), async () => {
      const resultado = await validarECalcularPreviewDowngrade(tenantBaseDowngrade(), 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 403)
      assert.match(resultado.erro, /regularize/i)
    })
  })

  test('local em tolerância: bloqueia sem sequer chamar o Asaas (short-circuit antes do cross-check)', async () => {
    let fetchChamado = false
    const fetchQueNuncaDeveriaRodar = (async () => { fetchChamado = true; throw new Error('não deveria chamar o Asaas') }) as typeof fetch
    await comAmbienteAsaas(fetchQueNuncaDeveriaRodar, async () => {
      const tenant = tenantBaseDowngrade({ licenca_fim: new Date(Date.now() - 1 * DIA_MS) })
      const resultado = await validarECalcularPreviewDowngrade(tenant, 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 403)
      assert.match(resultado.erro, /regularize/i)
    })
    assert.equal(fetchChamado, false)
  })

  test('Asaas indisponível: falha segura (503, não segue com o downgrade), nunca assume "em dia"', async () => {
    await comAmbienteAsaas(mockAsaasFetch([], { falhar: true }), async () => {
      const resultado = await validarECalcularPreviewDowngrade(tenantBaseDowngrade(), 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 503)
      assert.match(resultado.erro, /não foi possível confirmar/i)
    })
  })

  test('upgrade pendente bloqueia novo downgrade (409), verificado ANTES de downgrade já agendado', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'CONFIRMED' }]), async () => {
      const tenant = tenantBaseDowngrade({ plano_pendente_id: 'plano-upgrade-pendente' })
      const resultado = await validarECalcularPreviewDowngrade(tenant, 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 409)
    })
  })

  test('downgrade já agendado bloqueia um novo (409)', async () => {
    await comAmbienteAsaas(mockAsaasFetch([{ status: 'CONFIRMED' }]), async () => {
      const tenant = tenantBaseDowngrade({ plano_downgrade_id: 'plano-downgrade-ja-agendado' })
      const resultado = await validarECalcularPreviewDowngrade(tenant, 'plano-novo')
      assert.equal(resultado.ok, false)
      if (resultado.ok) return
      assert.equal(resultado.status, 409)
    })
  })
})

// GET /billing/downgrade/preview chama exatamente validarECalcularPreviewDowngrade
// (única definição, ver import no topo deste arquivo e controllers/billing.ts)
// — os 403/409/503 acima valem pro endpoint por construção. O restante do
// cálculo a partir de prisma.plano.findUnique (motivoDowngradePlano,
// contarUsoRecursosAtivos/avaliarEncaixeLimitesDowngrade,
// motivoCobrancaAnteriorBloqueiaDowngrade/identificarCobrancaProximoCiclo)
// exigiria banco de verdade pra exercitar via esta função de orquestração —
// já coberto, como função pura isolada, em asaasClient.test.ts e
// tenantGuards.test.ts (mesmo limite documentado no bloco de upgrade acima).
