import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  avaliarPoliticaReexibicao, avaliarReexibicaoA24h, dataMaisRecentePorRegra,
  POLITICA_REEXIBIR_A_CADA_24H, INTERVALO_REEXIBICAO_24H_MS, TIPO_EVENTO_FECHAMENTO_MANUAL, TIPOS_EVENTO_CAMPANHA,
} from './widget'
import { validarPoliticaReexibicao } from './campanhas'
import { filtrosEventos } from './dashboard'

// Frequência "A cada 24 horas" (reexibir_a_cada_24h). Só funções puras, sem
// banco/HTTP (convenção do repo). O caminho que consulta Prisma
// (verificarHistorico/verificarHistoricoPorRegra) apenas monta o histórico e
// delega a estas funções; fica validado manualmente contra um servidor local
// (ver relatório da missão 002) e por inspeção estática abaixo.

const H = 3_600_000
const AGORA = new Date('2026-07-10T12:00:00.000Z')
const antes = (ms: number) => new Date(AGORA.getTime() - ms)
const SEM = { ultimaVisualizacao: null, ultimoFeedback: null, ultimaConfirmacao: null, ultimoFechamento: null }

const CAMPANHA_24H = {
  politica_reexibicao: POLITICA_REEXIBIR_A_CADA_24H,
  reexibir_apos_dias: null,
  intervalo_reexibicao_dias: null,
  exige_confirmacao_leitura: false,
  feedback_habilitado: false,
}

describe('avaliarReexibicaoA24h — cálculo do intervalo', () => {
  test('constante: 24h em ms exatos', () => {
    assert.equal(INTERVALO_REEXIBICAO_24H_MS, 86_400_000)
  })

  test('primeira exibição (sem histórico) é elegível', () => {
    assert.equal(avaliarReexibicaoA24h(SEM, AGORA).bloqueado, false)
  })

  test('fechado há 23h59min -> bloqueado', () => {
    const h = { ...SEM, ultimoFechamento: antes(24 * H - 60_000) }
    assert.equal(avaliarReexibicaoA24h(h, AGORA).bloqueado, true)
  })

  test('fechado há 23h59min59s999ms -> bloqueado', () => {
    const h = { ...SEM, ultimoFechamento: antes(24 * H - 1) }
    assert.equal(avaliarReexibicaoA24h(h, AGORA).bloqueado, true)
  })

  test('fechado há exatamente 24h -> liberado', () => {
    const h = { ...SEM, ultimoFechamento: antes(24 * H) }
    assert.equal(avaliarReexibicaoA24h(h, AGORA).bloqueado, false)
  })

  test('fechado há mais de 24h -> liberado', () => {
    const h = { ...SEM, ultimoFechamento: antes(48 * H) }
    assert.equal(avaliarReexibicaoA24h(h, AGORA).bloqueado, false)
  })

  test('exemplo do PO: fecha seg 10h05 -> ter 10h04 bloqueia, ter 10h05 libera (instante, não calendário)', () => {
    const fechou = new Date('2026-07-06T10:05:00.000Z')
    const h = { ...SEM, ultimaVisualizacao: new Date('2026-07-06T10:00:00.000Z'), ultimoFechamento: fechou }
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-06T15:00:00.000Z')).bloqueado, true)
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-07T10:04:59.999Z')).bloqueado, true)
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-07T10:05:00.000Z')).bloqueado, false)
  })

  test('novo fechamento reinicia o ciclo (ter 14h -> só qua 14h)', () => {
    const h = {
      ...SEM,
      ultimaVisualizacao: new Date('2026-07-07T10:05:00.000Z'),
      ultimoFechamento: new Date('2026-07-07T14:00:00.000Z'),
    }
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-08T13:59:59.999Z')).bloqueado, true)
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-08T14:00:00.000Z')).bloqueado, false)
  })

  test('visualização mais recente que o fechamento (nova exibição interrompida) protege por 24h da exibição', () => {
    const h = { ...SEM, ultimoFechamento: antes(30 * H), ultimaVisualizacao: antes(1 * H) }
    assert.equal(avaliarReexibicaoA24h(h, AGORA).bloqueado, true)
  })

  test('aberta e interrompida por navegação (só visualização, sem fechamento) -> bloqueia por 24h da exibição', () => {
    assert.equal(avaliarReexibicaoA24h({ ...SEM, ultimaVisualizacao: antes(5 * 60_000) }, AGORA).bloqueado, true)
    assert.equal(avaliarReexibicaoA24h({ ...SEM, ultimaVisualizacao: antes(24 * H) }, AGORA).bloqueado, false)
  })

  test('timestamps usados como instantes UTC: independe de fuso/offset da data', () => {
    const fechou = new Date('2026-07-06T23:30:00-03:00') // = 02:30Z do dia 07
    const h = { ...SEM, ultimoFechamento: fechou }
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-07T23:29:59.999-03:00')).bloqueado, true)
    assert.equal(avaliarReexibicaoA24h(h, new Date('2026-07-07T23:30:00-03:00')).bloqueado, false)
  })

  test('motivo informa tempo restante em horas (arredondado pra cima)', () => {
    const r = avaliarReexibicaoA24h({ ...SEM, ultimoFechamento: antes(1 * H) }, AGORA)
    assert.equal(r.bloqueado, true)
    if (r.bloqueado) assert.match(r.motivo, /23 hora\(s\)/)
  })
})

describe('avaliarPoliticaReexibicao — política reexibir_a_cada_24h', () => {
  test('feedback habilitado, fechada SEM responder -> volta após 24h (D2)', () => {
    const c = { ...CAMPANHA_24H, feedback_habilitado: true }
    const h = { ...SEM, ultimaVisualizacao: antes(24 * H + 5 * 60_000), ultimoFechamento: antes(24 * H) }
    assert.equal(avaliarPoliticaReexibicao(c, { ...h, ultimoFechamento: antes(24 * H - 1) }, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao(c, h, AGORA).bloqueado, false)
  })

  test('confirmação exigida, fechada SEM confirmar -> volta após 24h (D2)', () => {
    const c = { ...CAMPANHA_24H, exige_confirmacao_leitura: true }
    const h = { ...SEM, ultimoFechamento: antes(24 * H) }
    assert.equal(avaliarPoliticaReexibicao(c, h, AGORA).bloqueado, false)
  })

  test('resposta/confirmação nunca bloqueiam por si só além de 24h (não é "até responder")', () => {
    const c = { ...CAMPANHA_24H, feedback_habilitado: true }
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimoFeedback: antes(48 * H) }, AGORA).bloqueado, false)
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimoFeedback: antes(2 * H) }, AGORA).bloqueado, true)
  })

  test('resposta recente reinicia o intervalo mesmo com fechamento antigo', () => {
    const c = { ...CAMPANHA_24H, feedback_habilitado: true }
    const h = { ...SEM, ultimoFechamento: antes(40 * H), ultimoFeedback: antes(3 * H) }
    assert.equal(avaliarPoliticaReexibicao(c, h, AGORA).bloqueado, true)
  })

  test('não usa reexibir_apos_dias nem intervalo legado', () => {
    const c = { ...CAMPANHA_24H, reexibir_apos_dias: 30, intervalo_reexibicao_dias: 30 }
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimoFechamento: antes(25 * H) }, AGORA).bloqueado, false)
  })
})

describe('compatibilidade — frequências antigas NÃO mudam com a nova política/evento', () => {
  const base = { reexibir_apos_dias: null, intervalo_reexibicao_dias: null, exige_confirmacao_leitura: false, feedback_habilitado: false }
  const comFechamento = { ...SEM, ultimoFechamento: antes(1 * H) }

  test('uma_vez_apos_visualizacao: fechamento sozinho não bloqueia; visualização continua bloqueando', () => {
    const c = { ...base, politica_reexibicao: 'uma_vez_apos_visualizacao' }
    assert.equal(avaliarPoliticaReexibicao(c, comFechamento, AGORA).bloqueado, false)
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimaVisualizacao: antes(100 * H) }, AGORA).bloqueado, true)
  })

  test('ate_responder_ou_confirmar: fechamento é ignorado', () => {
    const c = { ...base, politica_reexibicao: 'ate_responder_ou_confirmar', feedback_habilitado: true }
    assert.equal(avaliarPoliticaReexibicao(c, comFechamento, AGORA).bloqueado, false)
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimoFeedback: antes(H) }, AGORA).bloqueado, true)
  })

  test('reexibir_apos_dias=1 continua com a semântica antiga (âncora na visualização, dias inteiros) e ignora fechamento', () => {
    const c = { ...base, politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 1 }
    assert.equal(avaliarPoliticaReexibicao(c, comFechamento, AGORA).bloqueado, false)
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimaVisualizacao: antes(23 * H) }, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao(c, { ...SEM, ultimaVisualizacao: antes(24 * H) }, AGORA).bloqueado, false)
    // com feedback habilitado, fechar sem responder continua NÃO bloqueando (comportamento legado preservado)
    const fb = { ...c, feedback_habilitado: true }
    assert.equal(avaliarPoliticaReexibicao(fb, { ...SEM, ultimaVisualizacao: antes(H), ultimoFechamento: antes(H) }, AGORA).bloqueado, false)
  })

  test('histórico sem o campo ultimoFechamento (undefined) funciona', () => {
    const c = { ...CAMPANHA_24H }
    assert.equal(avaliarPoliticaReexibicao(c, { ultimaVisualizacao: null, ultimoFeedback: null, ultimaConfirmacao: null }, AGORA).bloqueado, false)
  })
})

describe('escopo por regra de exibição (múltiplas regras / destinos)', () => {
  const linhas = [
    { criado_em: antes(1 * H), contexto: { __up_regra: 'st|home' } },
    { criado_em: antes(30 * H), contexto: { __up_regra: 'uc|/app/x' } },
    { criado_em: antes(40 * H), contexto: null }, // legado / campanha de 1 regra: vale pra todas
  ]

  test('fechar em st|home bloqueia só st|home; outra regra só vê a linha legada antiga', () => {
    const home = dataMaisRecentePorRegra(linhas, 'st|home')
    const outra = dataMaisRecentePorRegra(linhas, 'dc|botao')
    assert.equal(avaliarReexibicaoA24h({ ...SEM, ultimoFechamento: home }, AGORA).bloqueado, true)
    assert.equal(avaliarReexibicaoA24h({ ...SEM, ultimoFechamento: outra }, AGORA).bloqueado, false)
  })

  test('linha sem __up_regra (campanha de 1 regra) conta para qualquer chave', () => {
    const so1 = [{ criado_em: antes(2 * H), contexto: null }]
    assert.equal(avaliarReexibicaoA24h({ ...SEM, ultimoFechamento: dataMaisRecentePorRegra(so1, 'st|qualquer') }, AGORA).bloqueado, true)
  })
})

describe('contrato do evento de fechamento e métricas de dispensa', () => {
  test('fechamento_manual é tipo aceito e distinto de dispensa', () => {
    assert.equal(TIPO_EVENTO_FECHAMENTO_MANUAL, 'fechamento_manual')
    assert.ok(TIPOS_EVENTO_CAMPANHA.includes('fechamento_manual'))
    assert.ok(TIPOS_EVENTO_CAMPANHA.includes('dispensa'))
    assert.notEqual(TIPO_EVENTO_FECHAMENTO_MANUAL, 'dispensa')
  })

  test('dashboard: listagem/total de interações exclui fechamento_manual por padrão', () => {
    const where = filtrosEventos({}, 'camp-1') as { campanha_id: string; tipo_evento?: unknown }
    assert.equal(where.campanha_id, 'camp-1')
    assert.deepEqual(where.tipo_evento, { not: 'fechamento_manual' })
  })

  test('dashboard: filtro por tipo continua funcionando e Dispensa segue sendo só "dispensa"', () => {
    assert.equal((filtrosEventos({ tipo: 'Dispensa' }, 'c') as { tipo_evento?: unknown }).tipo_evento, 'dispensa')
    assert.equal((filtrosEventos({ tipo: 'Visualização' }, 'c') as { tipo_evento?: unknown }).tipo_evento, 'visualizacao')
  })

  test('dashboard: contagem de dispensas (KPI) só lê tipo_evento=dispensa', () => {
    const fonte = readFileSync(new URL('./dashboard.ts', import.meta.url), 'utf8')
    assert.match(fonte, /item\.tipo_evento === 'dispensa'/)
    assert.equal(fonte.includes("tipo_evento === 'fechamento_manual'"), false)
  })

  test('gating só consulta fechamento_manual quando a política é reexibir_a_cada_24h', () => {
    const fonte = readFileSync(new URL('./widget.ts', import.meta.url), 'utf8')
    const ocorrencias = fonte.match(/campanha\.politica_reexibicao === POLITICA_REEXIBIR_A_CADA_24H/g) ?? []
    assert.equal(ocorrencias.length, 2, 'verificarHistorico e verificarHistoricoPorRegra')
  })
})

describe('validarPoliticaReexibicao', () => {
  test('aceita reexibir_a_cada_24h sem dias', () => {
    assert.equal(validarPoliticaReexibicao('reexibir_a_cada_24h', null, true), null)
  })
  test('aceita também com modal obrigatória (não permite fechar): protege pela exibição', () => {
    assert.equal(validarPoliticaReexibicao('reexibir_a_cada_24h', null, false), null)
  })
  test('políticas antigas inalteradas', () => {
    assert.equal(validarPoliticaReexibicao('uma_vez_apos_visualizacao', null, true), null)
    assert.equal(validarPoliticaReexibicao('ate_responder_ou_confirmar', null, true), null)
    assert.equal(validarPoliticaReexibicao('reexibir_apos_dias', 7, true), null)
    assert.match(validarPoliticaReexibicao('reexibir_apos_dias', null, true) ?? '', /dias/)
    assert.match(validarPoliticaReexibicao('uma_vez_apos_visualizacao', null, false) ?? '', /obrigatórias/)
  })
  test('política desconhecida continua rejeitada', () => {
    assert.match(validarPoliticaReexibicao('reexibir_a_cada_12h', null, true) ?? '', /inválida/)
  })
})
