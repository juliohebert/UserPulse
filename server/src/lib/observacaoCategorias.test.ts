import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  categoriaDaNota,
  validarObservacaoCategorias,
  resolverObservacaoCategoria,
  MAX_MENSAGEM_OBSERVACAO,
} from './observacaoCategorias'

// Módulo puro — validação usada por campanhas.ts (persistência) e o resolver
// que espelha resolverObservacaoNps do widget.js. Ver
// server/src/widgetNpsObservacaoCategoria.test.ts pra cobertura do widget.

describe('categoriaDaNota — 9-10 promotor / 7-8 neutro / 0-6 detrator', () => {
  test('promotor: 9 e 10', () => {
    assert.equal(categoriaDaNota(9), 'promotor')
    assert.equal(categoriaDaNota(10), 'promotor')
  })
  test('neutro: 7 e 8', () => {
    assert.equal(categoriaDaNota(7), 'neutro')
    assert.equal(categoriaDaNota(8), 'neutro')
  })
  test('detrator: 0 a 6', () => {
    for (const n of [0, 1, 3, 6]) assert.equal(categoriaDaNota(n), 'detrator')
  })
})

describe('validarObservacaoCategorias', () => {
  test('undefined -> { documento: undefined } (não escrever)', () => {
    assert.deepEqual(validarObservacaoCategorias(undefined), { documento: undefined })
  })
  test('null -> { documento: null } (limpa)', () => {
    assert.deepEqual(validarObservacaoCategorias(null), { documento: null })
  })
  test('objeto vazio / sem categoria válida -> documento: null', () => {
    assert.deepEqual(validarObservacaoCategorias({}), { documento: null })
    assert.deepEqual(validarObservacaoCategorias({ xpto: { habilitado: true } }), { documento: null })
  })
  test('array / string / número -> erro', () => {
    assert.ok(validarObservacaoCategorias([]).erro)
    assert.ok(validarObservacaoCategorias('x').erro)
    assert.ok(validarObservacaoCategorias(5).erro)
  })
  test('categoria com valor não-objeto -> erro', () => {
    assert.ok(validarObservacaoCategorias({ promotor: 'sim' }).erro)
  })
  test('mantém só as 3 chaves conhecidas, coage tipos, trim + corta a mensagem', () => {
    const r = validarObservacaoCategorias({
      promotor: { habilitado: true, mensagem: '  O que te encantou?  ' },
      neutro: { habilitado: false, mensagem: 'x' },
      detrator: { mensagem: 'a'.repeat(400) }, // habilitado ausente -> true
      lixo: { habilitado: true },
    })
    assert.deepEqual(r.documento, {
      promotor: { habilitado: true, mensagem: 'O que te encantou?' },
      neutro: { habilitado: false, mensagem: 'x' },
      detrator: { habilitado: true, mensagem: 'a'.repeat(MAX_MENSAGEM_OBSERVACAO) },
    })
  })
  test('habilitado coagido a boolean; mensagem não-string -> ""', () => {
    const r = validarObservacaoCategorias({ promotor: { habilitado: 1, mensagem: 42 } })
    assert.deepEqual(r.documento, { promotor: { habilitado: true, mensagem: '' } })
  })
})

describe('resolverObservacaoCategoria — { legado, visivel, mensagem }', () => {
  const cfg = {
    promotor: { habilitado: true, mensagem: 'Conte o que te encantou' },
    neutro: { habilitado: true, mensagem: '' },
    detrator: { habilitado: false, mensagem: 'ignorada' },
  }

  test('sem config -> legado (campo sempre visível)', () => {
    assert.deepEqual(resolverObservacaoCategoria(null, 9), { legado: true, visivel: true, mensagem: null })
    assert.deepEqual(resolverObservacaoCategoria(undefined, 3), { legado: true, visivel: true, mensagem: null })
  })
  test('config presente mas nota null -> campo escondido (aguarda a nota)', () => {
    assert.deepEqual(resolverObservacaoCategoria(cfg, null), { legado: false, visivel: false, mensagem: null })
  })
  test('nota 9-10 usa promotor (habilitado + mensagem)', () => {
    assert.deepEqual(resolverObservacaoCategoria(cfg, 10), { legado: false, visivel: true, mensagem: 'Conte o que te encantou' })
  })
  test('nota 7-8 usa neutro (habilitado, mensagem vazia -> null)', () => {
    assert.deepEqual(resolverObservacaoCategoria(cfg, 7), { legado: false, visivel: true, mensagem: null })
  })
  test('nota 0-6 usa detrator (desabilitado -> não visível)', () => {
    assert.deepEqual(resolverObservacaoCategoria(cfg, 0), { legado: false, visivel: false, mensagem: null })
    assert.deepEqual(resolverObservacaoCategoria(cfg, 6), { legado: false, visivel: false, mensagem: null })
  })
  test('categoria ausente no objeto -> fallback legado', () => {
    assert.deepEqual(resolverObservacaoCategoria({ promotor: { habilitado: false, mensagem: '' } }, 8), { legado: true, visivel: true, mensagem: null })
  })
})
