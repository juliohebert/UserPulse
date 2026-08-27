import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { montarDesempenhoConteudos, montarDesempenhoDestaques, normalizarAtividadeDiaSemana, normalizarSerieImpressao, whereFeedbackNps, whereUtilidadeDestaque } from './dashboard'

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

describe('agregados visuais do dashboard', () => {
  test('normaliza contagens do Prisma e datas do gráfico sem perder valores grandes', () => {
    assert.deepEqual(normalizarSerieImpressao([
      { data: new Date('2026-08-18T03:00:00.000Z'), visualizacoes: BigInt(900) },
    ]), [{ data: '2026-08-18', visualizacoes: 900 }])
  })

  test('normaliza dia da semana preservando o valor agregado', () => {
    const r = normalizarAtividadeDiaSemana([
      { dia: '2', visualizacoes: BigInt(194) },
      { dia: 5, visualizacoes: 3 },
    ])
    assert.equal(r.length, 7)
    assert.deepEqual(r.slice(0, 2), [{ dia: 2, visualizacoes: 194 }, { dia: 5, visualizacoes: 3 }])
  })

  test('normaliza borda de meia-noite no fuso America/Sao_Paulo, não no UTC', () => {
    assert.deepEqual(normalizarSerieImpressao([
      { data: new Date('2026-08-18T02:59:59.999Z'), visualizacoes: 1 },
      { data: new Date('2026-08-18T03:00:00.000Z'), visualizacoes: 2 },
    ]), [
      { data: '2026-08-17', visualizacoes: 1 },
      { data: '2026-08-18', visualizacoes: 2 },
    ])
  })

  test('preserva data civil devolvida pelo bucket SQL em Sao Paulo', () => {
    assert.deepEqual(normalizarSerieImpressao([
      { data: '2026-08-18', visualizacoes: 3 },
    ]), [{ data: '2026-08-18', visualizacoes: 3 }])
  })
})

// ─── Etapa 4 — desempenho por conteúdo (montarDesempenhoConteudos) ──────────
// Mesma natureza de montarDesempenhoDestaques: função pura que MOLDA o
// resultado a partir dos itens (ordenados por `ordem` ASC pelo caller) + dois
// groupBy já resolvidos pelo Prisma (totais clique_cta por conteúdo, e as
// combinações distintas conteudo_item_id+tipo_evento+usuario_id pra únicos).
// V1: só clique_cta, sem CTR, sem visualização por item.
function conteudo(id: string, titulo: string, ordem: number, url_botao: string | null = 'https://x.com') {
  return { id, titulo, ordem, url_botao }
}
function total(conteudo_item_id: string | null, count: number, tipo_evento = 'clique_cta') {
  return { conteudo_item_id, tipo_evento, _count: { id: count } }
}
function unico(conteudo_item_id: string | null, usuario_id: string | null, tipo_evento = 'clique_cta') {
  return { conteudo_item_id, tipo_evento, usuario_id }
}

describe('montarDesempenhoConteudos', () => {
  test('lista de itens vazia -> array vazio, mesmo com eventos soltos', () => {
    const r = montarDesempenhoConteudos([], [total('c1', 5)], [unico('c1', 'u1')])
    assert.deepEqual(r, [])
  })

  test('vários conteúdos com contagens diferentes — cada total cai no conteúdo certo', () => {
    const itens = [conteudo('c1', 'Primeiro', 1), conteudo('c2', 'Segundo', 2), conteudo('c3', 'Terceiro', 3)]
    const totais = [total('c1', 7), total('c2', 2), total('c3', 0)]
    const r = montarDesempenhoConteudos(itens, totais, [])
    const porId = new Map(r.map(l => [l.conteudo_item_id, l]))
    assert.equal(porId.get('c1')!.cliques_cta, 7)
    assert.equal(porId.get('c2')!.cliques_cta, 2)
    assert.equal(porId.get('c3')!.cliques_cta, 0)
  })

  test('conteúdo com zero cliques permanece no resultado (nunca some)', () => {
    const r = montarDesempenhoConteudos([conteudo('c1', 'A', 1), conteudo('c2', 'B', 2)], [total('c1', 3)], [unico('c1', 'u1')])
    assert.equal(r.length, 2)
    const c2 = r.find(l => l.conteudo_item_id === 'c2')!
    assert.equal(c2.cliques_cta, 0)
    assert.equal(c2.cliques_cta_unicos, 0)
  })

  test('únicos isolados por conteúdo — o mesmo usuário clicando em 2 conteúdos conta 1 em CADA, nunca soma cruzado', () => {
    const itens = [conteudo('c1', 'A', 1), conteudo('c2', 'B', 2)]
    const unicos = [
      unico('c1', 'u1'), unico('c1', 'u2'),
      unico('c2', 'u1'),
    ]
    const r = montarDesempenhoConteudos(itens, [], unicos)
    const porId = new Map(r.map(l => [l.conteudo_item_id, l]))
    assert.equal(porId.get('c1')!.cliques_cta_unicos, 2)
    assert.equal(porId.get('c2')!.cliques_cta_unicos, 1)
  })

  test('conteúdo sem CTA (url_botao null) -> tem_cta false', () => {
    const r = montarDesempenhoConteudos([conteudo('c1', 'Sem CTA', 1, null)], [], [])
    assert.equal(r[0].tem_cta, false)
  })

  test('url_botao preenchida com texto_botao vazio -> tem_cta true (texto pode cair no default "Saiba mais")', () => {
    // montarDesempenhoConteudos só recebe url_botao — o texto nem chega aqui.
    const r = montarDesempenhoConteudos([conteudo('c1', 'Com CTA', 1, 'https://exemplo.com')], [], [])
    assert.equal(r[0].tem_cta, true)
  })

  test('url_botao string vazia / só espaços -> tem_cta false', () => {
    const r = montarDesempenhoConteudos(
      [conteudo('c1', 'A', 1, ''), conteudo('c2', 'B', 2, '   ')],
      [], [],
    )
    assert.equal(r[0].tem_cta, false)
    assert.equal(r[1].tem_cta, false)
  })

  test('ordem de saída preserva a ordem de entrada (itens já vêm por `ordem` ASC do caller)', () => {
    const itens = [conteudo('c3', 'Terceiro', 3), conteudo('c1', 'Primeiro', 1), conteudo('c2', 'Segundo', 2)]
    const r = montarDesempenhoConteudos(itens, [], [])
    assert.deepEqual(r.map(l => l.conteudo_item_id), ['c3', 'c1', 'c2'])
    assert.deepEqual(r.map(l => l.ordem), [3, 1, 2])
  })

  test('bucket null (evento antigo / fallback / conteúdo removido) nunca vira uma linha de conteúdo', () => {
    const itens = [conteudo('c1', 'A', 1)]
    const totais = [total(null, 99), total('c1', 4)]
    const unicos = [unico(null, 'u1'), unico('c1', 'u1')]
    const r = montarDesempenhoConteudos(itens, totais, unicos)
    assert.equal(r.length, 1)
    assert.equal(r[0].conteudo_item_id, 'c1')
    assert.equal(r[0].cliques_cta, 4)
    assert.equal(r[0].cliques_cta_unicos, 1)
  })

  test('id de total/único que não está na lista de itens é ignorado (defesa contra dado inconsistente)', () => {
    const r = montarDesempenhoConteudos([conteudo('c1', 'A', 1)], [total('c-fantasma', 10)], [unico('c-fantasma', 'u1')])
    assert.equal(r.length, 1)
    assert.equal(r[0].cliques_cta, 0)
  })

  test('tipo_evento diferente de clique_cta é ignorado (defesa extra — as queries já filtram)', () => {
    const itens = [conteudo('c1', 'A', 1)]
    const totais = [total('c1', 8, 'visualizacao'), total('c1', 3, 'clique_cta')]
    const unicos = [unico('c1', 'u1', 'visualizacao'), unico('c1', 'u2', 'clique_cta')]
    const r = montarDesempenhoConteudos(itens, totais, unicos)
    assert.equal(r[0].cliques_cta, 3)
    assert.equal(r[0].cliques_cta_unicos, 1)
  })
})
