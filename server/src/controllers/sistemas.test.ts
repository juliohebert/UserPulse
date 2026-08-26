import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarDominios } from './sistemas'

// Sistema.dominios alimenta o catálogo mostrado no admin (multi-select de
// Campanha.segmentar_dominios/TourGuiado.segmentacao_regras campo "dominio"/
// Jornada.segmentar_dominios) — mesma normalização de hostname puro (ver
// normalizarDominio em lib/dominio.ts).
describe('normalizarDominios (Sistema)', () => {
  test('URLs completas viram hostname puro em lowercase', () => {
    assert.deepEqual(
      normalizarDominios(['https://NG.QuarkClinic.com.br/app', 'GNG.quarkclinic.com.br:8080']),
      ['ng.quarkclinic.com.br', 'gng.quarkclinic.com.br']
    )
  })

  test('não-array vira lista vazia', () => {
    assert.deepEqual(normalizarDominios(undefined), [])
    assert.deepEqual(normalizarDominios(null), [])
    assert.deepEqual(normalizarDominios('ng.quarkclinic.com.br'), [])
  })

  test('itens vazios/whitespace são descartados', () => {
    assert.deepEqual(normalizarDominios(['ng.quarkclinic.com.br', '  ', '']), ['ng.quarkclinic.com.br'])
  })
})
