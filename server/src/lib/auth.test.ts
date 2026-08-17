import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { sessaoInvalidadaPorTrocaSenha } from './auth'

// "Esqueci minha senha"/troca de senha — sessaoInvalidadaPorTrocaSenha é a
// decisão pura por trás da invalidação de sessões antigas em
// requireAdminAuth.ts (sem tabela de sessão própria, só compara o `iat` do
// JWT contra AdminUser.senha_alterada_em).
describe('sessaoInvalidadaPorTrocaSenha', () => {
  const SEGUNDOS = 1_756_296_000 // instante fixo qualquer, só de referência
  const dataDoIat = new Date(SEGUNDOS * 1000)

  test('sem senha_alterada_em (usuário nunca trocou a própria senha) nunca invalida', () => {
    assert.equal(sessaoInvalidadaPorTrocaSenha(SEGUNDOS, null), false)
  })
  test('sem iat (token sem essa claim, nunca deveria acontecer) nunca invalida', () => {
    assert.equal(sessaoInvalidadaPorTrocaSenha(undefined, dataDoIat), false)
  })
  test('senha alterada bem depois da emissão do token invalida a sessão', () => {
    const senhaAlteradaEm = new Date(dataDoIat.getTime() + 60_000) // 1 min depois
    assert.equal(sessaoInvalidadaPorTrocaSenha(SEGUNDOS, senhaAlteradaEm), true)
  })
  test('senha alterada bem antes da emissão do token não invalida (token já é posterior à troca)', () => {
    const senhaAlteradaEm = new Date(dataDoIat.getTime() - 60_000) // 1 min antes
    assert.equal(sessaoInvalidadaPorTrocaSenha(SEGUNDOS, senhaAlteradaEm), false)
  })
  test('dentro da margem de 1s (arredondamento de iat) não invalida — token recém-emitido pela própria troca', () => {
    const senhaAlteradaEm = new Date(dataDoIat.getTime() + 999) // 999ms depois, dentro da margem
    assert.equal(sessaoInvalidadaPorTrocaSenha(SEGUNDOS, senhaAlteradaEm), false)
  })
  test('logo APÓS a margem de 1s já invalida', () => {
    const senhaAlteradaEm = new Date(dataDoIat.getTime() + 1001) // 1.001s depois, fora da margem
    assert.equal(sessaoInvalidadaPorTrocaSenha(SEGUNDOS, senhaAlteradaEm), true)
  })
})
