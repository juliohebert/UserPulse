import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { montarDadosResetSenhaAdministrativo } from './adminTenants'

// Correção de segurança pós-revisão: resetarSenha (SUPER_ADMIN resetando a
// senha de outro usuário) precisa SEMPRE atualizar senha_alterada_em junto
// com o hash novo — requireAdminAuth usa esse campo pra invalidar sessões
// JWT emitidas antes da troca (ver sessaoInvalidadaPorTrocaSenha em
// lib/auth.ts). Antes desta correção, um reset administrativo trocava a
// senha mas deixava sessões já abertas com a senha antiga continuarem
// válidas.
describe('montarDadosResetSenhaAdministrativo — invariante de segurança do reset administrativo', () => {
  test('sempre inclui senha_alterada_em junto com o hash novo', () => {
    const agora = new Date('2026-08-08T12:00:00Z')
    const dados = montarDadosResetSenhaAdministrativo('hash-bcrypt-simulado', agora)
    assert.equal(dados.senha_alterada_em.getTime(), agora.getTime())
  })
  test('senha_temporaria é sempre true (troca obrigatória no próximo login)', () => {
    const dados = montarDadosResetSenhaAdministrativo('hash-bcrypt-simulado', new Date())
    assert.equal(dados.senha_temporaria, true)
  })
  test('password_hash é o hash recebido, nunca a senha em texto puro', () => {
    const dados = montarDadosResetSenhaAdministrativo('hash-bcrypt-simulado', new Date())
    assert.equal(dados.password_hash, 'hash-bcrypt-simulado')
  })
  test('sem `agora` explícito, usa a hora atual (nunca fica sem valor)', () => {
    const antes = Date.now()
    const dados = montarDadosResetSenhaAdministrativo('hash')
    const depois = Date.now()
    assert.ok(dados.senha_alterada_em.getTime() >= antes && dados.senha_alterada_em.getTime() <= depois)
  })
})
