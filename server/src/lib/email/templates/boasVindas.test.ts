import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { montarEmailBoasVindas } from './boasVindas'

const DADOS_BASE = {
  nomeResponsavel: 'Ana Silva',
  diasTrial: 14,
  limiteCampanhas: 10,
  limiteTours: 1,
  limiteJornadas: 1,
  urlProduto: 'https://app.userpulse.com.br',
}

describe('montarEmailBoasVindas — template puro (sem provider, sem I/O)', () => {
  test('destinatário e assunto', () => {
    const msg = montarEmailBoasVindas('ana@acme.com', DADOS_BASE)
    assert.equal(msg.to, 'ana@acme.com')
    assert.match(msg.subject, /Bem-vindo ao UserPulse/)
  })

  test('menciona a duração real do trial (nunca hardcoded no template)', () => {
    const msg = montarEmailBoasVindas('ana@acme.com', { ...DADOS_BASE, diasTrial: 21 })
    assert.match(msg.text, /21 dias/)
    assert.match(msg.html, /21 dias/)
  })

  test('lista os limites do plano de trial', () => {
    const msg = montarEmailBoasVindas('ana@acme.com', DADOS_BASE)
    assert.match(msg.text, /10 campanhas/)
    assert.match(msg.text, /1 tour guiado/)
    assert.match(msg.text, /1 jornada/)
  })

  test('limite null vira "ilimitado" em vez de sumir ou mostrar "null"', () => {
    const msg = montarEmailBoasVindas('ana@acme.com', { ...DADOS_BASE, limiteCampanhas: null })
    assert.match(msg.text, /campanhas ilimitadas/i)
    assert.doesNotMatch(msg.text, /null/i)
  })

  test('inclui o CTA com a URL do produto', () => {
    const msg = montarEmailBoasVindas('ana@acme.com', DADOS_BASE)
    assert.match(msg.text, /https:\/\/app\.userpulse\.com\.br/)
    assert.match(msg.html, /https:\/\/app\.userpulse\.com\.br/)
  })

  test('nunca usa travessão/em dash (regra explícita da tarefa)', () => {
    const msg = montarEmailBoasVindas('ana@acme.com', DADOS_BASE)
    assert.doesNotMatch(msg.text, /—/)
    assert.doesNotMatch(msg.html, /—/)
    assert.doesNotMatch(msg.subject, /—/)
  })
})
