import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarECalcularUpgrade, type TenantParaUpgrade } from './billing'

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
    plano: {
      id: 'plano-atual', nome: 'Starter', ativo: true, interno: false, eh_plano_trial: false,
      asaas_subscription_value: 100, asaas_billing_cycle: 'MONTHLY',
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
  // validarUpgradePlano) já está coberto em asaasClient.test.ts.
})
