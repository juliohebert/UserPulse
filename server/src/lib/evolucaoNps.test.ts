import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { classificarNotaNps, montarEvolucaoNps, normalizarAnoEvolucaoNps, normalizarGranularidadeEvolucaoNps } from './evolucaoNps'

// Lógica pura da seção "Evolução de NPS" do dashboard da campanha. O
// controller (dashboard.ts) só orquestra: lê os parâmetros, roda o $queryRaw
// (bucket ano+mês+nota em fuso America/Sao_Paulo, filtro de tenant/tipo_avaliacao/
// SUPER_USUARIO/nota 0–10 no SQL) e chama montarEvolucaoNps passando "hoje" em
// America/Sao_Paulo. Esse caminho com Prisma é integration-only (ver CLAUDE.md).
// Aqui cobrimos as peças puras.

describe('classificarNotaNps — faixa NPS (0–6 detrator / 7–8 neutro / 9–10 promotor)', () => {
  test('limites exatos de cada faixa', () => {
    assert.equal(classificarNotaNps(0), 'detrator')
    assert.equal(classificarNotaNps(6), 'detrator')
    assert.equal(classificarNotaNps(7), 'neutro')
    assert.equal(classificarNotaNps(8), 'neutro')
    assert.equal(classificarNotaNps(9), 'promotor')
    assert.equal(classificarNotaNps(10), 'promotor')
  })

  test('nota fora de 0–10 ou não inteira -> null (nunca entra no cálculo)', () => {
    assert.equal(classificarNotaNps(-1), null)
    assert.equal(classificarNotaNps(11), null)
    assert.equal(classificarNotaNps(7.5), null)
    assert.equal(classificarNotaNps(Number.NaN), null)
  })
})

describe('normalizarGranularidadeEvolucaoNps', () => {
  test("'mensal'/'anual' selecionam o modo; qualquer outra coisa cai em 'trimestral'", () => {
    assert.equal(normalizarGranularidadeEvolucaoNps('mensal'), 'mensal')
    assert.equal(normalizarGranularidadeEvolucaoNps('anual'), 'anual')
    assert.equal(normalizarGranularidadeEvolucaoNps('trimestral'), 'trimestral')
    assert.equal(normalizarGranularidadeEvolucaoNps(undefined), 'trimestral')
    assert.equal(normalizarGranularidadeEvolucaoNps('semanal'), 'trimestral')
  })
})

describe('normalizarAnoEvolucaoNps', () => {
  test('inteiro plausível (2000–2100) -> número; resto -> null', () => {
    assert.equal(normalizarAnoEvolucaoNps('2025'), 2025)
    assert.equal(normalizarAnoEvolucaoNps(2025), 2025)
    assert.equal(normalizarAnoEvolucaoNps(undefined), null)
    assert.equal(normalizarAnoEvolucaoNps(''), null)
    assert.equal(normalizarAnoEvolucaoNps('abc'), null)
    assert.equal(normalizarAnoEvolucaoNps('1999'), null)
    assert.equal(normalizarAnoEvolucaoNps('2101'), null)
    assert.equal(normalizarAnoEvolucaoNps('2025.5'), null)
  })
})

describe('montarEvolucaoNps — ano de referência + comparação ano×ano alinhada', () => {
  // Linha "crua" = (ano, mes, nota, quantidade), como o GROUP BY ano/mes/nota
  // do $queryRaw devolve.
  function r(ano: number, mes: number, nota: number, quantidade: number) {
    return { ano, mes, nota, quantidade }
  }
  // "Hoje" fixo: 2026-09 (mês 9 => trimestre atual 3, ano corrente 2026).
  const HOJE = { ano: 2026, mes: 9 }
  function montar(
    rows: Array<{ ano: number; mes: number; nota: number; quantidade: number }>,
    granularidade: 'mensal' | 'trimestral' | 'anual',
    anoReferencia: number,
    anoComparacao: number | null = null,
    hoje = HOJE,
  ) {
    return montarEvolucaoNps(rows, granularidade, { anoReferencia, anoComparacao, hoje })
  }

  test('ano atual: mostra só sub-períodos com dados ATÉ hoje (sem meses/trimestres futuros); marca o corrente como parcial', () => {
    const rows = [r(2026, 1, 10, 3), r(2026, 8, 10, 3), r(2026, 9, 10, 3), r(2026, 10, 10, 3), r(2026, 12, 10, 3)]
    const mensal = montar(rows, 'mensal', 2026)
    assert.deepEqual(mensal.pontos.map(p => p.bucket), ['2026-01', '2026-08', '2026-09'])
    assert.equal(mensal.pontos.find(p => p.bucket === '2026-09')!.parcial, true)
    assert.equal(mensal.pontos.find(p => p.bucket === '2026-01')!.parcial, false)

    const trimestral = montar([r(2026, 2, 10, 1), r(2026, 8, 10, 1), r(2026, 11, 10, 1)], 'trimestral', 2026)
    assert.deepEqual(trimestral.pontos.map(p => p.bucket), ['2026-Q1', '2026-Q3'])
    assert.equal(trimestral.pontos.find(p => p.bucket === '2026-Q3')!.parcial, true)
  })

  test('ano anterior: mostra TODOS os sub-períodos com dados, nenhum parcial, sem corte de "futuro"', () => {
    const res = montar([r(2025, 2, 10, 1), r(2025, 6, 10, 1), r(2025, 11, 10, 1)], 'mensal', 2025)
    assert.deepEqual(res.pontos.map(p => p.bucket), ['2025-02', '2025-06', '2025-11'])
    assert.equal(res.pontos.every(p => p.parcial === false), true)
    // Ano passado: nem o "mesmo mês de hoje" conta como parcial.
    assert.equal(montar([r(2025, 9, 10, 3)], 'mensal', 2025).pontos[0].parcial, false)
  })

  test('Mensal 2026 × 2025 — alinhado por mês; mês sem dados no ano comparado NÃO é NPS 0', () => {
    const rows = [
      r(2026, 3, 10, 4), // Mar/2026 -> +100
      r(2025, 3, 0, 4), //  Mar/2025 -> -100
      r(2026, 5, 9, 2), r(2026, 5, 3, 2), // Mai/2026 -> 50% - 50% = 0
    ]
    const res = montar(rows, 'mensal', 2026, 2025)
    assert.equal(res.anoReferencia, 2026)
    assert.equal(res.anoComparacao, 2025)

    const mar = res.pontos.find(p => p.bucket === '2026-03')!
    assert.equal(mar.nps, 100)
    assert.equal(mar.comparacao!.ano, 2025)
    assert.equal(mar.comparacao!.label, 'Mar/2025')
    assert.equal(mar.comparacao!.nps, -100)
    assert.equal(mar.comparacao!.variacao, 200) // 100 - (-100)

    const mai = res.pontos.find(p => p.bucket === '2026-05')!
    assert.equal(mai.nps, 0)
    assert.equal(mai.comparacao!.respostas, 0)
    assert.equal(mai.comparacao!.nps, null) // ausência de respostas ≠ NPS 0
    assert.equal(mai.comparacao!.variacao, null)
  })

  test('Trimestral 2026 × 2025 — alinhado por trimestre', () => {
    const rows = [
      r(2026, 2, 10, 6), r(2026, 2, 3, 4), // Q1/2026 -> 60% - 40% = 20
      r(2025, 3, 10, 10), //                  Q1/2025 -> +100
    ]
    const q1 = montar(rows, 'trimestral', 2026, 2025).pontos.find(p => p.bucket === '2026-Q1')!
    assert.equal(q1.nps, 20)
    assert.equal(q1.comparacao!.label, 'Q1/2025')
    assert.equal(q1.comparacao!.nps, 100)
    assert.equal(q1.comparacao!.variacao, -80)
  })

  test('Anual 2026 × 2025 — um bucket; 2026 é o ano corrente => parcial', () => {
    const rows = [
      r(2026, 6, 9, 7), r(2026, 6, 3, 3), // 2026 -> 70% - 30% = 40
      r(2025, 6, 9, 4), r(2025, 6, 3, 6), // 2025 -> 40% - 60% = -20
    ]
    const res = montar(rows, 'anual', 2026, 2025)
    assert.equal(res.pontos.length, 1)
    const p = res.pontos[0]
    assert.deepEqual([p.bucket, p.label, p.rotuloCurto], ['2026', '2026', '2026'])
    assert.equal(p.nps, 40)
    assert.equal(p.parcial, true)
    assert.equal(p.comparacao!.label, '2025')
    assert.equal(p.comparacao!.nps, -20)
    assert.equal(p.comparacao!.variacao, 60) // 40 - (-20)
  })

  test('ano de referência SEM dados -> pontos vazio, mas anosDisponiveis ainda lista os anos com dados', () => {
    const rows = [r(2025, 5, 10, 3)]
    assert.deepEqual(montar(rows, 'mensal', 2024).pontos, [])
    assert.deepEqual(montar(rows, 'anual', 2024).pontos, [])
    assert.deepEqual(montar(rows, 'mensal', 2024).anosDisponiveis, [2025])
  })

  test('impede comparar um ano com ele mesmo', () => {
    const res = montar([r(2026, 3, 10, 3)], 'mensal', 2026, 2026)
    assert.equal(res.anoComparacao, null)
    assert.equal(res.pontos[0].comparacao, null)
  })

  test('ano comparado sem NENHUMA resposta -> comparacao.nps null / respostas 0 / variacao null (nunca 0)', () => {
    const p = montar([r(2026, 3, 10, 3)], 'anual', 2026, 2024).pontos[0]
    assert.equal(p.comparacao!.nps, null)
    assert.equal(p.comparacao!.respostas, 0)
    assert.equal(p.comparacao!.variacao, null)
  })

  test('consistência Mensal/Trimestral/Anual — mesmo total e agregado CRU (nunca média de sub-períodos)', () => {
    const rows = [r(2026, 1, 10, 1), r(2026, 2, 0, 9), r(2026, 5, 9, 5), r(2026, 8, 3, 5)]

    const mensal = montar(rows, 'mensal', 2026)
    assert.deepEqual(mensal.pontos.map(p => [p.rotuloCurto, p.respostas, p.nps]), [
      ['Jan', 1, 100], ['Fev', 9, -100], ['Mai', 5, 100], ['Ago', 5, -100],
    ])

    const trimestral = montar(rows, 'trimestral', 2026)
    assert.deepEqual(trimestral.pontos.map(p => [p.rotuloCurto, p.respostas, p.nps]), [
      ['Q1', 10, -80], // Jan+Fev cru (1 prom / 9 detr), NÃO a média de +100 e -100
      ['Q2', 5, 100],
      ['Q3', 5, -100],
    ])

    const anual = montar(rows, 'anual', 2026)
    assert.deepEqual(anual.pontos.map(p => [p.rotuloCurto, p.respostas, p.nps]), [['2026', 20, -40]])

    assert.equal(mensal.pontos.reduce((s, p) => s + p.respostas, 0), 20)
    assert.equal(trimestral.pontos.reduce((s, p) => s + p.respostas, 0), 20)
    assert.equal(anual.pontos.reduce((s, p) => s + p.respostas, 0), 20)
  })

  test('anosDisponiveis — só anos com resposta VÁLIDA, mais recente primeiro', () => {
    const rows = [r(2024, 1, 10, 1), r(2026, 1, 10, 1), r(2025, 1, 11, 5) /* só nota inválida */, r(2023, 1, 7, 1)]
    assert.deepEqual(montar(rows, 'mensal', 2026).anosDisponiveis, [2026, 2024, 2023])
  })

  test('faixas 0–6 / 7–8 / 9–10 + nota inválida ignorada; normaliza BigInt de quantidade', () => {
    const serie = montarEvolucaoNps([
      { ano: 2026, mes: 1, nota: 6, quantidade: BigInt(3) }, // detrator
      { ano: 2026, mes: 1, nota: 7, quantidade: BigInt(1) }, // neutro
      { ano: 2026, mes: 1, nota: 8, quantidade: BigInt(1) }, // neutro
      { ano: 2026, mes: 1, nota: 9, quantidade: BigInt(4) }, // promotor
      { ano: 2026, mes: 1, nota: 11, quantidade: BigInt(5) }, // inválida -> ignorada
    ], 'mensal', { anoReferencia: 2026, anoComparacao: null, hoje: HOJE }).pontos[0]
    assert.deepEqual(
      { respostas: serie.respostas, promotores: serie.promotores, neutros: serie.neutros, detratores: serie.detratores },
      { respostas: 9, promotores: 4, neutros: 2, detratores: 3 },
    )
    assert.equal(serie.nps, 11) // round(44.4)=44 ; round(33.3)=33 ; 44 - 33
  })
})
