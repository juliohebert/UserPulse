import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tenantPublicoPermiteAcesso } from './tenantGuards'

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

  test('EXPIRED ainda permite o widget público — só bloqueia criação/ativação no admin (ver motivoBloqueioAtivacao)', () => {
    assert.equal(tenantPublicoPermiteAcesso({ status: 'EXPIRED' }), true)
  })
})
