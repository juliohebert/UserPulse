import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Campanha } from '../../types'
import { chaveGrupoConcorrente, agruparCampanhasConcorrentes, rotuloGrupoConcorrente } from './grupoConcorrente'

function campanha(overrides: Partial<Campanha> & { id: string }): Campanha {
  return {
    id: overrides.id,
    slug: overrides.id,
    titulo: overrides.id,
    subtitulo: null,
    descricao: '',
    tipo: 'comunicado',
    sistema: 'esig',
    tela: 'Agenda',
    imagem_url: null,
    video_url: null,
    texto_botao: null,
    url_botao: null,
    feedback_habilitado: true,
    modo_exibicao: 'modal_automatica',
    gatilho: 'ao_abrir_tela',
    evento: null,
    modo_identificacao: 'sistema_tela',
    data_cy: null,
    url_contem: null,
    atraso_ms: 800,
    mostrar_uma_vez: true,
    prioridade: 0,
    ordem: 0,
    status: 'ATIVA',
    data_inicio: null,
    data_fim: null,
    pergunta_feedback: null,
    observacao_obrigatoria: false,
    exige_confirmacao_leitura: false,
    permitir_fechar_modal: true,
    ...overrides,
  } as Campanha
}

describe('chaveGrupoConcorrente', () => {
  test('sistema_tela: mesma sistema+tela -> mesma chave', () => {
    const a = chaveGrupoConcorrente(campanha({ id: 'a' }))
    const b = chaveGrupoConcorrente(campanha({ id: 'b' }))
    assert.equal(a, b)
    assert.ok(a)
  })

  test('data_cy nunca forma grupo', () => {
    assert.equal(chaveGrupoConcorrente(campanha({ id: 'a', modo_identificacao: 'data_cy' })), null)
  })

  test('url_contem sem valor -> sem grupo', () => {
    assert.equal(chaveGrupoConcorrente(campanha({ id: 'a', modo_identificacao: 'url_contem', url_contem: null })), null)
  })
})

describe('agruparCampanhasConcorrentes', () => {
  test('agrupa por sistema+tela e descarta grupos com 1 único membro', () => {
    const lista = [
      campanha({ id: 'a', tela: 'Agenda' }),
      campanha({ id: 'b', tela: 'Agenda' }),
      campanha({ id: 'c', tela: 'Faturamento' }),
    ]
    const grupos = agruparCampanhasConcorrentes(lista)
    assert.equal(grupos.length, 1)
    assert.deepEqual(grupos[0].campanhas.map(c => c.id), ['a', 'b'])
  })

  test('campanhas em data_cy nunca aparecem em nenhum grupo', () => {
    const lista = [
      campanha({ id: 'a', modo_identificacao: 'data_cy', data_cy: 'botao' }),
      campanha({ id: 'b', modo_identificacao: 'data_cy', data_cy: 'botao' }),
    ]
    assert.deepEqual(agruparCampanhasConcorrentes(lista), [])
  })

  test('lista vazia -> nenhum grupo', () => {
    assert.deepEqual(agruparCampanhasConcorrentes([]), [])
  })
})

describe('rotuloGrupoConcorrente', () => {
  test('sistema_tela -> "sistema · tela"', () => {
    const grupo = { chave: 'x', campanhas: [campanha({ id: 'a', sistema: 'esig', tela: 'Agenda' })] }
    assert.equal(rotuloGrupoConcorrente(grupo), 'esig · Agenda')
  })

  test('url_contem -> inclui o padrão de URL', () => {
    const grupo = {
      chave: 'x',
      campanhas: [campanha({ id: 'a', sistema: 'esig', modo_identificacao: 'url_contem', url_contem: '/agenda', tela: null })],
    }
    assert.equal(rotuloGrupoConcorrente(grupo), 'esig · URL contém "/agenda"')
  })
})
