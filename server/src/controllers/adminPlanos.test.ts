import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validarCamposPlano, motivoNivelDuplicado } from './adminPlanos'

// Fase 8B — hierarquia explícita de planos (Plano.nivel). Só funções puras
// (sem I/O): validarCamposPlano nunca toca Prisma; a checagem de
// duplicidade em si (motivoNivelDuplicado) recebe os candidatos já
// buscados, quem busca é validarNivelUnico (não-exportada, toca Prisma,
// não testada aqui — mesmo limite documentado em billing.test.ts).

function bodyBase(overrides: Record<string, unknown> = {}) {
  return {
    nome: 'Growth',
    slug: 'growth',
    nivel: 2,
    ...overrides,
  }
}

describe('validarCamposPlano — nivel', () => {
  test('nivel ausente em plano comercial (interno=false) é rejeitado — obrigatório', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: undefined }))
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.match(resultado.erro, /nivel é obrigatório/i)
  })

  test('nivel negativo é rejeitado', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: -1 }))
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.match(resultado.erro, /nivel inválido/i)
  })

  test('nivel não-inteiro é rejeitado', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: 1.5 }))
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.match(resultado.erro, /nivel inválido/i)
  })

  test('nivel não-numérico é rejeitado', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: 'abc' }))
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.match(resultado.erro, /nivel inválido/i)
  })

  test('nivel válido (inteiro >= 0) é aceito e gravado', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: 0 }))
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.data.nivel, 0)
  })

  test('plano interno (interno=true) nunca exige nivel — fica null mesmo sem nada no body', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: undefined, interno: true }))
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.data.nivel, null)
  })

  test('plano interno sempre grava nivel null, mesmo se algo vier no body', () => {
    const resultado = validarCamposPlano(bodyBase({ nivel: 5, interno: true }))
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.data.nivel, null)
  })
})

describe('motivoNivelDuplicado', () => {
  test('nenhum candidato com o mesmo nivel => libera', () => {
    assert.equal(motivoNivelDuplicado([], 2), null)
  })
  test('já existe um plano comercial com o mesmo nivel => bloqueia com o nome do conflito', () => {
    const motivo = motivoNivelDuplicado([{ nome: 'Growth', nivel: 2 }], 2)
    assert.match(motivo ?? '', /já existe um plano comercial \("Growth"\) com nivel 2/i)
  })
  test('candidatos com nivel DIFERENTE não conflitam', () => {
    assert.equal(motivoNivelDuplicado([{ nome: 'Starter', nivel: 1 }], 2), null)
  })
  test('candidato com nivel null nunca conflita (plano interno nunca apareceria aqui, mas defensivo)', () => {
    assert.equal(motivoNivelDuplicado([{ nome: 'Interno', nivel: null }], 2), null)
  })
})
