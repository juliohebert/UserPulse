import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarReexibicaoPorDias, fonteReferenciaReexibicao } from './widget'

const DIA_MS = 86_400_000
const AGORA = new Date('2026-07-10T12:00:00Z')

function diasAtras(dias: number): Date {
  return new Date(AGORA.getTime() - dias * DIA_MS)
}

describe('fonteReferenciaReexibicao', () => {
  test('campanha com feedback habilitado usa feedback como referência', () => {
    const fonte = fonteReferenciaReexibicao({ exige_confirmacao_leitura: false, feedback_habilitado: true })
    assert.equal(fonte, 'feedback')
  })

  test('campanha que exige confirmação de leitura usa confirmação como referência', () => {
    const fonte = fonteReferenciaReexibicao({ exige_confirmacao_leitura: true, feedback_habilitado: true })
    assert.equal(fonte, 'confirmacao')
  })

  test('campanha sem feedback e sem confirmação cai no fallback de visualização', () => {
    const fonte = fonteReferenciaReexibicao({ exige_confirmacao_leitura: false, feedback_habilitado: false })
    assert.equal(fonte, 'visualizacao')
  })
})

describe('avaliarReexibicaoPorDias — campanha com resposta/NPS (fonte "feedback")', () => {
  test('último feedback hoje bloqueia', () => {
    const r = avaliarReexibicaoPorDias(60, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, true)
  })

  test('último feedback há 59 dias bloqueia', () => {
    const r = avaliarReexibicaoPorDias(60, diasAtras(59), AGORA, 'feedback')
    assert.equal(r.bloqueado, true)
  })

  test('último feedback há 60 dias libera', () => {
    const r = avaliarReexibicaoPorDias(60, diasAtras(60), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })

  test('sem feedback (referência nula) libera, mesmo com visualização recente ignorada pelo caller', () => {
    // O caller só resolve `referencia` a partir da tabela de feedback quando fonte === 'feedback';
    // uma visualização recente nunca chega até aqui como referência.
    const r = avaliarReexibicaoPorDias(60, null, AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })
})

describe('avaliarReexibicaoPorDias — campanha com confirmação de leitura (fonte "confirmacao")', () => {
  test('última confirmação dentro do prazo bloqueia', () => {
    const r = avaliarReexibicaoPorDias(30, diasAtras(10), AGORA, 'confirmacao')
    assert.equal(r.bloqueado, true)
  })

  test('última confirmação fora do prazo libera', () => {
    const r = avaliarReexibicaoPorDias(30, diasAtras(31), AGORA, 'confirmacao')
    assert.equal(r.bloqueado, false)
  })

  test('sem confirmação (referência nula) libera — visualização não deve ser referência', () => {
    const r = avaliarReexibicaoPorDias(30, null, AGORA, 'confirmacao')
    assert.equal(r.bloqueado, false)
  })
})

describe('avaliarReexibicaoPorDias — campanha informativa, sem feedback e sem confirmação (fonte "visualizacao")', () => {
  test('última visualização dentro do prazo bloqueia', () => {
    const r = avaliarReexibicaoPorDias(15, diasAtras(5), AGORA, 'visualizacao')
    assert.equal(r.bloqueado, true)
  })

  test('última visualização fora do prazo libera', () => {
    const r = avaliarReexibicaoPorDias(15, diasAtras(15), AGORA, 'visualizacao')
    assert.equal(r.bloqueado, false)
  })
})

describe('avaliarReexibicaoPorDias — reexibir_apos_dias null, 0 ou negativo', () => {
  test('null sempre libera, mesmo com resposta hoje', () => {
    const r = avaliarReexibicaoPorDias(null, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })

  test('0 sempre libera', () => {
    const r = avaliarReexibicaoPorDias(0, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })

  test('negativo sempre libera', () => {
    const r = avaliarReexibicaoPorDias(-5, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })
})
