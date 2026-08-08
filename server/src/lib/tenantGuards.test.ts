import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tenantPublicoPermiteAcesso, obterSituacaoComercialTenant, motivoBloqueioEscrita } from './tenantGuards'

const AGORA = new Date('2026-07-10T12:00:00Z')
const DIA_MS = 86_400_000
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA_MS)
const passado = (dias: number) => new Date(AGORA.getTime() - dias * DIA_MS)

// Fase 2 do widget multi-tenant — decisão pura de acesso público (sem banco),
// usada por resolverTenantPublico em cima de um tenant já buscado por
// public_key ou pelo fallback do tenant Quark. Ver widget.ts.
describe('tenantPublicoPermiteAcesso — decisão de acesso público (sem banco)', () => {
  test('tenant nulo (public_key/slug não encontrado) nunca tem acesso', () => {
    assert.equal(tenantPublicoPermiteAcesso(null), false)
  })

  test('SUSPENDED bloqueia o widget público', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'SUSPENDED' }), false)
  })

  test('CANCELED bloqueia o widget público', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'CANCELED' }), false)
  })

  test('ACTIVE permite acesso', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'ACTIVE' }), true)
  })

  test('TRIAL permite acesso', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'TRIAL' }), true)
  })

  test('EXPIRED ainda permite o widget público — só bloqueia escrita no admin (ver motivoBloqueioEscrita)', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'EXPIRED' }), true)
  })
})

// obterSituacaoComercialTenant — decisão pura (sem banco) que agora
// considera trial_fim/licenca_fim além de status, usada tanto pra bloquear
// escrita (motivoBloqueioEscrita) quanto pro banner do painel (ver
// tenantPublico() em controllers/auth.ts). `agora` fixo (AGORA acima) pra
// testar as bordas de vencimento sem depender do relógio real.
describe('obterSituacaoComercialTenant — TRIAL', () => {
  test('sem trial_fim => trial_ativo (sem prazo definido, nunca vence sozinho)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: null, licenca_fim: null }, AGORA), 'trial_ativo')
  })
  test('trial_fim no futuro => trial_ativo', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: futuro(5), licenca_fim: null }, AGORA), 'trial_ativo')
  })
  test('trial_fim no passado => trial_vencido', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA), 'trial_vencido')
  })
  test('trial_fim exatamente agora ainda não venceu (< estrito, não <=)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: AGORA, licenca_fim: null }, AGORA), 'trial_ativo')
  })
  test('trial_fim 1ms no passado já venceu', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'TRIAL', trial_fim: new Date(AGORA.getTime() - 1), licenca_fim: null }, AGORA), 'trial_vencido')
  })
})

describe('obterSituacaoComercialTenant — ACTIVE', () => {
  test('sem licenca_fim => licenca_ativa (sem prazo definido, nunca vence sozinha)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: null }, AGORA), 'licenca_ativa')
  })
  test('licenca_fim no futuro => licenca_ativa', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), 'licenca_ativa')
  })
  test('licenca_fim no passado => licenca_vencida', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA), 'licenca_vencida')
  })
})

describe('obterSituacaoComercialTenant — EXPIRED, SUSPENDED, CANCELED', () => {
  test('EXPIRED sem licenca_fim => trial_vencido (nunca teve licença paga)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'EXPIRED', trial_fim: passado(20), licenca_fim: null }, AGORA), 'trial_vencido')
  })
  test('EXPIRED com licenca_fim => licenca_vencida (já teve licença paga)', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'EXPIRED', trial_fim: passado(60), licenca_fim: passado(5) }, AGORA), 'licenca_vencida')
  })
  test('SUSPENDED => suspenso, independente de qualquer data', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'SUSPENDED', trial_fim: futuro(10), licenca_fim: futuro(10) }, AGORA), 'suspenso')
  })
  test('CANCELED => cancelado, independente de qualquer data', () => {
    assert.equal(obterSituacaoComercialTenant({ status: 'CANCELED', trial_fim: futuro(10), licenca_fim: futuro(10) }, AGORA), 'cancelado')
  })
})

// motivoBloqueioEscrita — mesma matriz acima, agora conferindo o efeito
// prático (bloqueia ou não escrita) e a mensagem devolvida ao controller.
describe('motivoBloqueioEscrita — bloqueia todo mundo "vencido", libera o resto', () => {
  test('TRIAL ativo (trial_fim futuro) não bloqueia', () => {
    assert.equal(motivoBloqueioEscrita({ status: 'TRIAL', trial_fim: futuro(5), licenca_fim: null }, AGORA), null)
  })
  test('TRIAL vencido bloqueia com mensagem de teste grátis', () => {
    const motivo = motivoBloqueioEscrita({ status: 'TRIAL', trial_fim: passado(1), licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /teste grátis vencido/i)
  })
  test('ACTIVE com licença em dia não bloqueia', () => {
    assert.equal(motivoBloqueioEscrita({ status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) }, AGORA), null)
  })
  test('ACTIVE com licença vencida bloqueia com mensagem de licença', () => {
    const motivo = motivoBloqueioEscrita({ status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) }, AGORA)
    assert.match(motivo ?? '', /licença vencida/i)
  })
  test('EXPIRED bloqueia (mesmo sem SUSPENDED/CANCELED)', () => {
    assert.notEqual(motivoBloqueioEscrita({ status: 'EXPIRED', trial_fim: passado(20), licenca_fim: null }, AGORA), null)
  })
  test('SUSPENDED bloqueia com mensagem de suspensão', () => {
    const motivo = motivoBloqueioEscrita({ status: 'SUSPENDED', trial_fim: null, licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /suspensa/i)
  })
  test('CANCELED bloqueia com mensagem de cancelamento', () => {
    const motivo = motivoBloqueioEscrita({ status: 'CANCELED', trial_fim: null, licenca_fim: null }, AGORA)
    assert.match(motivo ?? '', /cancelada/i)
  })
})
