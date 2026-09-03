import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Campanha } from '../../types'
import {
  FORMATO_DESTAQUE_ELEMENTO,
  formInicial,
  resolverTipoDestino,
  resolverModoSegmentacao,
  hidratarFormState,
  montarPayloadCampanha,
  rotaEditarCampanha,
  getStatus,
  resolverModoInicio,
  resolverModoFim,
  separarDataHora,
  combinarDataHoraISO,
  corSistemaValida,
  corSistemaTranslucida,
  extrairDriveFileId,
  normalizarImagemUrl,
  type FormState,
} from './campanhaForm.utils'

// Compat com campanhas antigas criadas pelo Form.tsx legado (rotaEditarCampanha
// passou a enviar TODAS as campanhas pro formulário canônico). Estas suítes cobrem
// só a lógica pura (sem Prisma/DB/React) — hidratação (GET -> FormState) e
// geração de payload (FormState -> POST/PUT); a integração real com o
// backend é validada manualmente contra um servidor local, mesmo padrão das
// outras suítes do projeto (ver CLAUDE.md).

// Campanha "completa" — todos os campos preenchidos com valores não-default,
// pra qualquer `?? ''`/fallback silencioso em hidratarFormState/
// montarPayloadCampanha aparecer nos asserts abaixo em vez de passar
// despercebido atrás de um valor que já seria vazio de qualquer forma.
function campanhaAntiga(over: Partial<Campanha> = {}): Campanha {
  return {
    id: 'camp-1',
    slug: 'campanha-antiga',
    titulo: 'Pesquisa de satisfação Q4',
    subtitulo: 'Novidade disponível',
    descricao: 'Conte pra gente o que achou.',
    tipo: 'pesquisa',
    sistema: 'erp',
    tela: 'Faturamento',
    imagem_url: 'https://exemplo.com/imagem.png',
    video_url: null,
    texto_botao: 'Responder agora',
    url_botao: 'https://exemplo.com/pesquisa',
    feedback_habilitado: true,
    modo_exibicao: 'modal_automatica',
    gatilho: 'ao_abrir_tela',
    evento: null,
    modo_identificacao: 'sistema_tela',
    data_cy: null,
    url_contem: null,
    atraso_ms: 800,
    mostrar_uma_vez: true,
    prioridade: 5,
    ordem: 2,
    status: 'ATIVA',
    data_inicio: '2026-01-10',
    data_fim: '2026-02-10',
    pergunta_feedback: 'De 0 a 10, quanto você recomendaria?',
    observacao_obrigatoria: false,
    exige_confirmacao_leitura: false,
    permitir_fechar_modal: true,
    intervalo_reexibicao_dias: 30,
    politica_reexibicao: 'reexibir_apos_dias',
    reexibir_apos_dias: 30,
    encerrar_apos_evento: true,
    evento_conclusao: 'pesquisa_respondida',
    segmentar_cliente_ids: ['cliente-1', 'cliente-2'],
    segmentar_unidade_ids: ['unidade-1'],
    segmentar_perfis: ['gestor'],
    segmentar_usuario_tipos: ['admin'],
    segmentar_estados: ['SP', 'RJ'],
    modo_navegacao: 'SCROLL',
    criado_em: '2026-01-01T00:00:00.000Z',
    atualizado_em: '2026-01-05T00:00:00.000Z',
    ...over,
  }
}

describe('rotaEditarCampanha — sempre o formulário canônico', () => {
  // A rota canônica renderiza o CampanhaFormIndex (App.tsx) — Form.tsx
  // legado já foi removido do repositório.
  test('modo_exibicao modal_automatica -> /campanhas/:id/editar', () => {
    assert.equal(rotaEditarCampanha(campanhaAntiga({ id: 'c1', modo_exibicao: 'modal_automatica' })), '/campanhas/c1/editar')
  })

  test('modo_exibicao destaque_elemento -> /campanhas/:id/editar', () => {
    assert.equal(rotaEditarCampanha(campanhaAntiga({ id: 'c2', modo_exibicao: FORMATO_DESTAQUE_ELEMENTO })), '/campanhas/c2/editar')
  })

  test('qualquer outro modo_exibicao (ex.: formato legado desativado) -> ainda /campanhas/:id/editar', () => {
    assert.equal(rotaEditarCampanha(campanhaAntiga({ id: 'c3', modo_exibicao: 'banner' })), '/campanhas/c3/editar')
  })
})

describe('resolverTipoDestino', () => {
  test('gatilho apos_evento -> acao, independente de modo_identificacao', () => {
    assert.equal(resolverTipoDestino({ gatilho: 'apos_evento', modo_identificacao: 'sistema_tela' }), 'acao')
    assert.equal(resolverTipoDestino({ gatilho: 'apos_evento', modo_identificacao: 'url_contem' }), 'acao')
  })

  test('modo_identificacao data_cy -> data_cy', () => {
    assert.equal(resolverTipoDestino({ gatilho: 'ao_abrir_tela', modo_identificacao: 'data_cy' }), 'data_cy')
  })

  test('modo_identificacao url_contem -> url (bug corrigido: antes caía em "tela")', () => {
    assert.equal(resolverTipoDestino({ gatilho: 'ao_abrir_tela', modo_identificacao: 'url_contem' }), 'url')
  })

  test('modo_identificacao sistema_tela -> tela', () => {
    assert.equal(resolverTipoDestino({ gatilho: 'ao_abrir_tela', modo_identificacao: 'sistema_tela' }), 'tela')
  })
})

describe('resolverModoSegmentacao', () => {
  test('todos os 5 arrays vazios -> todos', () => {
    assert.equal(resolverModoSegmentacao(formInicial), 'todos')
  })

  test('só segmentar_cliente_ids -> cliente', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_cliente_ids: ['c1'] }), 'cliente')
  })

  test('só segmentar_unidade_ids -> cliente', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_unidade_ids: ['u1'] }), 'cliente')
  })

  test('cliente_ids + unidade_ids -> cliente', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_cliente_ids: ['c1'], segmentar_unidade_ids: ['u1'] }), 'cliente')
  })

  test('só segmentar_perfis -> perfil', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_perfis: ['gestor'] }), 'perfil')
  })

  test('só segmentar_usuario_tipos -> perfil', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_usuario_tipos: ['admin'] }), 'perfil')
  })

  test('só segmentar_estados -> perfil', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_estados: ['SP'] }), 'perfil')
  })

  test('lado cliente E lado perfil preenchidos -> combinada', () => {
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_cliente_ids: ['c1'], segmentar_perfis: ['gestor'] }), 'combinada')
    assert.equal(resolverModoSegmentacao({ ...formInicial, segmentar_unidade_ids: ['u1'], segmentar_estados: ['SP'] }), 'combinada')
  })
})

describe('hidratarFormState — url_contem (campanha antiga por destino de URL)', () => {
  test('detecta e carrega modo_identificacao=url_contem e o valor de url_contem', () => {
    const c = campanhaAntiga({ modo_identificacao: 'url_contem', url_contem: '/app/faturamento', tela: '' })
    const form = hidratarFormState(c)
    assert.equal(form.modo_identificacao, 'url_contem')
    assert.equal(form.url_contem, '/app/faturamento')
    assert.equal(resolverTipoDestino(form), 'url')
  })
})

describe('hidratarFormState — tela livre (fora do catálogo)', () => {
  test('carrega o valor de tela mesmo que não exista em nenhum catálogo (hidratação não valida contra catálogo)', () => {
    const c = campanhaAntiga({ tela: 'Tela Antiga Sem Catálogo' })
    const form = hidratarFormState(c)
    assert.equal(form.tela, 'Tela Antiga Sem Catálogo')
  })
})

describe('hidratarFormState — vigência', () => {
  test('carrega data_inicio/data_fim (cru) quando presentes', () => {
    const c = campanhaAntiga({ data_inicio: '2026-03-01', data_fim: '2026-03-31' })
    const form = hidratarFormState(c)
    assert.equal(form.data_inicio, '2026-03-01')
    assert.equal(form.data_fim, '2026-03-31')
  })

  test('null vira string vazia (nunca undefined/null solto no estado)', () => {
    const c = campanhaAntiga({ data_inicio: null, data_fim: null })
    const form = hidratarFormState(c)
    assert.equal(form.data_inicio, '')
    assert.equal(form.data_fim, '')
  })

  // Etapa 2 — modo + (data, hora)
  test('sem datas -> imediato + sem_data, pares vazios (compat campanha antiga)', () => {
    const form = hidratarFormState(campanhaAntiga({ data_inicio: null, data_fim: null }))
    assert.equal(form.modo_inicio, 'imediato')
    assert.equal(form.modo_fim, 'sem_data')
    assert.equal(form.data_inicio_data, '')
    assert.equal(form.data_inicio_hora, '')
    assert.equal(form.data_fim_data, '')
    assert.equal(form.data_fim_hora, '')
  })

  test('só início (date-only legado) -> agendado + data literal, hora vazia; fim continua sem_data', () => {
    const form = hidratarFormState(campanhaAntiga({ data_inicio: '2026-05-01', data_fim: null }))
    assert.equal(form.modo_inicio, 'agendado')
    assert.equal(form.data_inicio_data, '2026-05-01')
    assert.equal(form.data_inicio_hora, '')
    assert.equal(form.modo_fim, 'sem_data')
  })

  test('só fim -> em_data; início continua imediato', () => {
    const form = hidratarFormState(campanhaAntiga({ data_inicio: null, data_fim: '2026-06-30' }))
    assert.equal(form.modo_inicio, 'imediato')
    assert.equal(form.modo_fim, 'em_data')
    assert.equal(form.data_fim_data, '2026-06-30')
  })

  test('início + fim -> os dois modos ativos, independentes', () => {
    const form = hidratarFormState(campanhaAntiga({ data_inicio: '2026-05-01', data_fim: '2026-06-30' }))
    assert.equal(form.modo_inicio, 'agendado')
    assert.equal(form.modo_fim, 'em_data')
  })

  test('ISO com hora (UTC) -> separa data/hora no wall-clock de America/Sao_Paulo', () => {
    // 12:30Z = 09:30 em São Paulo (UTC-03:00 o ano todo).
    const form = hidratarFormState(campanhaAntiga({ data_inicio: '2026-05-01T12:30:00.000Z', data_fim: null }))
    assert.equal(form.data_inicio_data, '2026-05-01')
    assert.equal(form.data_inicio_hora, '09:30')
  })
})

describe('hidratarFormState — feedback + confirmação simultâneos', () => {
  test('campanha antiga com feedback_habilitado=true E exige_confirmacao_leitura=true carrega os dois como true', () => {
    const c = campanhaAntiga({ feedback_habilitado: true, exige_confirmacao_leitura: true, observacao_obrigatoria: true })
    const form = hidratarFormState(c)
    assert.equal(form.feedback_habilitado, true)
    assert.equal(form.exige_confirmacao_leitura, true)
    assert.equal(form.observacao_obrigatoria, true)
  })
})

describe('hidratarFormState — NPS/CTA/segmentação/reexibição/evento', () => {
  test('tipo pesquisa (NPS) + pergunta_feedback carregados', () => {
    const c = campanhaAntiga({ tipo: 'pesquisa', pergunta_feedback: 'De 0 a 10...' })
    const form = hidratarFormState(c)
    assert.equal(form.tipo, 'pesquisa')
    assert.equal(form.pergunta_feedback, 'De 0 a 10...')
  })

  test('CTA habilitado quando texto_botao OU url_botao presentes', () => {
    assert.equal(hidratarFormState(campanhaAntiga({ texto_botao: 'Ver', url_botao: null })).cta_habilitado, true)
    assert.equal(hidratarFormState(campanhaAntiga({ texto_botao: null, url_botao: 'https://x.com' })).cta_habilitado, true)
    assert.equal(hidratarFormState(campanhaAntiga({ texto_botao: null, url_botao: null })).cta_habilitado, false)
  })

  test('segmentação: os 5 arrays são carregados 1:1', () => {
    const c = campanhaAntiga({
      segmentar_cliente_ids: ['a'], segmentar_unidade_ids: ['b'], segmentar_perfis: ['c'],
      segmentar_usuario_tipos: ['d'], segmentar_estados: ['e'],
    })
    const form = hidratarFormState(c)
    assert.deepEqual(form.segmentar_cliente_ids, ['a'])
    assert.deepEqual(form.segmentar_unidade_ids, ['b'])
    assert.deepEqual(form.segmentar_perfis, ['c'])
    assert.deepEqual(form.segmentar_usuario_tipos, ['d'])
    assert.deepEqual(form.segmentar_estados, ['e'])
  })

  test('reexibição: politica_reexibicao e reexibir_apos_dias carregados', () => {
    const c = campanhaAntiga({ politica_reexibicao: 'ate_responder_ou_confirmar', reexibir_apos_dias: null })
    const form = hidratarFormState(c)
    assert.equal(form.politica_reexibicao, 'ate_responder_ou_confirmar')
    assert.equal(form.reexibir_apos_dias, '')
  })

  test('evento/gatilho: campanha "apos_evento" carrega evento e encerramento por evento', () => {
    const c = campanhaAntiga({ gatilho: 'apos_evento', evento: 'checkout_concluido', encerrar_apos_evento: true, evento_conclusao: 'usou_nova_agenda' })
    const form = hidratarFormState(c)
    assert.equal(form.gatilho, 'apos_evento')
    assert.equal(form.evento, 'checkout_concluido')
    assert.equal(form.encerrar_apos_evento, true)
    assert.equal(form.evento_conclusao, 'usou_nova_agenda')
  })
})

describe('hidratarFormState — múltiplos destaques', () => {
  test('carrega destaques[] preservando o id de cada item', () => {
    const c = campanhaAntiga({
      modo_exibicao: FORMATO_DESTAQUE_ELEMENTO,
      destaques: [
        { id: 'item-1', campanha_id: 'camp-1', ordem: 1, data_cy: 'filtro-status', texto_badge: 'Novo', titulo: 'Status', descricao: 'd1', texto_botao: null, url_botao: null, ativo: true, criado_em: '', atualizado_em: '' },
        { id: 'item-2', campanha_id: 'camp-1', ordem: 2, data_cy: 'filtro-profissional', texto_badge: 'Novo', titulo: 'Profissional', descricao: 'd2', texto_botao: null, url_botao: null, ativo: true, criado_em: '', atualizado_em: '' },
      ],
    })
    const form = hidratarFormState(c)
    assert.equal(form.destaques.length, 2)
    assert.equal(form.destaques[0].id, 'item-1')
    assert.equal(form.destaques[1].id, 'item-2')
  })

  test('sem destaques[] mas com data_cy legado -> fallback de 1 pseudo-item sem id', () => {
    const c = campanhaAntiga({ modo_exibicao: FORMATO_DESTAQUE_ELEMENTO, data_cy: 'botao-salvar', destaques: [] })
    const form = hidratarFormState(c)
    assert.equal(form.destaques.length, 1)
    assert.equal(form.destaques[0].id, undefined)
    assert.equal(form.destaques[0].data_cy, 'botao-salvar')
  })
})

describe('montarPayloadCampanha — feedback + confirmação (bug corrigido)', () => {
  test('feedback_habilitado=true e exige_confirmacao_leitura=true não zera feedback_habilitado', () => {
    const form: FormState = { ...formInicial, feedback_habilitado: true, exige_confirmacao_leitura: true, permitir_fechar_modal: true }
    const payload = montarPayloadCampanha(form)
    assert.equal(payload.feedback_habilitado, true)
    assert.equal(payload.exige_confirmacao_leitura, true)
  })

  test('observacao_obrigatoria=true com exige_confirmacao_leitura=true não é zerada', () => {
    const form: FormState = { ...formInicial, feedback_habilitado: true, observacao_obrigatoria: true, exige_confirmacao_leitura: true, permitir_fechar_modal: true }
    const payload = montarPayloadCampanha(form)
    assert.equal(payload.observacao_obrigatoria, true)
  })

  test('sem nenhuma saída (permitir_fechar_modal=false, feedback=false, confirmação=false) força permitir_fechar_modal=true (rede de segurança preservada)', () => {
    const form: FormState = { ...formInicial, feedback_habilitado: false, exige_confirmacao_leitura: false, permitir_fechar_modal: false }
    const payload = montarPayloadCampanha(form)
    assert.equal(payload.permitir_fechar_modal, true)
  })
})

describe('montarPayloadCampanha — url_contem', () => {
  test('preserva modo_identificacao=url_contem e normaliza a URL completa pro caminho', () => {
    const form: FormState = { ...formInicial, modo_identificacao: 'url_contem', url_contem: 'https://cliente.com/app/faturamento', tela: '' }
    const payload = montarPayloadCampanha(form)
    assert.equal(payload.modo_identificacao, 'url_contem')
    assert.equal(payload.url_contem, '/app/faturamento')
    assert.equal(payload.tela, '')
  })

  test('caminho relativo já normalizado é preservado como está', () => {
    const form: FormState = { ...formInicial, modo_identificacao: 'url_contem', url_contem: '/app/faturamento' }
    const payload = montarPayloadCampanha(form)
    assert.equal(payload.url_contem, '/app/faturamento')
  })
})

describe('round-trip: campanha antiga -> hidratar -> salvar sem alterações', () => {
  test('preserva feedback + confirmação simultâneos', () => {
    const original = campanhaAntiga({ feedback_habilitado: true, exige_confirmacao_leitura: true, observacao_obrigatoria: true, permitir_fechar_modal: false })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.feedback_habilitado, true)
    assert.equal(payload.exige_confirmacao_leitura, true)
    assert.equal(payload.observacao_obrigatoria, true)
  })

  test('preserva url_contem', () => {
    const original = campanhaAntiga({ modo_identificacao: 'url_contem', url_contem: '/app/faturamento', tela: '' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.modo_identificacao, 'url_contem')
    assert.equal(payload.url_contem, '/app/faturamento')
  })

  test('preserva tela livre fora do catálogo', () => {
    const original = campanhaAntiga({ tela: 'Tela Antiga Sem Catálogo', modo_identificacao: 'sistema_tela' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.tela, 'Tela Antiga Sem Catálogo')
  })

  test('preserva vigência (data_inicio/data_fim)', () => {
    // Etapa 2 — um valor date-only legado é normalizado pra ISO com offset
    // -03:00 na meia-noite de São Paulo (mesmo dia do calendário). Ambos os
    // modos seguem preenchidos ("agendado" / "em_data"), o cenário não muda.
    const original = campanhaAntiga({ data_inicio: '2026-03-01', data_fim: '2026-03-31' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.data_inicio, '2026-03-01T00:00:00-03:00')
    assert.equal(payload.data_fim, '2026-03-31T00:00:00-03:00')
  })

  test('preserva NPS/pergunta_feedback e tipo pesquisa', () => {
    const original = campanhaAntiga({ tipo: 'pesquisa', pergunta_feedback: 'De 0 a 10...' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.tipo, 'pesquisa')
    assert.equal(payload.pergunta_feedback, 'De 0 a 10...')
  })

  test('preserva CTA (texto_botao/url_botao)', () => {
    const original = campanhaAntiga({ texto_botao: 'Responder agora', url_botao: 'https://exemplo.com/pesquisa' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.texto_botao, 'Responder agora')
    assert.equal(payload.url_botao, 'https://exemplo.com/pesquisa')
  })

  test('preserva segmentação completa', () => {
    const original = campanhaAntiga({
      segmentar_cliente_ids: ['a', 'b'], segmentar_unidade_ids: ['c'], segmentar_perfis: ['d'],
      segmentar_usuario_tipos: ['e'], segmentar_estados: ['f', 'g'],
    })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.deepEqual(payload.segmentar_cliente_ids, ['a', 'b'])
    assert.deepEqual(payload.segmentar_unidade_ids, ['c'])
    assert.deepEqual(payload.segmentar_perfis, ['d'])
    assert.deepEqual(payload.segmentar_usuario_tipos, ['e'])
    assert.deepEqual(payload.segmentar_estados, ['f', 'g'])
  })

  test('preserva reexibição (politica_reexibicao/reexibir_apos_dias/intervalo_reexibicao_dias)', () => {
    const original = campanhaAntiga({ politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 45, intervalo_reexibicao_dias: 45 })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.politica_reexibicao, 'reexibir_apos_dias')
    assert.equal(payload.reexibir_apos_dias, 45)
    assert.equal(payload.intervalo_reexibicao_dias, 45)
  })

  test('preserva evento/gatilho apos_evento', () => {
    const original = campanhaAntiga({ gatilho: 'apos_evento', evento: 'checkout_concluido', modo_identificacao: 'sistema_tela' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.gatilho, 'apos_evento')
    assert.equal(payload.evento, 'checkout_concluido')
  })

  test('preserva múltiplos destaques com seus ids (nenhum item perde id no round-trip)', () => {
    const original = campanhaAntiga({
      modo_exibicao: FORMATO_DESTAQUE_ELEMENTO,
      modo_identificacao: 'data_cy',
      data_cy: 'filtro-status',
      destaques: [
        { id: 'item-1', campanha_id: 'camp-1', ordem: 1, data_cy: 'filtro-status', texto_badge: 'Novo', titulo: 'Status', descricao: 'd1', texto_botao: null, url_botao: null, ativo: true, criado_em: '', atualizado_em: '' },
        { id: 'item-2', campanha_id: 'camp-1', ordem: 2, data_cy: 'filtro-profissional', texto_badge: 'Novo', titulo: 'Profissional', descricao: 'd2', texto_botao: 'Ver', url_botao: 'https://x.com', ativo: true, criado_em: '', atualizado_em: '' },
      ],
    })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    const destaques = payload.destaques as Array<{ id?: string }>
    assert.equal(destaques.length, 2)
    assert.equal(destaques[0].id, 'item-1')
    assert.equal(destaques[1].id, 'item-2')
  })

  test('não zera prioridade/ordem/atraso_ms quando já tinham valores não-default', () => {
    const original = campanhaAntiga({ status: 'INATIVA', prioridade: 7, ordem: 3, atraso_ms: 1500 })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(payload.prioridade, 7)
    assert.equal(payload.ordem, 3)
    assert.equal(payload.atraso_ms, 1500)
  })

  // Fase 2 dos 3 status — FormState nunca teve `status`, então o payload de
  // "Salvar alterações" nunca inclui essa chave: o backend (atualizar() em
  // server/src/controllers/campanhas.ts) só mexe em status quando a chave
  // está presente no corpo, então editar preserva o status atual sempre.
  test('payload de salvar/editar nunca inclui `status` — editar preserva o status atual', () => {
    const original = campanhaAntiga({ status: 'ATIVA' })
    const payload = montarPayloadCampanha(hidratarFormState(original))
    assert.equal('status' in payload, false)
  })
})

// Bug: ao editar uma campanha, o dock inicializava modoSegmentacao com
// useState('todos') hardcoded, nunca re-derivado do form já hidratado — os
// IDs salvos apareciam (o array em si carregava certo), mas o seletor
// ficava preso em "Todos" até o usuário clicar manualmente. A correção
// centraliza a decisão em resolverModoSegmentacao (campanhaForm.ts), usado
// como inicializador do useState no DockLateral — estas suítes cobrem o
// roundtrip completo: campanha salva -> hidratar -> modo restaurado.
describe('round-trip: modo de segmentação restaurado ao editar', () => {
  test('campanha "Todos" (sem nenhum array preenchido) -> editar -> todos', () => {
    const original = campanhaAntiga({
      segmentar_cliente_ids: [], segmentar_unidade_ids: [], segmentar_perfis: [],
      segmentar_usuario_tipos: [], segmentar_estados: [],
    })
    assert.equal(resolverModoSegmentacao(hidratarFormState(original)), 'todos')
  })

  test('campanha "Por cliente" com IDs -> editar -> cliente, com os mesmos IDs visíveis', () => {
    const original = campanhaAntiga({
      segmentar_cliente_ids: ['cliente-9', 'cliente-10'], segmentar_unidade_ids: ['unidade-3'],
      segmentar_perfis: [], segmentar_usuario_tipos: [], segmentar_estados: [],
    })
    const form = hidratarFormState(original)
    assert.equal(resolverModoSegmentacao(form), 'cliente')
    assert.deepEqual(form.segmentar_cliente_ids, ['cliente-9', 'cliente-10'])
    assert.deepEqual(form.segmentar_unidade_ids, ['unidade-3'])
  })

  test('campanha "Por perfil" com perfis/tipos/estados -> editar -> perfil, com os mesmos valores visíveis', () => {
    const original = campanhaAntiga({
      segmentar_cliente_ids: [], segmentar_unidade_ids: [],
      segmentar_perfis: ['gestor', 'financeiro'], segmentar_usuario_tipos: ['admin'], segmentar_estados: ['SP', 'RJ'],
    })
    const form = hidratarFormState(original)
    assert.equal(resolverModoSegmentacao(form), 'perfil')
    assert.deepEqual(form.segmentar_perfis, ['gestor', 'financeiro'])
    assert.deepEqual(form.segmentar_usuario_tipos, ['admin'])
    assert.deepEqual(form.segmentar_estados, ['SP', 'RJ'])
  })

  test('campanha "combinada" (cliente + perfil) -> editar -> combinada, com todos os valores visíveis', () => {
    const original = campanhaAntiga({
      segmentar_cliente_ids: ['cliente-1'], segmentar_unidade_ids: [],
      segmentar_perfis: ['gestor'], segmentar_usuario_tipos: [], segmentar_estados: ['SP'],
    })
    const form = hidratarFormState(original)
    assert.equal(resolverModoSegmentacao(form), 'combinada')
    assert.deepEqual(form.segmentar_cliente_ids, ['cliente-1'])
    assert.deepEqual(form.segmentar_perfis, ['gestor'])
    assert.deepEqual(form.segmentar_estados, ['SP'])
  })

  test('campanha legada sem nenhuma segmentação salva (arrays vazios por padrão) -> editar -> todos', () => {
    const original = campanhaAntiga({
      segmentar_cliente_ids: [], segmentar_unidade_ids: [], segmentar_perfis: [],
      segmentar_usuario_tipos: [], segmentar_estados: [],
    })
    const form = hidratarFormState(original)
    assert.equal(resolverModoSegmentacao(form), 'todos')
  })

  test('salvar e reabrir não perde modo nem valores (form -> payload -> hidratar de novo)', () => {
    const formOriginal: FormState = { ...formInicial, segmentar_perfis: ['gestor'], segmentar_estados: ['SP', 'MG'] }
    const payload = montarPayloadCampanha(formOriginal)
    // Simula o que a API devolveria ao reler a campanha recém-salva: mesmos
    // arrays de segmentação, resto dos campos obrigatórios preenchidos.
    const recarregada = campanhaAntiga({
      segmentar_cliente_ids: payload.segmentar_cliente_ids as string[],
      segmentar_unidade_ids: payload.segmentar_unidade_ids as string[],
      segmentar_perfis: payload.segmentar_perfis as string[],
      segmentar_usuario_tipos: payload.segmentar_usuario_tipos as string[],
      segmentar_estados: payload.segmentar_estados as string[],
    })
    const formReaberto = hidratarFormState(recarregada)
    assert.equal(resolverModoSegmentacao(formReaberto), 'perfil')
    assert.deepEqual(formReaberto.segmentar_perfis, ['gestor'])
    assert.deepEqual(formReaberto.segmentar_estados, ['SP', 'MG'])
  })
})

// Fase 2 dos 3 status — status persistido é SEMPRE a fonte de verdade;
// "agendada"/"encerrada" nunca existem para RASCUNHO/INATIVA, só para uma
// campanha ATIVA (leitura de período). RASCUNHO nunca pode ser chamada de
// "Agendada", mesmo com data_inicio no futuro.
describe('getStatus — status persistido tem prioridade sobre período', () => {
  test('RASCUNHO -> "rascunho", mesmo com data_inicio no futuro', () => {
    const futura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(getStatus({ status: 'RASCUNHO', data_inicio: futura, data_fim: null }), 'rascunho')
  })

  test('RASCUNHO -> "rascunho", mesmo sem nenhuma data', () => {
    assert.equal(getStatus({ status: 'RASCUNHO', data_inicio: null, data_fim: null }), 'rascunho')
  })

  test('INATIVA -> "inativa", independente de período', () => {
    const futura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const passada = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(getStatus({ status: 'INATIVA', data_inicio: null, data_fim: null }), 'inativa')
    assert.equal(getStatus({ status: 'INATIVA', data_inicio: futura, data_fim: null }), 'inativa')
    assert.equal(getStatus({ status: 'INATIVA', data_inicio: null, data_fim: passada }), 'inativa')
  })

  test('ATIVA + data_inicio no futuro -> "agendada"', () => {
    const futura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(getStatus({ status: 'ATIVA', data_inicio: futura, data_fim: null }), 'agendada')
  })

  test('ATIVA + data_fim no passado -> "encerrada"', () => {
    const passada = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(getStatus({ status: 'ATIVA', data_inicio: null, data_fim: passada }), 'encerrada')
  })

  test('ATIVA + sem datas -> "ativa"', () => {
    assert.equal(getStatus({ status: 'ATIVA', data_inicio: null, data_fim: null }), 'ativa')
  })

  test('ATIVA + período vigente (início passado, fim futuro) -> "ativa"', () => {
    const inicioPassado = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fimFuturo = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(getStatus({ status: 'ATIVA', data_inicio: inicioPassado, data_fim: fimFuturo }), 'ativa')
  })
})

// ─── Etapa 2 — vigência: helpers puros + payload (modo + data/hora) ────────
describe('resolverModoInicio / resolverModoFim', () => {
  test('sem valor -> imediato / sem_data', () => {
    assert.equal(resolverModoInicio(null), 'imediato')
    assert.equal(resolverModoInicio(''), 'imediato')
    assert.equal(resolverModoInicio(undefined), 'imediato')
    assert.equal(resolverModoFim(null), 'sem_data')
    assert.equal(resolverModoFim(''), 'sem_data')
  })
  test('com valor -> agendado / em_data', () => {
    assert.equal(resolverModoInicio('2026-05-01'), 'agendado')
    assert.equal(resolverModoInicio('2026-05-01T12:00:00.000Z'), 'agendado')
    assert.equal(resolverModoFim('2026-06-30'), 'em_data')
  })
})

describe('separarDataHora', () => {
  test('vazio/null -> { "", "" }', () => {
    assert.deepEqual(separarDataHora(null), { data: '', hora: '' })
    assert.deepEqual(separarDataHora(''), { data: '', hora: '' })
    assert.deepEqual(separarDataHora(undefined), { data: '', hora: '' })
  })
  test('date-only legado -> data literal, hora vazia (sem conversão de fuso)', () => {
    assert.deepEqual(separarDataHora('2026-05-01'), { data: '2026-05-01', hora: '' })
  })
  test('ISO UTC com hora -> wall-clock de America/Sao_Paulo', () => {
    assert.deepEqual(separarDataHora('2026-05-01T12:30:00.000Z'), { data: '2026-05-01', hora: '09:30' })
    // vira o dia pra trás quando o UTC é de madrugada
    assert.deepEqual(separarDataHora('2026-05-01T01:00:00.000Z'), { data: '2026-04-30', hora: '22:00' })
  })
  test('ISO já com offset -03:00 -> devolve o mesmo wall-clock', () => {
    assert.deepEqual(separarDataHora('2026-09-01T09:00:00-03:00'), { data: '2026-09-01', hora: '09:00' })
  })
  test('string inválida -> { "", "" }', () => {
    assert.deepEqual(separarDataHora('não é data'), { data: '', hora: '' })
  })
})

describe('combinarDataHoraISO — ISO com offset -03:00', () => {
  test('data + hora -> "YYYY-MM-DDTHH:MM:00-03:00"', () => {
    assert.equal(combinarDataHoraISO('2026-09-01', '09:00'), '2026-09-01T09:00:00-03:00')
    assert.equal(combinarDataHoraISO('2026-12-31', '23:45'), '2026-12-31T23:45:00-03:00')
  })
  test('hora vazia -> meia-noite', () => {
    assert.equal(combinarDataHoraISO('2026-09-01', ''), '2026-09-01T00:00:00-03:00')
  })
  test('sem data -> string vazia (caller manda null)', () => {
    assert.equal(combinarDataHoraISO('', '09:00'), '')
    assert.equal(combinarDataHoraISO('   ', '09:00'), '')
  })
  test('o ISO gerado não depende do timezone local do navegador (offset explícito)', () => {
    const iso = combinarDataHoraISO('2026-09-01', '09:00')
    assert.match(iso, /-03:00$/)
    assert.equal(new Date(iso).toISOString(), '2026-09-01T12:00:00.000Z')
  })
})

describe('montarPayloadCampanha — vigência (modo + data/hora)', () => {
  function base(over: Partial<FormState> = {}): FormState {
    return { ...formInicial, nome_interno: 'x', sistema: 'erp', tela: 'Home', ...over }
  }

  test('sem datas (imediato + sem_data) -> data_inicio: null, data_fim: null', () => {
    const p = montarPayloadCampanha(base())
    assert.equal(p.data_inicio, null)
    assert.equal(p.data_fim, null)
  })

  test('só início (agendado) -> data_inicio combinado, data_fim: null', () => {
    const p = montarPayloadCampanha(base({
      modo_inicio: 'agendado', data_inicio_data: '2026-09-01', data_inicio_hora: '09:00',
    }))
    assert.equal(p.data_inicio, '2026-09-01T09:00:00-03:00')
    assert.equal(p.data_fim, null)
  })

  test('só fim (em_data) -> data_fim combinado, data_inicio: null', () => {
    const p = montarPayloadCampanha(base({
      modo_fim: 'em_data', data_fim_data: '2026-09-30', data_fim_hora: '18:00',
    }))
    assert.equal(p.data_inicio, null)
    assert.equal(p.data_fim, '2026-09-30T18:00:00-03:00')
  })

  test('início + fim -> os dois combinados (backend valida início < fim)', () => {
    const p = montarPayloadCampanha(base({
      modo_inicio: 'agendado', data_inicio_data: '2026-09-01', data_inicio_hora: '09:00',
      modo_fim: 'em_data', data_fim_data: '2026-09-30', data_fim_hora: '18:00',
    }))
    assert.equal(p.data_inicio, '2026-09-01T09:00:00-03:00')
    assert.equal(p.data_fim, '2026-09-30T18:00:00-03:00')
  })

  test('modo agendado sem data preenchida -> null (não quebra; a UI da Etapa 3 barra o submit)', () => {
    const p = montarPayloadCampanha(base({ modo_inicio: 'agendado', data_inicio_data: '', data_inicio_hora: '10:00' }))
    assert.equal(p.data_inicio, null)
  })

  test('modo imediato ignora data/hora eventualmente preenchidas', () => {
    const p = montarPayloadCampanha(base({
      modo_inicio: 'imediato', data_inicio_data: '2026-09-01', data_inicio_hora: '09:00',
    }))
    assert.equal(p.data_inicio, null)
  })
})

describe('round-trip vigência: campanha -> hidratar -> payload', () => {
  test('ISO UTC com hora: instante preservado (mesmo getTime), apenas muda a representação', () => {
    const original = campanhaAntiga({ data_inicio: '2026-05-01T12:30:00.000Z', data_fim: '2026-06-30T21:00:00.000Z' })
    const p = montarPayloadCampanha(hidratarFormState(original))
    assert.equal(new Date(p.data_inicio as string).getTime(), new Date('2026-05-01T12:30:00.000Z').getTime())
    assert.equal(new Date(p.data_fim as string).getTime(), new Date('2026-06-30T21:00:00.000Z').getTime())
    assert.match(p.data_inicio as string, /-03:00$/)
  })

  test('horário preservado no round-trip (15:45Z -> 12:45 SP -> volta a 15:45Z)', () => {
    const original = campanhaAntiga({ data_inicio: '2026-05-01T15:45:00.000Z', data_fim: null })
    const form = hidratarFormState(original)
    assert.equal(form.data_inicio_hora, '12:45')
    const p = montarPayloadCampanha(form)
    assert.equal(p.data_inicio, '2026-05-01T12:45:00-03:00')
    assert.equal(new Date(p.data_inicio as string).toISOString(), '2026-05-01T15:45:00.000Z')
  })

  test('legado sem datas: round-trip mantém null/null e modos imediato/sem_data', () => {
    const original = campanhaAntiga({ data_inicio: null, data_fim: null })
    const form = hidratarFormState(original)
    assert.equal(form.modo_inicio, 'imediato')
    assert.equal(form.modo_fim, 'sem_data')
    const p = montarPayloadCampanha(form)
    assert.equal(p.data_inicio, null)
    assert.equal(p.data_fim, null)
  })
})

describe('corSistemaValida — cor principal da aparência do widget nos previews', () => {
  test('HEX #RRGGBB válido é usado como veio (só normaliza espaços em volta)', () => {
    assert.equal(corSistemaValida('#7b2ff7'), '#7b2ff7')
    assert.equal(corSistemaValida('  #7b2ff7  '), '#7b2ff7')
  })

  test('sem cor configurada (null/vazio) cai no fallback histórico da simulação', () => {
    assert.equal(corSistemaValida(null), '#0064e0')
    assert.equal(corSistemaValida(undefined), '#0064e0')
    assert.equal(corSistemaValida(''), '#0064e0')
  })

  test('formatos inválidos (sem #, 3 dígitos, nome CSS) caem no fallback', () => {
    assert.equal(corSistemaValida('7b2ff7'), '#0064e0')
    assert.equal(corSistemaValida('#abc'), '#0064e0')
    assert.equal(corSistemaValida('rebeccapurple'), '#0064e0')
  })
})

describe('corSistemaTranslucida — espelha --up-primary-soft do widget real', () => {
  test('converte HEX em rgba() com o alpha pedido', () => {
    assert.equal(corSistemaTranslucida('#0058be', 0.1), 'rgba(0, 88, 190, 0.1)')
    assert.equal(corSistemaTranslucida('0058be', 0.4), 'rgba(0, 88, 190, 0.4)')
  })

  test('valor irreconhecível volta como veio (nunca quebra o style inline)', () => {
    assert.equal(corSistemaTranslucida('nope', 0.1), 'nope')
  })
})

// ─── Google Drive: link de compartilhamento -> URL exibível em <img> ───────
const DRIVE_ID = '1A2b3C4d5E6f7G8h9I0jKLmnopqrstuvwx'
const THUMB = `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1600`

describe('extrairDriveFileId — reconhece os formatos de link do Google Drive', () => {
  test('drive.google.com/file/d/<ID>/view (e variantes de sufixo)', () => {
    assert.equal(extrairDriveFileId(`https://drive.google.com/file/d/${DRIVE_ID}/view`), DRIVE_ID)
    assert.equal(extrairDriveFileId(`https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`), DRIVE_ID)
    assert.equal(extrairDriveFileId(`https://drive.google.com/file/d/${DRIVE_ID}/preview`), DRIVE_ID)
    assert.equal(extrairDriveFileId(`https://drive.google.com/file/d/${DRIVE_ID}/edit`), DRIVE_ID)
  })
  test('drive.google.com/open?id=<ID>', () => {
    assert.equal(extrairDriveFileId(`https://drive.google.com/open?id=${DRIVE_ID}`), DRIVE_ID)
  })
  test('drive.google.com/uc?id=<ID> e uc?export=view&id=<ID>', () => {
    assert.equal(extrairDriveFileId(`https://drive.google.com/uc?id=${DRIVE_ID}`), DRIVE_ID)
    assert.equal(extrairDriveFileId(`https://drive.google.com/uc?export=view&id=${DRIVE_ID}`), DRIVE_ID)
  })
  test('a própria saída (thumbnail?id=<ID>) é reconhecida -> idempotência', () => {
    assert.equal(extrairDriveFileId(THUMB), DRIVE_ID)
  })
  test('www.drive.google.com também vale', () => {
    assert.equal(extrairDriveFileId(`https://www.drive.google.com/file/d/${DRIVE_ID}/view`), DRIVE_ID)
  })
  test('não-Drive / lixo / id curto demais -> null', () => {
    assert.equal(extrairDriveFileId('https://exemplo.com/foto.png'), null)
    assert.equal(extrairDriveFileId('https://docs.google.com/document/d/abc/edit'), null)
    assert.equal(extrairDriveFileId('https://drive.google.com/drive/folders/xyz'), null)
    assert.equal(extrairDriveFileId('drive.google.com/file/d/short/view'), null)
    assert.equal(extrairDriveFileId('não é url'), null)
    assert.equal(extrairDriveFileId(''), null)
  })
})

describe('normalizarImagemUrl — converte só o que reconhece, resto passa reto', () => {
  test('cada formato de Drive -> mesma URL de thumbnail exibível', () => {
    assert.equal(normalizarImagemUrl(`https://drive.google.com/file/d/${DRIVE_ID}/view`), THUMB)
    assert.equal(normalizarImagemUrl(`https://drive.google.com/open?id=${DRIVE_ID}`), THUMB)
    assert.equal(normalizarImagemUrl(`https://drive.google.com/uc?export=view&id=${DRIVE_ID}`), THUMB)
  })
  test('idempotente: rodar de novo na saída devolve a mesma URL', () => {
    assert.equal(normalizarImagemUrl(THUMB), THUMB)
  })
  test('URL de imagem normal continua funcionando como hoje (via normalizarUrl)', () => {
    assert.equal(normalizarImagemUrl('https://cdn.exemplo.com/banner.png'), 'https://cdn.exemplo.com/banner.png')
    assert.equal(normalizarImagemUrl('  https://cdn.exemplo.com/b.jpg  '), 'https://cdn.exemplo.com/b.jpg')
  })
  test('vazio -> vazio; link não reconhecido -> comportamento seguro atual (passthrough)', () => {
    assert.equal(normalizarImagemUrl(''), '')
    assert.equal(normalizarImagemUrl('sem-esquema/foto.png'), 'sem-esquema/foto.png')
  })
})

describe('montarPayloadCampanha — persiste o imagem_url já normalizado (Drive)', () => {
  function baseForm(over: Partial<FormState> = {}): FormState {
    return { ...formInicial, nome_interno: 'x', ...over }
  }
  test('campo legado imagem_url: link de compartilhamento do Drive vira thumbnail no payload', () => {
    const p = montarPayloadCampanha(baseForm({ imagem_url: `https://drive.google.com/file/d/${DRIVE_ID}/view` }))
    assert.equal(p.imagem_url, THUMB)
  })
  test('conteudos[].imagem_url também é normalizado', () => {
    const form = baseForm({
      conteudos: [{
        titulo: 'c1', descricao: 'd', imagem_url: `https://drive.google.com/open?id=${DRIVE_ID}`,
        video_url: '', cta_habilitado: false, texto_botao: '', url_botao: '',
      }],
    })
    const p = montarPayloadCampanha(form) as { conteudos: Array<{ imagem_url: string | null }> }
    assert.equal(p.conteudos[0].imagem_url, THUMB)
  })
  test('URL normal segue intacta no payload', () => {
    const p = montarPayloadCampanha(baseForm({ imagem_url: 'https://cdn.exemplo.com/x.png' }))
    assert.equal(p.imagem_url, 'https://cdn.exemplo.com/x.png')
  })
})
