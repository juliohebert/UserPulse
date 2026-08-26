import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDominios } from './jornadas'

const FONTE_JORNADAS = readFileSync(new URL('./jornadas.ts', import.meta.url), 'utf8')

// Mesma normalização de Campanha.segmentar_dominios (ver normalizarDominio em
// lib/dominio.ts, campanhas.test.ts) — Jornada reusa a função compartilhada.
describe('parseDominios (Jornada)', () => {
  test('URL completa com protocolo/porta/path é reduzida a hostname puro em lowercase', () => {
    assert.deepEqual(parseDominios([' HTTPS://NG.QuarkClinic.com.br:8443/caminho/x ']), ['ng.quarkclinic.com.br'])
  })

  test('valor que não é array vira lista vazia (mesmo padrão dos demais segmentar_* de Jornada — sem split por vírgula como parseArray de campanhas.ts)', () => {
    assert.deepEqual(parseDominios('ng.quarkclinic.com.br, GNG.quarkclinic.com.br'), [])
  })

  test('não-array vira lista vazia', () => {
    assert.deepEqual(parseDominios(undefined), [])
    assert.deepEqual(parseDominios(null), [])
  })

  test('itens vazios/whitespace são descartados', () => {
    assert.deepEqual(parseDominios(['ng.quarkclinic.com.br', '  ', '']), ['ng.quarkclinic.com.br'])
  })

  // Nunca valida contra Sistema.dominios — um valor fora do catálogo atual do
  // Sistema (drift histórico, ou Sistema editado depois) continua sendo
  // persistido sem filtro. A UI (jornadas/Form.tsx) é responsável por manter
  // esses valores visíveis/selecionados, nunca removê-los automaticamente.
  test('valor fora de qualquer catálogo de Sistema ainda é aceito/normalizado normalmente', () => {
    assert.deepEqual(parseDominios(['dominio-legado-removido-do-sistema.com.br']), ['dominio-legado-removido-do-sistema.com.br'])
  })
})

describe('jornadas.ts — persistência de segmentar_dominios', () => {
  test('criar() grava segmentar_dominios via parseDominios', () => {
    const inicio = FONTE_JORNADAS.indexOf('export async function criar')
    const fim = FONTE_JORNADAS.indexOf('export async function atualizar')
    const controller = FONTE_JORNADAS.slice(inicio, fim)
    assert.ok(controller.includes('segmentar_dominios: parseDominios(segmentar_dominios)'))
  })

  test('atualizar() só regrava segmentar_dominios quando o campo é reenviado (PUT parcial)', () => {
    const inicio = FONTE_JORNADAS.indexOf('export async function atualizar')
    const fim = FONTE_JORNADAS.indexOf('export async function remover')
    const controller = FONTE_JORNADAS.slice(inicio, fim)
    assert.ok(controller.includes('...(segmentar_dominios !== undefined && { segmentar_dominios: parseDominios(segmentar_dominios) })'))
  })
})
