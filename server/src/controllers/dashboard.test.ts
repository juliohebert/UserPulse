import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { montarDesempenhoDestaques } from './dashboard'

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
})
