import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { montarDesempenhoDestaques, whereFeedbackNps, whereUtilidadeDestaque, normalizarDataDashboard, calcularPeriodoAnterior, construirSerieDiaria, chaveDiaDashboard, dataDashboardUtcInicio } from './dashboard'

describe('períodos do dashboard', () => {
  test('normaliza somente datas ISO reais; entradas inválidas são ignoradas', () => {
    assert.equal(normalizarDataDashboard('2026-02-03'), '2026-02-03')
    assert.equal(normalizarDataDashboard('2026-02-30'), null)
    assert.equal(normalizarDataDashboard('03/02/2026'), null)
  })

  test('calcula janela anterior inclusiva com a mesma duração', () => {
    assert.deepEqual(calcularPeriodoAnterior({ inicio: '2026-02-10', fim: '2026-02-16' }), {
      inicio: '2026-02-03', fim: '2026-02-09',
    })
  })

  test('período todo ou incompleto não tem comparação objetiva', () => {
    assert.equal(calcularPeriodoAnterior({ inicio: null, fim: null }), null)
    assert.equal(calcularPeriodoAnterior({ inicio: '2026-02-10', fim: null }), null)
  })

  test('converte limites e eventos para o dia civil de São Paulo', () => {
    assert.equal(dataDashboardUtcInicio('2026-02-01').toISOString(), '2026-02-01T03:00:00.000Z')
    assert.equal(chaveDiaDashboard(new Date('2026-02-02T02:59:59.999Z')), '2026-02-01')
    assert.equal(chaveDiaDashboard(new Date('2026-02-02T03:00:00.000Z')), '2026-02-02')
  })

  test('série diária inclui dias vazios, converte contagens e preserva ordem cronológica', () => {
    const serie = construirSerieDiaria('2026-02-01', '2026-02-03', [
      { data: '2026-02-03', visualizacoes: 2n, respostas: '1', cliques_cta: 0 },
      { data: '2026-02-01', visualizacoes: 5n, respostas: 0n, cliques_cta: 1n },
    ])
    assert.deepEqual(serie, [
      { data: '2026-02-01', visualizacoes: 5, respostas: 0, cliques_cta: 1 },
      { data: '2026-02-02', visualizacoes: 0, respostas: 0, cliques_cta: 0 },
      { data: '2026-02-03', visualizacoes: 2, respostas: 1, cliques_cta: 0 },
    ])
  })

  test('série vazia e linha com contagens zero permanecem zeradas', () => {
    assert.deepEqual(construirSerieDiaria('2026-02-01', '2026-02-01', []), [
      { data: '2026-02-01', visualizacoes: 0, respostas: 0, cliques_cta: 0 },
    ])
    assert.deepEqual(construirSerieDiaria('2026-02-01', '2026-02-01', [
      { data: '2026-02-01', visualizacoes: 0n, respostas: 0n, cliques_cta: 0n },
    ]), [
      { data: '2026-02-01', visualizacoes: 0, respostas: 0, cliques_cta: 0 },
    ])
  })
})

// buscarDashboard() em si é integration-only (várias queries Prisma
// combinadas com Promise.all) — testado manualmente contra um servidor
// local, mesmo limite documentado nas outras suítes deste projeto (ver
// CLAUDE.md). montarDesempenhoDestaques é a função pura que MOLDA o
// resultado — recebe os itens (com ativo) e os dois groupBy já resolvidos
// pelo Prisma (totais por item+tipo, e as combinações distintas
// item+tipo+usuario_id pra contar únicos), nunca toca no banco.

function item(id: string, titulo: string, ativo = true) {
  return { id, titulo, ativo }
}

describe('montarDesempenhoDestaques', () => {
  test('sem eventos -> todos os itens aparecem zerados (não some nenhum)', () => {
    const r = montarDesempenhoDestaques([item('i1', 'Filtro Status'), item('i2', 'Filtro Convênio')], [], [])
    assert.equal(r.length, 2)
    for (const linha of r) {
      assert.equal(linha.visualizacoes, 0)
      assert.equal(linha.visualizacoes_unicas, 0)
      assert.equal(linha.interacoes, 0)
      assert.equal(linha.interacoes_unicas, 0)
      assert.equal(linha.cliques_cta, 0)
      assert.equal(linha.cliques_cta_unicos, 0)
      assert.equal(linha.dispensas, 0)
      assert.equal(linha.dispensas_unicas, 0)
    }
  })

  test('visualizacao/interacao_badge/clique_cta/dispensa — cada tipo cai no campo certo do item certo', () => {
    const itens = [item('i1', 'Filtro Status')]
    const totais = [
      { destaque_item_id: 'i1', tipo_evento: 'visualizacao', _count: { id: 10 } },
      { destaque_item_id: 'i1', tipo_evento: 'interacao_badge', _count: { id: 4 } },
      { destaque_item_id: 'i1', tipo_evento: 'clique_cta', _count: { id: 2 } },
      { destaque_item_id: 'i1', tipo_evento: 'dispensa', _count: { id: 1 } },
    ]
    const r = montarDesempenhoDestaques(itens, totais, [])
    assert.equal(r[0].visualizacoes, 10)
    assert.equal(r[0].interacoes, 4)
    assert.equal(r[0].cliques_cta, 2)
    assert.equal(r[0].dispensas, 1)
  })

  test('usuários únicos: groupBy de 3 colunas já vem deduplicado — cada linha conta 1', () => {
    const itens = [item('i1', 'Filtro Status')]
    // 3 linhas => 3 usuários únicos que visualizaram (é assim que
    // Prisma.groupBy(['destaque_item_id','tipo_evento','usuario_id']) já
    // devolve — uma linha por combinação distinta, nunca repetida).
    const unicos = [
      { destaque_item_id: 'i1', tipo_evento: 'visualizacao', usuario_id: 'u1' },
      { destaque_item_id: 'i1', tipo_evento: 'visualizacao', usuario_id: 'u2' },
      { destaque_item_id: 'i1', tipo_evento: 'visualizacao', usuario_id: 'u3' },
    ]
    const r = montarDesempenhoDestaques(itens, [], unicos)
    assert.equal(r[0].visualizacoes_unicas, 3)
  })

  test('usuários únicos SEM duplicação entre itens — o mesmo usuário interagindo com 2 destaques diferentes conta 1 em CADA item, nunca soma cruzado', () => {
    const itens = [item('i1', 'Filtro Status'), item('i2', 'Filtro Convênio')]
    const unicos = [
      { destaque_item_id: 'i1', tipo_evento: 'visualizacao', usuario_id: 'u1' },
      { destaque_item_id: 'i2', tipo_evento: 'visualizacao', usuario_id: 'u1' },
    ]
    const r = montarDesempenhoDestaques(itens, [], unicos)
    const porId = new Map(r.map(linha => [linha.destaque_item_id, linha]))
    assert.equal(porId.get('i1')!.visualizacoes_unicas, 1)
    assert.equal(porId.get('i2')!.visualizacoes_unicas, 1)
    // A dedupe ENTRE itens (mesmo usuário só conta 1x no total da campanha)
    // é responsabilidade de uma query separada, no nível da campanha (ver
    // buscarDashboard — visualizacoesUnicasArr, que agrupa só por
    // usuario_id, sem destaque_item_id) — não desta função, que é
    // deliberadamente por item.
  })

  test('item inativo (removido da configuração) preserva o histórico — continua na lista com os números certos, marcado ativo:false', () => {
    const itens = [item('i1', 'Filtro Antigo', false)]
    const totais = [{ destaque_item_id: 'i1', tipo_evento: 'visualizacao', _count: { id: 7 } }]
    const unicos = [{ destaque_item_id: 'i1', tipo_evento: 'visualizacao', usuario_id: 'u1' }]
    const r = montarDesempenhoDestaques(itens, totais, unicos)
    assert.equal(r.length, 1)
    assert.equal(r[0].ativo, false)
    assert.equal(r[0].visualizacoes, 7)
    assert.equal(r[0].visualizacoes_unicas, 1)
  })

  test('evento legado com destaque_item_id=null — nunca cria uma linha fantasma nem quebra', () => {
    const itens = [item('i1', 'Filtro Status')]
    const totais = [
      { destaque_item_id: null, tipo_evento: 'visualizacao', _count: { id: 99 } },
      { destaque_item_id: 'i1', tipo_evento: 'visualizacao', _count: { id: 3 } },
    ]
    const unicos = [{ destaque_item_id: null, tipo_evento: 'visualizacao', usuario_id: 'u1' }]
    assert.doesNotThrow(() => montarDesempenhoDestaques(itens, totais, unicos))
    const r = montarDesempenhoDestaques(itens, totais, unicos)
    assert.equal(r.length, 1, 'nenhuma linha extra pro destaque_item_id null')
    assert.equal(r[0].visualizacoes, 3, 'só o total do item real entra, o legado (null) é ignorado')
  })

  test('tipo_evento desconhecido (ignora sem quebrar) — defesa contra dado inesperado', () => {
    const itens = [item('i1', 'Filtro Status')]
    const totais = [{ destaque_item_id: 'i1', tipo_evento: 'tipo_que_nao_existe', _count: { id: 5 } }]
    assert.doesNotThrow(() => montarDesempenhoDestaques(itens, totais, []))
    const r = montarDesempenhoDestaques(itens, totais, [])
    assert.equal(r[0].visualizacoes, 0)
    assert.equal(r[0].interacoes, 0)
  })

  test('lista de itens vazia -> retorna array vazio, mesmo com eventos', () => {
    const totais = [{ destaque_item_id: 'i1', tipo_evento: 'visualizacao', _count: { id: 5 } }]
    const r = montarDesempenhoDestaques([], totais, [])
    assert.deepEqual(r, [])
  })

  test('sem 4º argumento (chamada antiga, 3 argumentos) -> avaliações/sim/não zerados, percentual_util null — nunca quebra quem já chamava assim', () => {
    const r = montarDesempenhoDestaques([item('i1', 'Filtro Status')], [], [])
    assert.equal(r[0].avaliacoes, 0)
    assert.equal(r[0].sim, 0)
    assert.equal(r[0].nao, 0)
    assert.equal(r[0].percentual_util, null)
  })
})

// Avaliações de utilidade ("Essa melhoria foi útil?") por item — 4º
// argumento de montarDesempenhoDestaques, groupBy(['destaque_item_id',
// 'util']) de Feedback com tipo_avaliacao='utilidade_destaque'. Nunca se
// mistura com visualizacoes/interacoes/cliques_cta/dispensas acima (que vêm
// de EventoCampanha, uma tabela completamente diferente).
describe('montarDesempenhoDestaques — avaliações de utilidade (Sim/Não/% útil)', () => {
  function utilidade(destaqueItemId: string | null, util: boolean | null, count: number) {
    return { destaque_item_id: destaqueItemId, util, _count: { id: count } }
  }

  test('agregação Sim/Não por item — cada contagem cai no campo certo', () => {
    const itens = [item('i1', 'Filtro Status')]
    const util = [utilidade('i1', true, 7), utilidade('i1', false, 3)]
    const r = montarDesempenhoDestaques(itens, [], [], util)
    assert.equal(r[0].sim, 7)
    assert.equal(r[0].nao, 3)
    assert.equal(r[0].avaliacoes, 10, 'avaliacoes = sim + nao')
  })

  test('% útil = sim / avaliacoes * 100, arredondado a 1 casa decimal', () => {
    const itens = [item('i1', 'Filtro Status')]
    const util = [utilidade('i1', true, 1), utilidade('i1', false, 2)]
    const r = montarDesempenhoDestaques(itens, [], [], util)
    // 1 / 3 * 100 = 33.333... -> 33.3
    assert.equal(r[0].percentual_util, 33.3)
  })

  test('% útil = 100 quando só há Sim, e 0 quando só há Não (0 é um resultado real aqui, não "sem dado")', () => {
    const itens = [item('i1', 'Só sim'), item('i2', 'Só não')]
    const util = [utilidade('i1', true, 5), utilidade('i2', false, 4)]
    const r = montarDesempenhoDestaques(itens, [], [], util)
    const porId = new Map(r.map(l => [l.destaque_item_id, l]))
    assert.equal(porId.get('i1')!.percentual_util, 100)
    assert.equal(porId.get('i2')!.percentual_util, 0)
  })

  test('item sem avaliação -> avaliacoes=0, sim=0, nao=0, percentual_util=null (nunca NaN nem 0% enganoso)', () => {
    const itens = [item('i1', 'Sem avaliações')]
    const r = montarDesempenhoDestaques(itens, [], [], [])
    assert.equal(r[0].avaliacoes, 0)
    assert.equal(r[0].sim, 0)
    assert.equal(r[0].nao, 0)
    assert.equal(r[0].percentual_util, null)
    assert.equal(Number.isNaN(r[0].percentual_util), false)
  })

  test('item removido (ativo:false) preserva o histórico de avaliações, igual às outras métricas', () => {
    const itens = [item('i1', 'Filtro Antigo', false)]
    const util = [utilidade('i1', true, 2), utilidade('i1', false, 1)]
    const r = montarDesempenhoDestaques(itens, [], [], util)
    assert.equal(r[0].ativo, false)
    assert.equal(r[0].sim, 2)
    assert.equal(r[0].nao, 1)
    assert.equal(r[0].avaliacoes, 3)
  })

  test('isolamento entre itens — avaliação do item A nunca soma no item B', () => {
    const itens = [item('i1', 'A'), item('i2', 'B')]
    const util = [utilidade('i1', true, 10), utilidade('i2', false, 1)]
    const r = montarDesempenhoDestaques(itens, [], [], util)
    const porId = new Map(r.map(l => [l.destaque_item_id, l]))
    assert.equal(porId.get('i1')!.sim, 10)
    assert.equal(porId.get('i1')!.nao, 0)
    assert.equal(porId.get('i2')!.sim, 0)
    assert.equal(porId.get('i2')!.nao, 1)
  })

  test('destaque_item_id null (defesa contra dado inconsistente) -> ignorado, nunca quebra nem cria linha fantasma', () => {
    const itens = [item('i1', 'Filtro Status')]
    const util = [utilidade(null, true, 99), utilidade('i1', true, 2)]
    assert.doesNotThrow(() => montarDesempenhoDestaques(itens, [], [], util))
    const r = montarDesempenhoDestaques(itens, [], [], util)
    assert.equal(r.length, 1)
    assert.equal(r[0].sim, 2, 'só a linha com item real entra; a de destaque_item_id null é ignorada')
  })

  test('não interfere nas métricas de EventoCampanha (visualizacoes/interacoes/cliques_cta/dispensas) — são universos completamente separados', () => {
    const itens = [item('i1', 'Filtro Status')]
    const totais = [{ destaque_item_id: 'i1', tipo_evento: 'visualizacao', _count: { id: 50 } }]
    const util = [utilidade('i1', true, 3), utilidade('i1', false, 2)]
    const r = montarDesempenhoDestaques(itens, totais, [], util)
    assert.equal(r[0].visualizacoes, 50)
    assert.equal(r[0].sim, 3)
    assert.equal(r[0].nao, 2)
  })
})

// Fundação NPS/CSAT/utilidade_destaque — whereFeedbackNps é o filtro único
// usado pelas 4 queries de feedback deste dashboard (aggregate/groupBy nota/
// findMany recentes/groupBy usuario_id). Cobre "queries atuais de NPS
// ignoram outros tipos": qualquer feedback CSAT ou utilidade_destaque que
// vier a existir nunca entra nesses cálculos, porque toda query sempre
// inclui tipo_avaliacao: 'nps' explicitamente — nunca confia em "todo
// feedback desta campanha é NPS".
describe('whereFeedbackNps', () => {
  test('sempre inclui tipo_avaliacao: "nps" junto com o campanha_id — nunca mistura csat/utilidade_destaque no cálculo atual', () => {
    assert.deepEqual(whereFeedbackNps('camp-1'), { campanha_id: 'camp-1', tipo_avaliacao: 'nps' })
  })
})

// Mesmo raciocínio, pra seção "Avaliações dos destaques" — cobre "somente
// utilidade_destaque entra nessa seção" e "NPS continua intacto": os dois
// filtros produzem tipo_avaliacao diferentes (nunca o mesmo valor), então
// nenhuma query que use um dos dois pode acidentalmente enxergar dado do
// outro tipo.
describe('whereUtilidadeDestaque', () => {
  test('sempre inclui tipo_avaliacao: "utilidade_destaque" junto com o campanha_id', () => {
    assert.deepEqual(whereUtilidadeDestaque('camp-1'), { campanha_id: 'camp-1', tipo_avaliacao: 'utilidade_destaque' })
  })

  test('nunca produz o mesmo filtro de whereFeedbackNps pra mesma campanha — NPS e utilidade_destaque são universos disjuntos', () => {
    const filtroNps = whereFeedbackNps('camp-1')
    const filtroUtil = whereUtilidadeDestaque('camp-1')
    assert.notEqual(filtroNps.tipo_avaliacao, filtroUtil.tipo_avaliacao)
  })
})
