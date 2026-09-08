import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Campanha, CampanhaRegraExibicao } from '../../types'
import { chavesGrupoConcorrente, agruparCampanhasConcorrentes, rotuloGrupoConcorrente } from './grupoConcorrente'

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

function regra(o: Partial<CampanhaRegraExibicao>): CampanhaRegraExibicao {
  return { id: 'r', campanha_id: 'c', modo_identificacao: 'sistema_tela', tela: null, url_contem: null, data_cy: null, ordem: 0, ...o }
}
const concorrem = (a: Campanha, b: Campanha) =>
  chavesGrupoConcorrente(a).some(k => chavesGrupoConcorrente(b).includes(k))

describe('chavesGrupoConcorrente — conjunto de chaves (1 por regra)', () => {
  test('sem `regras`: mesma sistema+tela -> concorrem', () => {
    assert.equal(concorrem(campanha({ id: 'a' }), campanha({ id: 'b' })), true)
  })

  test('sem `regras`: data_cy AGORA forma grupo (mesmo sistema + mesmo data-cy)', () => {
    const a = campanha({ id: 'a', modo_identificacao: 'data_cy', data_cy: 'botao', tela: null })
    const b = campanha({ id: 'b', modo_identificacao: 'data_cy', data_cy: 'botao', tela: null })
    assert.equal(concorrem(a, b), true)
  })

  test('sem `regras`: url_contem sem valor -> nenhuma chave', () => {
    assert.deepEqual(chavesGrupoConcorrente(campanha({ id: 'a', modo_identificacao: 'url_contem', url_contem: null, tela: null })), [])
  })

  test('com `regras`: concorrência só por tela ADICIONAL', () => {
    const a = campanha({ id: 'a', tela: 'Agenda', regras: [regra({ tela: 'Agenda' }), regra({ tela: 'Config', ordem: 1 })] })
    const b = campanha({ id: 'b', tela: 'Home', regras: [regra({ tela: 'Home' }), regra({ tela: 'Config', ordem: 1 })] })
    assert.equal(concorrem(a, b), true)
  })

  test('com `regras`: sem regra em comum -> não concorrem', () => {
    const a = campanha({ id: 'a', regras: [regra({ tela: 'Agenda' }), regra({ tela: 'Config', ordem: 1 })] })
    const b = campanha({ id: 'b', regras: [regra({ tela: 'Home' }), regra({ tela: 'Relatorios', ordem: 1 })] })
    assert.equal(concorrem(a, b), false)
  })

  test('regras coincidentes duplicadas -> chave dedup', () => {
    const a = campanha({ id: 'a', regras: [regra({ tela: 'Agenda' }), regra({ tela: 'Agenda', ordem: 1 })] })
    assert.deepEqual(chavesGrupoConcorrente(a), ['esig::tela::Agenda::ao_abrir_tela'])
  })
})

describe('agruparCampanhasConcorrentes', () => {
  test('agrupa por chave e descarta grupos com 1 único membro', () => {
    const grupos = agruparCampanhasConcorrentes([
      campanha({ id: 'a', tela: 'Agenda' }),
      campanha({ id: 'b', tela: 'Agenda' }),
      campanha({ id: 'c', tela: 'Faturamento' }),
    ])
    assert.equal(grupos.length, 1)
    assert.deepEqual(grupos[0].campanhas.map(c => c.id), ['a', 'b'])
  })

  test('concorrência por tela adicional forma o grupo', () => {
    const grupos = agruparCampanhasConcorrentes([
      campanha({ id: 'a', tela: 'Agenda', regras: [regra({ tela: 'Agenda' }), regra({ tela: 'Config', ordem: 1 })] }),
      campanha({ id: 'b', tela: 'Home', regras: [regra({ tela: 'Home' }), regra({ tela: 'Config', ordem: 1 })] }),
    ])
    const configGrupo = grupos.find(g => g.chave === 'esig::tela::Config::ao_abrir_tela')
    assert.ok(configGrupo)
    assert.deepEqual(configGrupo!.campanhas.map(c => c.id).sort(), ['a', 'b'])
  })

  test('mais de uma regra em comum não duplica a campanha no grupo', () => {
    const grupos = agruparCampanhasConcorrentes([
      campanha({ id: 'a', regras: [regra({ tela: 'X' }), regra({ tela: 'X', ordem: 1 })] }),
      campanha({ id: 'b', regras: [regra({ tela: 'X' })] }),
    ])
    const g = grupos.find(x => x.chave === 'esig::tela::X::ao_abrir_tela')!
    assert.deepEqual(g.campanhas.map(c => c.id), ['a', 'b'])
  })

  test('lista vazia -> nenhum grupo', () => {
    assert.deepEqual(agruparCampanhasConcorrentes([]), [])
  })
})

describe('rotuloGrupoConcorrente — derivado da própria chave', () => {
  test('sistema_tela -> "sistema · tela"', () => {
    assert.equal(rotuloGrupoConcorrente({ chave: 'esig::tela::Agenda::ao_abrir_tela', campanhas: [] }), 'esig · Agenda')
  })
  test('url_contem -> inclui o padrão de URL', () => {
    assert.equal(rotuloGrupoConcorrente({ chave: 'esig::url::/agenda::ao_abrir_tela', campanhas: [] }), 'esig · URL contém "/agenda"')
  })
  test('data_cy -> inclui o seletor', () => {
    assert.equal(rotuloGrupoConcorrente({ chave: 'esig::datacy::btn-x::ao_abrir_tela', campanhas: [] }), 'esig · elemento [data-cy="btn-x"]')
  })
})
