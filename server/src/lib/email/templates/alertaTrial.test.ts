import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { montarEmailAlertaTrial } from './alertaTrial'

const DADOS_BASE = {
  nomeResponsavel: 'Ana Silva',
  urlAssinatura: 'https://app.userpulse.com.br/minha-assinatura',
}

describe('montarEmailAlertaTrial — template puro (sem provider, sem I/O)', () => {
  test('D7: assunto exato pedido pela tarefa', () => {
    const msg = montarEmailAlertaTrial('ana@acme.com', 'D7', DADOS_BASE)
    assert.equal(msg.to, 'ana@acme.com')
    assert.equal(msg.subject, 'Seu teste grátis termina em 7 dias')
  })
  test('D3: assunto exato pedido pela tarefa', () => {
    const msg = montarEmailAlertaTrial('ana@acme.com', 'D3', DADOS_BASE)
    assert.equal(msg.subject, 'Faltam 3 dias para o fim do seu teste grátis')
  })
  test('D1: assunto exato pedido pela tarefa', () => {
    const msg = montarEmailAlertaTrial('ana@acme.com', 'D1', DADOS_BASE)
    assert.equal(msg.subject, 'Seu teste grátis termina amanhã')
  })
  test('VENCIDO: assunto exato pedido pela tarefa', () => {
    const msg = montarEmailAlertaTrial('ana@acme.com', 'VENCIDO', DADOS_BASE)
    assert.equal(msg.subject, 'Seu teste grátis terminou')
  })

  test('inclui o CTA "Escolher um plano" com o link de Minha Assinatura', () => {
    for (const marco of ['D7', 'D3', 'D1', 'VENCIDO'] as const) {
      const msg = montarEmailAlertaTrial('ana@acme.com', marco, DADOS_BASE)
      assert.match(msg.text, /Escolher um plano/)
      assert.match(msg.html, /Escolher um plano/)
      assert.match(msg.text, /https:\/\/app\.userpulse\.com\.br\/minha-assinatura/)
      assert.match(msg.html, /https:\/\/app\.userpulse\.com\.br\/minha-assinatura/)
    }
  })

  test('nunca usa travessão/em dash em nenhum marco (regra explícita da tarefa)', () => {
    for (const marco of ['D7', 'D3', 'D1', 'VENCIDO'] as const) {
      const msg = montarEmailAlertaTrial('ana@acme.com', marco, DADOS_BASE)
      assert.doesNotMatch(msg.text, /—/)
      assert.doesNotMatch(msg.html, /—/)
      assert.doesNotMatch(msg.subject, /—/)
    }
  })

  test('url de assinatura nunca hardcoded no template (varia conforme dados)', () => {
    const msg = montarEmailAlertaTrial('ana@acme.com', 'D7', { ...DADOS_BASE, urlAssinatura: 'https://outro.dominio.com/minha-assinatura' })
    assert.match(msg.text, /https:\/\/outro\.dominio\.com\/minha-assinatura/)
  })
})
