import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarPayloadConvite, alvoIgualUsuarioLogado } from './usuarios'

describe('validarPayloadConvite — validação pura do payload (sem Prisma/IO)', () => {
  test('email e role válidos passam, normalizando e-mail e role, sem permissões', () => {
    const resultado = validarPayloadConvite({ email: '  Novo@Empresa.com ', role: 'editor' })
    assert.deepEqual(resultado, { ok: true, data: { email: 'novo@empresa.com', role: 'EDITOR', permissoes: null } })
  })
  test('email ausente é rejeitado', () => {
    const resultado = validarPayloadConvite({ role: 'ADMIN' })
    assert.equal(resultado.ok, false)
  })
  test('email malformado é rejeitado', () => {
    const resultado = validarPayloadConvite({ email: 'nao-e-email', role: 'ADMIN' })
    assert.equal(resultado.ok, false)
  })
  test('role ausente é rejeitada', () => {
    const resultado = validarPayloadConvite({ email: 'gente@empresa.com' })
    assert.equal(resultado.ok, false)
  })
  test('role inválida é rejeitada', () => {
    const resultado = validarPayloadConvite({ email: 'gente@empresa.com', role: 'GERENTE' })
    assert.equal(resultado.ok, false)
  })
  // SUPER_ADMIN nunca é aceito aqui, mesmo que o valor venha certo no body —
  // mesma regra de adminTenants.ts (ROLES_ACESSO_CLIENTE), nunca elevável
  // por este fluxo self-service.
  test('role SUPER_ADMIN é rejeitada', () => {
    const resultado = validarPayloadConvite({ email: 'gente@empresa.com', role: 'SUPER_ADMIN' })
    assert.equal(resultado.ok, false)
  })
  test('ADMIN e VIEWER também são aceitas', () => {
    assert.equal(validarPayloadConvite({ email: 'a@b.com', role: 'admin' }).ok, true)
    assert.equal(validarPayloadConvite({ email: 'a@b.com', role: 'viewer' }).ok, true)
  })

  // Item 4 — permissões no convite (validarPayloadPermissoes reaproveitada,
  // nunca duplicada — ver adminTenantsPermissoes.test.ts pros casos de
  // matriz inválida em si).
  test('permissoes ausente é aceito (convite sem personalização)', () => {
    const resultado = validarPayloadConvite({ email: 'a@b.com', role: 'editor' })
    assert.equal(resultado.ok, true)
    if (resultado.ok) assert.equal(resultado.data.permissoes, null)
  })
  test('permissoes válida é aceita e normalizada junto com email/role', () => {
    const resultado = validarPayloadConvite({
      email: 'a@b.com', role: 'editor',
      permissoes: [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }],
    })
    assert.deepEqual(resultado, {
      ok: true,
      data: { email: 'a@b.com', role: 'EDITOR', permissoes: [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }] },
    })
  })
  test('permissoes malformada é rejeitada (não é array)', () => {
    const resultado = validarPayloadConvite({ email: 'a@b.com', role: 'editor', permissoes: 'nao-e-array' })
    assert.equal(resultado.ok, false)
  })
  test('permissoes com módulo inválido é rejeitada', () => {
    const resultado = validarPayloadConvite({
      email: 'a@b.com', role: 'editor',
      permissoes: [{ modulo: 'INEXISTENTE', nivel: 'GERENCIAR' }],
    })
    assert.equal(resultado.ok, false)
  })
})

describe('alvoIgualUsuarioLogado — bloqueio de auto-edição (PUT/DELETE /:id, /:id/permissoes)', () => {
  test('alvo igual ao usuário logado é bloqueado', () => {
    assert.equal(alvoIgualUsuarioLogado('user-1', 'user-1'), true)
  })
  test('alvo diferente do usuário logado não é bloqueado', () => {
    assert.equal(alvoIgualUsuarioLogado('user-1', 'user-2'), false)
  })
})
