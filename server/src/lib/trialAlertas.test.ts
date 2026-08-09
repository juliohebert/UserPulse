import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { decidirMarcoAlertaTrial, deveEnviarAlerta, filtroDestinatariosTrialAtivos, TRAVA_ENVIANDO_STALE_MS } from './trialAlertas'

const AGORA = new Date('2026-08-09T12:00:00Z')

// Fase 6D — decidirMarcoAlertaTrial: qual marco (D7/D3/D1/VENCIDO) dispara
// agora, a partir de situacao_comercial + dias restantes já calculados
// (nunca recalculado aqui, mesma fonte de obterSituacaoComercialTenant/
// diasRestantesTrial em tenantGuards.ts).
describe('decidirMarcoAlertaTrial — trial_ativo dispara D7/D3/D1 exatamente nos dias certos', () => {
  test('7 dias restantes => D7', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_ativo', 7), 'D7')
  })
  test('3 dias restantes => D3', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_ativo', 3), 'D3')
  })
  test('1 dia restante => D1', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_ativo', 1), 'D1')
  })
  test('0 dias restantes com situacao ainda trial_ativo (borda de diasRestantesTrial) => nenhum marco (0 não é D7/D3/D1)', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_ativo', 0), null)
  })
  for (const dias of [14, 6, 5, 4, 2, 30]) {
    test(`${dias} dias restantes => nenhum marco (outros dias não disparam)`, () => {
      assert.equal(decidirMarcoAlertaTrial('trial_ativo', dias), null)
    })
  }
  test('trial_ativo sem dias calculados (trial_fim null) => nenhum marco', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_ativo', null), null)
  })
})

describe('decidirMarcoAlertaTrial — trial_vencido dispara VENCIDO sempre, independente de `dias`', () => {
  test('trial_vencido => VENCIDO', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_vencido', 0), 'VENCIDO')
  })
  test('trial_vencido mesmo com dias null (não deveria acontecer na prática, mas a decisão não depende disso) => VENCIDO', () => {
    assert.equal(decidirMarcoAlertaTrial('trial_vencido', null), 'VENCIDO')
  })
})

// "Pago não recebe" e "SUSPENDED/CANCELED não recebem" — nenhuma dessas 4
// situações nunca gera marco, nenhum valor de `dias` muda isso.
describe('decidirMarcoAlertaTrial — nunca dispara fora de trial (pago, suspenso, cancelado)', () => {
  for (const situacao of ['licenca_ativa', 'licenca_vencida', 'suspenso', 'cancelado'] as const) {
    for (const dias of [7, 3, 1, 0, null]) {
      test(`${situacao} com dias=${dias} => nenhum marco`, () => {
        assert.equal(decidirMarcoAlertaTrial(situacao, dias), null)
      })
    }
  }
})

// Idempotência/retry — decisão pura por trás do scheduler (ver
// services/trialAlertasScheduler.ts, processarDestinatario/
// reivindicarRegistro).
describe('deveEnviarAlerta — idempotência (nunca duplica) e retry (falha permite nova tentativa)', () => {
  test('sem registro ainda (primeira vez) => envia', () => {
    assert.equal(deveEnviarAlerta(null), true)
  })
  test('registro com status ENVIADO => não envia de novo (nunca duplica)', () => {
    assert.equal(deveEnviarAlerta({ status: 'ENVIADO' }), false)
  })
  test('registro com status FALHOU => envia de novo (retry liberado)', () => {
    assert.equal(deveEnviarAlerta({ status: 'FALHOU' }), true)
  })
})

// Correção pós-revisão: a unique constraint sozinha só protegia a CRIAÇÃO
// (create() concorrente), nunca o retry de um registro FALHOU já existente
// — 2 instâncias podiam ler o mesmo FALHOU e as duas reenviarem. ENVIANDO é
// a trava atômica (ver reivindicarRegistro no scheduler); estes testes
// cobrem a decisão pura de quando ela ainda vale (não reivindicável) ou já
// está velha o bastante pra liberar retry (provável crash no meio do envio).
describe('deveEnviarAlerta — ENVIANDO é uma trava: só libera retry se estiver velha (stale)', () => {
  test('ENVIANDO reivindicado agora mesmo (atualizado_em === agora) => NÃO reenvia (outra instância pode estar processando)', () => {
    assert.equal(deveEnviarAlerta({ status: 'ENVIANDO', atualizado_em: AGORA }, AGORA), false)
  })
  test('ENVIANDO reivindicado há 1 minuto => ainda NÃO reenvia (dentro da janela normal de um envio)', () => {
    const reivindicadoEm = new Date(AGORA.getTime() - 60_000)
    assert.equal(deveEnviarAlerta({ status: 'ENVIANDO', atualizado_em: reivindicadoEm }, AGORA), false)
  })
  test('ENVIANDO reivindicado exatamente no limite da trava (TRAVA_ENVIANDO_STALE_MS) => ainda NÃO reenvia (borda não é "maior que")', () => {
    const reivindicadoEm = new Date(AGORA.getTime() - TRAVA_ENVIANDO_STALE_MS)
    assert.equal(deveEnviarAlerta({ status: 'ENVIANDO', atualizado_em: reivindicadoEm }, AGORA), false)
  })
  test('ENVIANDO reivindicado 1ms além da trava => libera retry (provável crash no meio do envio anterior)', () => {
    const reivindicadoEm = new Date(AGORA.getTime() - TRAVA_ENVIANDO_STALE_MS - 1)
    assert.equal(deveEnviarAlerta({ status: 'ENVIANDO', atualizado_em: reivindicadoEm }, AGORA), true)
  })
  test('ENVIANDO sem atualizado_em (nunca deveria acontecer vindo do banco, mas por segurança) => trata como muito velho, libera retry', () => {
    assert.equal(deveEnviarAlerta({ status: 'ENVIANDO' }, AGORA), true)
  })
})

// Isolamento por tenant/destinatário — o filtro sempre parte de tenant_id
// (nunca uma query "solta"), e sempre restringe a ADMIN ativo (nunca
// EDITOR/VIEWER/SUPER_ADMIN).
describe('filtroDestinatariosTrialAtivos — só ADMIN ativo do próprio tenant', () => {
  test('inclui tenant_id, role ADMIN e ativo:true', () => {
    assert.deepEqual(filtroDestinatariosTrialAtivos('tenant-a'), {
      tenant_id: 'tenant-a',
      role: 'ADMIN',
      ativo: true,
    })
  })
  test('tenants diferentes geram filtros com tenant_id diferentes (isolamento)', () => {
    const filtroA = filtroDestinatariosTrialAtivos('tenant-a')
    const filtroB = filtroDestinatariosTrialAtivos('tenant-b')
    assert.notEqual(filtroA.tenant_id, filtroB.tenant_id)
  })
  test('nunca inclui EDITOR/VIEWER/SUPER_ADMIN no filtro de papel', () => {
    const filtro = filtroDestinatariosTrialAtivos('tenant-a')
    assert.equal(filtro.role, 'ADMIN')
  })
})
