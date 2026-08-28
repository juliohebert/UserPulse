import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_LABEL, statusTooltip, formatarInicioSP } from './campanhaStatusCopy'

describe('STATUS_LABEL — texto dos 5 estados', () => {
  test('labels exatos', () => {
    assert.equal(STATUS_LABEL.rascunho, 'Rascunho')
    assert.equal(STATUS_LABEL.agendada, 'Agendada')
    assert.equal(STATUS_LABEL.ativa, 'Ativa')
    assert.equal(STATUS_LABEL.inativa, 'Desativada')
    assert.equal(STATUS_LABEL.encerrada, 'Encerrada')
  })

  test('cobre exatamente as 5 situações de getStatus', () => {
    assert.deepEqual(
      Object.keys(STATUS_LABEL).sort(),
      ['agendada', 'ativa', 'encerrada', 'inativa', 'rascunho'],
    )
  })

  test('chave interna continua "inativa" — só o texto exibido é "Desativada"', () => {
    assert.ok('inativa' in STATUS_LABEL)
    assert.equal(STATUS_LABEL.inativa, 'Desativada')
    assert.equal((STATUS_LABEL as Record<string, string>).desativada, undefined)
  })
})

describe('formatarInicioSP — America/Sao_Paulo', () => {
  test('ISO UTC -> "DD/MM/AAAA às HH:MM" no fuso de São Paulo (12:00Z = 09:00)', () => {
    assert.equal(formatarInicioSP('2026-09-01T12:00:00.000Z'), '01/09/2026 às 09:00')
  })
  test('valor date-only legado -> "DD/MM/AAAA" sem hora', () => {
    assert.equal(formatarInicioSP('2026-09-01'), '01/09/2026')
  })
  test('vazio / null / undefined -> null', () => {
    assert.equal(formatarInicioSP(''), null)
    assert.equal(formatarInicioSP(null), null)
    assert.equal(formatarInicioSP(undefined), null)
  })
  test('string inválida -> null', () => {
    assert.equal(formatarInicioSP('amanhã'), null)
  })
})

describe('statusTooltip', () => {
  test('rascunho: ainda não publicada', () => {
    assert.match(statusTooltip('rascunho'), /ainda não publicada/i)
    assert.match(statusTooltip('rascunho'), /nunca foi exibida/i)
  })

  test('ativa: no ar para usuários elegíveis', () => {
    assert.match(statusTooltip('ativa'), /no ar/i)
    assert.match(statusTooltip('ativa'), /elegíveis/i)
  })

  test('inativa (Desativada): pausada manualmente e pode ser reativada', () => {
    assert.match(statusTooltip('inativa'), /pausada manualmente/i)
    assert.match(statusTooltip('inativa'), /reativada/i)
  })

  test('encerrada: vigência finalizada; duplique para rodar novamente', () => {
    const t = statusTooltip('encerrada')
    assert.match(t, /vigência finalizada/i)
    assert.match(t, /não reabre/i)
    assert.match(t, /duplique para rodar novamente/i)
  })

  test('agendada com data/hora: cita quando começa a aparecer (SP)', () => {
    const t = statusTooltip('agendada', '2026-09-01T12:00:00.000Z')
    assert.match(t, /só começa a aparecer/i)
    assert.ok(t.includes('01/09/2026 às 09:00'), t)
  })

  test('agendada date-only legado: cita a data sem hora', () => {
    const t = statusTooltip('agendada', '2026-09-01')
    assert.ok(t.includes('01/09/2026'), t)
    assert.equal(t.includes('às'), false)
  })

  test('agendada sem data_inicio: fallback genérico, sem quebrar', () => {
    assert.equal(
      statusTooltip('agendada', null),
      'Publicada, mas só começa a aparecer na data de início configurada.',
    )
    assert.equal(statusTooltip('agendada'), 'Publicada, mas só começa a aparecer na data de início configurada.')
  })

  test('todos os 5 estados retornam string não-vazia', () => {
    for (const s of ['rascunho', 'agendada', 'ativa', 'inativa', 'encerrada'] as const) {
      assert.equal(typeof statusTooltip(s), 'string')
      assert.ok(statusTooltip(s).length > 0)
    }
  })
})
