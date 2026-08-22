import assert from 'node:assert/strict'
import test from 'node:test'
import { criarEstadoUtilidadeSimulada, deveRenderizarCtaSimulado, criarResolvedorIdDestaque } from './DestaqueElementoSimulacao.logic'

test('preserva a identidade local ao reordenar destaques novos', () => {
  const resolverId = criarResolvedorIdDestaque()
  const itemA = { titulo: 'A' }
  const itemB = { titulo: 'B' }
  const antes = [itemA, itemB].map(resolverId)
  const depois = [itemB, itemA].map(resolverId)

  assert.deepEqual(antes, ['destaque-local-1', 'destaque-local-2'])
  assert.deepEqual(depois, ['destaque-local-2', 'destaque-local-1'])
})

test('preserva a identidade local ao editar e remover destaques novos', () => {
  const resolverId = criarResolvedorIdDestaque()
  const itemA = { titulo: 'A' }
  const itemB = { titulo: 'B' }
  const antes = [itemA, itemB].map(resolverId)
  const itemAEditado = { ...itemA, titulo: 'Atualizado' }

  assert.equal(resolverId(itemAEditado), antes[0])
  assert.deepEqual([itemAEditado, itemB].map(resolverId), antes)
  assert.deepEqual([itemAEditado].map(resolverId), [antes[0]])
})

test('reseta o estado simulado quando muda a identidade do destaque', () => {
  const itemA = criarEstadoUtilidadeSimulada('item-a')
  const itemB = criarEstadoUtilidadeSimulada('item-b')

  assert.deepEqual(itemA, { itemId: 'item-a', utilidade: null, observacao: '', enviado: false })
  assert.deepEqual(itemB, { itemId: 'item-b', utilidade: null, observacao: '', enviado: false })
  assert.notEqual(itemA.itemId, itemB.itemId)
})

test('CTA simulado só aceita texto e URLs HTTP(S)', () => {
  assert.equal(deveRenderizarCtaSimulado('Saiba mais', 'https://example.com'), true)
  assert.equal(deveRenderizarCtaSimulado('Saiba mais', 'http://example.com/path'), true)
  assert.equal(deveRenderizarCtaSimulado('Saiba mais', ''), false)
  assert.equal(deveRenderizarCtaSimulado('', 'https://example.com'), false)
  assert.equal(deveRenderizarCtaSimulado('Executar', 'javascript:alert(1)'), false)
  assert.equal(deveRenderizarCtaSimulado('Executar', 'data:text/html,hello'), false)
})
