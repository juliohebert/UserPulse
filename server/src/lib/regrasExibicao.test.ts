import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarRegra,
  normalizarRegrasExibicao,
  regraBase,
  filtroRegrasCandidatas,
  MAX_REGRAS_EXIBICAO,
} from './regrasExibicao'

// Módulo puro compartilhado por widget.ts (filtro de candidatas) e
// campanhas.ts (validação/persistência de múltiplas telas/URLs). buscarDashboard/
// buscarCandidatas continuam integration-only; aqui cobrimos as peças puras.

describe('normalizarRegra — uma regra crua -> canônica ou null', () => {
  test('sistema_tela: usa a `tela`; tela vazia vira "Geral" (mesma tolerância do controller legado)', () => {
    assert.deepEqual(normalizarRegra({ modo_identificacao: 'sistema_tela', tela: ' Agenda ' }), {
      modo_identificacao: 'sistema_tela', tela: 'Agenda', url_contem: null, data_cy: null,
    })
    assert.deepEqual(normalizarRegra({ modo_identificacao: 'sistema_tela', tela: '' }), {
      modo_identificacao: 'sistema_tela', tela: 'Geral', url_contem: null, data_cy: null,
    })
  })

  test('modo ausente -> assume sistema_tela', () => {
    assert.equal(normalizarRegra({ tela: 'X' })?.modo_identificacao, 'sistema_tela')
  })

  test('url_contem sem url -> null; com url -> só o url_contem preenchido', () => {
    assert.equal(normalizarRegra({ modo_identificacao: 'url_contem', url_contem: '  ' }), null)
    assert.deepEqual(normalizarRegra({ modo_identificacao: 'url_contem', url_contem: '/app/x', tela: 'ignorada' }), {
      modo_identificacao: 'url_contem', tela: null, url_contem: '/app/x', data_cy: null,
    })
  })

  test('data_cy sem valor -> null; com valor -> só o data_cy preenchido', () => {
    assert.equal(normalizarRegra({ modo_identificacao: 'data_cy' }), null)
    assert.deepEqual(normalizarRegra({ modo_identificacao: 'data_cy', data_cy: 'btn' }), {
      modo_identificacao: 'data_cy', tela: null, url_contem: null, data_cy: 'btn',
    })
  })

  test('modo desconhecido -> null', () => {
    assert.equal(normalizarRegra({ modo_identificacao: 'qualquer_coisa', tela: 'X' }), null)
  })
})

describe('normalizarRegrasExibicao — lista do body, sempre >= 1', () => {
  const base = { modo_identificacao: 'sistema_tela', tela: 'Home', url_contem: null, data_cy: null }

  test('body ausente -> 1 regra sintetizada dos campos legados (API antiga inalterada)', () => {
    assert.deepEqual(normalizarRegrasExibicao(undefined, base), [
      { modo_identificacao: 'sistema_tela', tela: 'Home', url_contem: null, data_cy: null, ordem: 0 },
    ])
  })

  test('body com N regras válidas -> reindexado por `ordem` a partir de 0', () => {
    const r = normalizarRegrasExibicao([
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
      { modo_identificacao: 'sistema_tela', tela: 'Prontuario' },
      { modo_identificacao: 'url_contem', url_contem: '/app/faturamento' },
    ], base)
    assert.deepEqual(r.map(x => [x.ordem, x.modo_identificacao, x.tela ?? x.url_contem]), [
      [0, 'sistema_tela', 'Agenda'],
      [1, 'sistema_tela', 'Prontuario'],
      [2, 'url_contem', '/app/faturamento'],
    ])
  })

  test('regras inválidas no meio são descartadas (não quebram a lista)', () => {
    const r = normalizarRegrasExibicao([
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
      { modo_identificacao: 'url_contem', url_contem: '' },   // inválida
      { modo_identificacao: 'data_cy', data_cy: 'x' },
    ], base)
    assert.deepEqual(r.map(x => x.modo_identificacao), ['sistema_tela', 'data_cy'])
    assert.deepEqual(r.map(x => x.ordem), [0, 1])
  })

  test('regras duplicadas são deduplicadas (duas iguais aparecem uma vez só)', () => {
    const r = normalizarRegrasExibicao([
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
      { modo_identificacao: 'sistema_tela', tela: 'Agenda' },
    ], base)
    assert.equal(r.length, 1)
  })

  test('body vazio / só inválidas -> cai na regra base (nunca retorna [])', () => {
    assert.deepEqual(normalizarRegrasExibicao([], base), [
      { modo_identificacao: 'sistema_tela', tela: 'Home', url_contem: null, data_cy: null, ordem: 0 },
    ])
    assert.deepEqual(normalizarRegrasExibicao([{ modo_identificacao: 'url_contem' }], base).map(x => x.tela), ['Home'])
  })

  test('teto de MAX_REGRAS_EXIBICAO regras', () => {
    const muitas = Array.from({ length: MAX_REGRAS_EXIBICAO + 5 }, (_, i) => ({ modo_identificacao: 'sistema_tela', tela: `T${i}` }))
    assert.equal(normalizarRegrasExibicao(muitas, base).length, MAX_REGRAS_EXIBICAO)
  })

  test('não é array (string, objeto) -> tratado como ausente, cai na base', () => {
    assert.equal(normalizarRegrasExibicao('x' as unknown, base).length, 1)
    assert.equal(normalizarRegrasExibicao({} as unknown, base).length, 1)
  })
})

describe('regraBase — a regra ordem 0 (espelhada nas colunas legadas)', () => {
  test('retorna a de ordem 0', () => {
    const regras = normalizarRegrasExibicao([
      { modo_identificacao: 'url_contem', url_contem: '/a' },
      { modo_identificacao: 'sistema_tela', tela: 'B' },
    ], { modo_identificacao: 'sistema_tela', tela: 'x', url_contem: null, data_cy: null })
    assert.equal(regraBase(regras).ordem, 0)
    assert.equal(regraBase(regras).url_contem, '/a')
  })
})

describe('filtroRegrasCandidatas — fragmento Prisma `regras: { some: { OR: [...] } }`', () => {
  test('com tela: OR tem sistema_tela(tela) + data_cy + url_contem', () => {
    const f = filtroRegrasCandidatas('home')
    assert.deepEqual(f.some.OR, [
      { modo_identificacao: 'sistema_tela', tela: 'home' },
      { modo_identificacao: 'data_cy' },
      { modo_identificacao: 'url_contem' },
    ])
  })

  test('sem tela: sistema_tela nem entra no OR (só data_cy + url_contem) — comportamento preexistente', () => {
    const f = filtroRegrasCandidatas('')
    assert.deepEqual(f.some.OR, [
      { modo_identificacao: 'data_cy' },
      { modo_identificacao: 'url_contem' },
    ])
  })
})
