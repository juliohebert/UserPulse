import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarPayloadConvite, validarPayloadCriacaoDireta, alvoIgualUsuarioLogado } from './usuarios'

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

describe('validarPayloadCriacaoDireta — validação pura do payload (sem Prisma/IO)', () => {
  const SENHA_FORTE = 'Senha123!'

  test('payload válido passa, normalizando nome/e-mail/role, sem permissões', () => {
    const resultado = validarPayloadCriacaoDireta({
      nome: '  Fulano  ', email: '  Novo@Empresa.com ', role: 'editor', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE,
    })
    assert.deepEqual(resultado, {
      ok: true,
      data: { nome: 'Fulano', email: 'novo@empresa.com', role: 'EDITOR', senha: SENHA_FORTE, permissoes: null },
    })
  })
  test('nome ausente é rejeitado', () => {
    const resultado = validarPayloadCriacaoDireta({ email: 'a@b.com', role: 'EDITOR', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE })
    assert.equal(resultado.ok, false)
  })
  test('email malformado é rejeitado', () => {
    const resultado = validarPayloadCriacaoDireta({ nome: 'Fulano', email: 'nao-e-email', role: 'EDITOR', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE })
    assert.equal(resultado.ok, false)
  })
  test('role inválida é rejeitada', () => {
    const resultado = validarPayloadCriacaoDireta({ nome: 'Fulano', email: 'a@b.com', role: 'GERENTE', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE })
    assert.equal(resultado.ok, false)
  })
  // SUPER_ADMIN nunca é aceito aqui, mesma regra de validarPayloadConvite —
  // nunca elevável por este fluxo self-service.
  test('role SUPER_ADMIN é rejeitada', () => {
    const resultado = validarPayloadCriacaoDireta({ nome: 'Fulano', email: 'a@b.com', role: 'SUPER_ADMIN', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE })
    assert.equal(resultado.ok, false)
  })
  test('senha ou confirmar_senha ausente é rejeitado', () => {
    assert.equal(validarPayloadCriacaoDireta({ nome: 'Fulano', email: 'a@b.com', role: 'EDITOR', senha: SENHA_FORTE }).ok, false)
    assert.equal(validarPayloadCriacaoDireta({ nome: 'Fulano', email: 'a@b.com', role: 'EDITOR', confirmar_senha: SENHA_FORTE }).ok, false)
  })
  test('senha e confirmar_senha diferentes são rejeitadas', () => {
    const resultado = validarPayloadCriacaoDireta({
      nome: 'Fulano', email: 'a@b.com', role: 'EDITOR', senha: SENHA_FORTE, confirmar_senha: 'Outra123!',
    })
    assert.equal(resultado.ok, false)
  })
  test('senha fraca é rejeitada (mesma política de motivoSenhaFraca)', () => {
    const resultado = validarPayloadCriacaoDireta({
      nome: 'Fulano', email: 'a@b.com', role: 'EDITOR', senha: '12345678', confirmar_senha: '12345678',
    })
    assert.equal(resultado.ok, false)
  })
  test('permissoes válida é aceita e normalizada junto com o resto', () => {
    const resultado = validarPayloadCriacaoDireta({
      nome: 'Fulano', email: 'a@b.com', role: 'editor', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE,
      permissoes: [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }],
    })
    assert.deepEqual(resultado, {
      ok: true,
      data: { nome: 'Fulano', email: 'a@b.com', role: 'EDITOR', senha: SENHA_FORTE, permissoes: [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }] },
    })
  })
  test('permissoes malformada é rejeitada (não é array)', () => {
    const resultado = validarPayloadCriacaoDireta({
      nome: 'Fulano', email: 'a@b.com', role: 'editor', senha: SENHA_FORTE, confirmar_senha: SENHA_FORTE, permissoes: 'nao-e-array',
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
