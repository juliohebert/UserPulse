import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { conteudoEventoIdentificado, rotuloConteudoEvento, type ConteudoInfo } from './interacoesConteudo'

// Módulo puro (sem React/import.meta) — mesmo padrão de dashboardBlocos.ts,
// rodável com node:test. Cobre o rótulo da coluna/campo "Conteúdo" da seção
// "Interações" do dashboard de campanhas.

const info = (): Map<string, ConteudoInfo> => new Map([
  ['c1', { ordem: 1, titulo: 'Nova agenda online' }],
  ['c2', { ordem: 2, titulo: 'QuarkClinic - Agendamento Online' }],
])

describe('rotuloConteudoEvento', () => {
  test('clique_cta com id resolvido -> "ordem · título"', () => {
    assert.equal(rotuloConteudoEvento('clique_cta', 'c2', info()), '2 · QuarkClinic - Agendamento Online')
    assert.equal(rotuloConteudoEvento('clique_cta', 'c1', info()), '1 · Nova agenda online')
  })

  test('clique_cta sem id (null) -> "Não identificado"', () => {
    assert.equal(rotuloConteudoEvento('clique_cta', null, info()), 'Não identificado')
  })

  test('clique_cta com id não encontrado (conteúdo removido) -> "Não identificado"', () => {
    assert.equal(rotuloConteudoEvento('clique_cta', 'c-removido', info()), 'Não identificado')
  })

  test('evento que não é clique_cta -> "—" (mesmo que traga um conteudo_item_id por acaso)', () => {
    assert.equal(rotuloConteudoEvento('visualizacao', null, info()), '—')
    assert.equal(rotuloConteudoEvento('dispensa', null, info()), '—')
    assert.equal(rotuloConteudoEvento('interacao_badge', 'c1', info()), '—')
  })
})

describe('conteudoEventoIdentificado', () => {
  test('true só para clique_cta com id presente no mapa', () => {
    assert.equal(conteudoEventoIdentificado('clique_cta', 'c1', info()), true)
  })
  test('false para clique_cta sem id, id desconhecido, ou outro tipo de evento', () => {
    assert.equal(conteudoEventoIdentificado('clique_cta', null, info()), false)
    assert.equal(conteudoEventoIdentificado('clique_cta', 'c-removido', info()), false)
    assert.equal(conteudoEventoIdentificado('visualizacao', 'c1', info()), false)
  })
})
