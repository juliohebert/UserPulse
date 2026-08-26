import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  avaliarPoliticaReexibicao, avaliarReexibicaoPorDias, construirFiltroCandidatas, fonteReferenciaReexibicao, ocultarTenantId,
  validarDestaqueItemEvento, TIPOS_EVENTO_CAMPANHA,
  validarAvaliacaoFeedback, TIPOS_AVALIACAO_FEEDBACK,
  filtroFeedbackGeralReexibicao,
  passaSegmentacao,
} from './widget'

const DIA_MS = 86_400_000
const AGORA = new Date('2026-07-10T12:00:00Z')
const FONTE_WIDGET = readFileSync(new URL('./widget.ts', import.meta.url), 'utf8')
const FONTE_SEED = readFileSync(new URL('../../prisma/seed.ts', import.meta.url), 'utf8')

function diasAtras(dias: number): Date {
  return new Date(AGORA.getTime() - dias * DIA_MS)
}

describe('contrato de eventos das campanhas demo', () => {
  test('seed usa os mesmos tipos de evento aceitos pelo widget', () => {
    for (const tipoLegado of ['feedback_enviado', 'visualizada', 'cta_clicado', 'fechada']) {
      assert.equal(FONTE_SEED.includes(`'${tipoLegado}'`), false, `tipo legado encontrado no seed: ${tipoLegado}`)
    }
    assert.match(FONTE_SEED, /tipo_evento: 'visualizacao'/)
  })

  test('seed de destaque cria itens, tracking por item e avaliações de utilidade', () => {
    assert.match(FONTE_SEED, /modo_exibicao: 'destaque_elemento'/)
    assert.match(FONTE_SEED, /destaques: \[/)
    assert.match(FONTE_SEED, /destaque_item_id: destaqueItemId/)
    assert.match(FONTE_SEED, /tipo_avaliacao: 'utilidade_destaque'/)
    assert.match(FONTE_SEED, /nota: null/)
    assert.match(FONTE_SEED, /adicionarEventos\([^\n]+, 'interacao_badge'/)
    assert.match(FONTE_SEED, /adicionarEventos\([^\n]+, 'clique_cta'/)
    assert.match(FONTE_SEED, /adicionarEventos\([^\n]+, 'dispensa'/)
    assert.match(FONTE_SEED, /\.\.\.gerarEventosDestaqueSeed\(\)/)
    assert.match(FONTE_SEED, /const avaliacoesDestaqueSeed = gerarAvaliacoesDestaqueSeed\(\)/)
    assert.match(FONTE_SEED, /campanha_id: \{ in: campanhaIds \}/)
    assert.match(FONTE_SEED, /idSeed\('destaque', tenant_id/)
    assert.match(FONTE_SEED, /where: \{ id: \{ notIn: destaques\.map/)
    assert.match(FONTE_SEED, /data: \{ ativo: false \}/)
  })
})

const CAMPANHA_REEXIBICAO = {
  politica_reexibicao: 'uma_vez_apos_visualizacao',
  reexibir_apos_dias: null,
  intervalo_reexibicao_dias: null,
  exige_confirmacao_leitura: false,
  feedback_habilitado: true,
}

const SEM_HISTORICO = {
  ultimaVisualizacao: null,
  ultimoFeedback: null,
  ultimaConfirmacao: null,
}

describe('avaliarPoliticaReexibicao — decisão autoritativa compartilhada', () => {
  test('identificado sem histórico é elegível', () => {
    assert.equal(avaliarPoliticaReexibicao(CAMPANHA_REEXIBICAO, SEM_HISTORICO, AGORA).bloqueado, false)
  })

  test('resposta encerra uma_vez_apos_visualizacao e ate_responder_ou_confirmar', () => {
    const historico = { ...SEM_HISTORICO, ultimoFeedback: diasAtras(1) }
    assert.equal(avaliarPoliticaReexibicao(CAMPANHA_REEXIBICAO, historico, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao({ ...CAMPANHA_REEXIBICAO, politica_reexibicao: 'ate_responder_ou_confirmar' }, historico, AGORA).bloqueado, true)
  })

  test('POST pode ignorar a visualização atual sem ignorar resposta anterior', () => {
    assert.equal(avaliarPoliticaReexibicao(CAMPANHA_REEXIBICAO, { ...SEM_HISTORICO, ultimaVisualizacao: AGORA }, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao(CAMPANHA_REEXIBICAO, SEM_HISTORICO, AGORA).bloqueado, false)
    assert.equal(avaliarPoliticaReexibicao(CAMPANHA_REEXIBICAO, { ...SEM_HISTORICO, ultimoFeedback: AGORA }, AGORA).bloqueado, true)
  })

  test('cenários completos do POST: primeira resposta, duplicada, visualização posterior e intervalo vencido', () => {
    const politicaBloqueante = CAMPANHA_REEXIBICAO
    const somenteVisualizacaoAtual = { ...SEM_HISTORICO, ultimaVisualizacao: AGORA }
    const respostaAnteriorComNovaVisualizacao = {
      ...SEM_HISTORICO,
      ultimaVisualizacao: AGORA,
      ultimoFeedback: diasAtras(5),
    }

    assert.equal(avaliarPoliticaReexibicao(politicaBloqueante, { ...somenteVisualizacaoAtual, ultimaVisualizacao: null }, AGORA).bloqueado, false)
    assert.equal(avaliarPoliticaReexibicao(politicaBloqueante, respostaAnteriorComNovaVisualizacao, AGORA).bloqueado, true)

    const porIntervalo = { ...politicaBloqueante, politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 30 }
    assert.equal(avaliarPoliticaReexibicao(porIntervalo, { ...respostaAnteriorComNovaVisualizacao, ultimoFeedback: diasAtras(29) }, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao(porIntervalo, { ...respostaAnteriorComNovaVisualizacao, ultimoFeedback: diasAtras(30) }, AGORA).bloqueado, false)
  })

  test('registrarFeedback liga a decisão ao 409 e ignora somente a visualização atual', () => {
    const inicio = FONTE_WIDGET.indexOf('export async function registrarFeedback')
    const fim = FONTE_WIDGET.indexOf('export async function registrarUtilidadeDestaque')
    const controller = FONTE_WIDGET.slice(inicio, fim)
    assert.match(controller, /verificarHistorico\(campanha, String\(usuario_id\), new Date\(\), \{ ignorarVisualizacao: true \}\)/)
    assert.match(controller, /if \(reexibicao\.bloqueado\) return res\.status\(409\)/)
  })

  test('reexibir_apos_dias bloqueia antes e permite nova resposta após o prazo', () => {
    const campanha = { ...CAMPANHA_REEXIBICAO, politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 30 }
    assert.equal(avaliarPoliticaReexibicao(campanha, { ...SEM_HISTORICO, ultimoFeedback: diasAtras(29) }, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao(campanha, { ...SEM_HISTORICO, ultimoFeedback: diasAtras(30) }, AGORA).bloqueado, false)
  })

  test('intervalo_reexibicao_dias legado participa quando reexibir_apos_dias não existe', () => {
    const campanha = { ...CAMPANHA_REEXIBICAO, politica_reexibicao: 'reexibir_apos_dias', intervalo_reexibicao_dias: 15 }
    assert.equal(avaliarPoliticaReexibicao(campanha, { ...SEM_HISTORICO, ultimoFeedback: diasAtras(14) }, AGORA).bloqueado, true)
    assert.equal(avaliarPoliticaReexibicao(campanha, { ...SEM_HISTORICO, ultimoFeedback: diasAtras(15) }, AGORA).bloqueado, false)
  })

  test('NPS usa feedback geral e campanha informativa/destaque sem feedback usa visualização', () => {
    assert.equal(avaliarPoliticaReexibicao(CAMPANHA_REEXIBICAO, { ...SEM_HISTORICO, ultimoFeedback: AGORA }, AGORA).bloqueado, true)
    const informativa = { ...CAMPANHA_REEXIBICAO, politica_reexibicao: 'reexibir_apos_dias', reexibir_apos_dias: 10, feedback_habilitado: false }
    assert.equal(avaliarPoliticaReexibicao(informativa, { ...SEM_HISTORICO, ultimaVisualizacao: diasAtras(1) }, AGORA).bloqueado, true)
  })
})

describe('fonteReferenciaReexibicao', () => {
  test('campanha com feedback habilitado usa feedback como referência', () => {
    const fonte = fonteReferenciaReexibicao({ exige_confirmacao_leitura: false, feedback_habilitado: true })
    assert.equal(fonte, 'feedback')
  })

  test('campanha que exige confirmação de leitura usa confirmação como referência', () => {
    const fonte = fonteReferenciaReexibicao({ exige_confirmacao_leitura: true, feedback_habilitado: true })
    assert.equal(fonte, 'confirmacao')
  })

  test('campanha sem feedback e sem confirmação cai no fallback de visualização', () => {
    const fonte = fonteReferenciaReexibicao({ exige_confirmacao_leitura: false, feedback_habilitado: false })
    assert.equal(fonte, 'visualizacao')
  })
})

describe('avaliarReexibicaoPorDias — campanha com resposta/NPS (fonte "feedback")', () => {
  test('último feedback hoje bloqueia', () => {
    const r = avaliarReexibicaoPorDias(60, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, true)
  })

  test('último feedback há 59 dias bloqueia', () => {
    const r = avaliarReexibicaoPorDias(60, diasAtras(59), AGORA, 'feedback')
    assert.equal(r.bloqueado, true)
  })

  test('último feedback há 60 dias libera', () => {
    const r = avaliarReexibicaoPorDias(60, diasAtras(60), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })

  test('sem feedback (referência nula) libera, mesmo com visualização recente ignorada pelo caller', () => {
    // O caller só resolve `referencia` a partir da tabela de feedback quando fonte === 'feedback';
    // uma visualização recente nunca chega até aqui como referência.
    const r = avaliarReexibicaoPorDias(60, null, AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })
})

describe('avaliarReexibicaoPorDias — campanha com confirmação de leitura (fonte "confirmacao")', () => {
  test('última confirmação dentro do prazo bloqueia', () => {
    const r = avaliarReexibicaoPorDias(30, diasAtras(10), AGORA, 'confirmacao')
    assert.equal(r.bloqueado, true)
  })

  test('última confirmação fora do prazo libera', () => {
    const r = avaliarReexibicaoPorDias(30, diasAtras(31), AGORA, 'confirmacao')
    assert.equal(r.bloqueado, false)
  })

  test('sem confirmação (referência nula) libera — visualização não deve ser referência', () => {
    const r = avaliarReexibicaoPorDias(30, null, AGORA, 'confirmacao')
    assert.equal(r.bloqueado, false)
  })
})

describe('avaliarReexibicaoPorDias — campanha informativa, sem feedback e sem confirmação (fonte "visualizacao")', () => {
  test('última visualização dentro do prazo bloqueia', () => {
    const r = avaliarReexibicaoPorDias(15, diasAtras(5), AGORA, 'visualizacao')
    assert.equal(r.bloqueado, true)
  })

  test('última visualização fora do prazo libera', () => {
    const r = avaliarReexibicaoPorDias(15, diasAtras(15), AGORA, 'visualizacao')
    assert.equal(r.bloqueado, false)
  })
})

describe('avaliarReexibicaoPorDias — reexibir_apos_dias null, 0 ou negativo', () => {
  test('null sempre libera, mesmo com resposta hoje', () => {
    const r = avaliarReexibicaoPorDias(null, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })

  test('0 sempre libera', () => {
    const r = avaliarReexibicaoPorDias(0, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })

  test('negativo sempre libera', () => {
    const r = avaliarReexibicaoPorDias(-5, diasAtras(0), AGORA, 'feedback')
    assert.equal(r.bloqueado, false)
  })
})

// tenant_id é identificador interno da fundação SaaS multi-tenant (ver
// schema.prisma) — nunca deve aparecer numa resposta pública do widget
// (buscarCampanha/buscarCandidatas/buscarTour/buscarTourCandidatos/
// buscarJornadas em widget.ts). Testado aqui como função pura, sem precisar
// de servidor HTTP nem banco (mesmo padrão das demais funções desta suíte).
describe('ocultarTenantId — nunca deixa tenant_id vazar numa resposta pública', () => {
  test('remove tenant_id E codigo de um objeto simples (defesa em profundidade — Fase 2 do widget multi-tenant)', () => {
    const entrada = { id: 't1', tenant_id: 'x', codigo: 42, nome: 'Tenant X' }
    const saida = ocultarTenantId(entrada)
    assert.equal('tenant_id' in saida, false)
    assert.equal('codigo' in saida, false)
    assert.deepEqual(saida, { id: 't1', nome: 'Tenant X' })
  })

  test('remove tenant_id de um objeto simples, preservando os demais campos', () => {
    const entrada = { id: 'c1', tenant_id: 't1', nome_interno: 'Interno', titulo: 'Campanha X', ativo: true }
    const saida = ocultarTenantId(entrada)
    assert.equal('tenant_id' in saida, false)
    assert.equal('nome_interno' in saida, false)
    assert.deepEqual(saida, { id: 'c1', titulo: 'Campanha X', ativo: true })
  })

  test('remove tenant_id de cada item de um array (ex.: /api/widget/candidatas)', () => {
    const entrada = [
      { id: 'c1', tenant_id: 't1', titulo: 'A' },
      { id: 'c2', tenant_id: 't1', titulo: 'B' },
    ]
    const saida = ocultarTenantId(entrada)
    assert.equal(saida.every(item => !('tenant_id' in item)), true)
    assert.deepEqual(saida, [{ id: 'c1', titulo: 'A' }, { id: 'c2', titulo: 'B' }])
  })

  test('remove tenant_id também em objetos aninhados (ex.: tour/campanha dentro de etapa de jornada)', () => {
    const entrada = {
      id: 'j1',
      tenant_id: 't1',
      titulo: 'Jornada X',
      blocos: [
        {
          id: 'b1',
          etapas: [
            { id: 'e1', tour: { id: 'tour1', tenant_id: 't1', titulo: 'Tour' } },
          ],
        },
      ],
    }
    const saida = ocultarTenantId(entrada)
    assert.equal('tenant_id' in saida, false)
    assert.equal('tenant_id' in saida.blocos[0].etapas[0].tour, false)
    assert.equal(saida.blocos[0].etapas[0].tour.titulo, 'Tour')
  })

  test('preserva campos com nome parecido (tour_id, campanha_id) — só remove "tenant_id" exato', () => {
    const entrada = { id: 'e1', tour_id: 'tour1', campanha_id: null, tenant_id: 't1' }
    const saida = ocultarTenantId(entrada)
    assert.deepEqual(saida, { id: 'e1', tour_id: 'tour1', campanha_id: null })
  })

  test('não altera valores que não são objeto/array (string, número, null, undefined, Date)', () => {
    assert.equal(ocultarTenantId('texto'), 'texto')
    assert.equal(ocultarTenantId(42), 42)
    assert.equal(ocultarTenantId(null), null)
    assert.equal(ocultarTenantId(undefined), undefined)
    const data = new Date('2026-01-01T00:00:00Z')
    assert.equal(ocultarTenantId(data), data)
  })

  test('objeto sem tenant_id passa intacto', () => {
    const entrada = { id: 'c1', titulo: 'Sem tenant' }
    assert.deepEqual(ocultarTenantId(entrada), entrada)
  })
})

// Filtro de GET /api/widget/candidatas. tenant_id/ativo são aplicados pelo
// caller (buscarCandidatas), fora desta função — por isso os testes de
// isolamento aqui só confirmam que o filtro NUNCA inclui essas chaves
// (tenant_id/public_key continuam isolados por fora); a decisão de acesso
// público em si (tenantPublicoPermiteAcesso) já é coberta em
// tenantGuards.test.ts, sem repetir aqui.
describe('construirFiltroCandidatas — GET /api/widget/candidatas', () => {
  test('sistema é comparado sem diferenciar maiúsculas/minúsculas (bug: "quarkclinic" cadastrado x "QuarkClinic" enviado pelo widget devolvia [])', () => {
    const filtro = construirFiltroCandidatas('QuarkClinic', 'home', 'ao_abrir_tela', undefined) as { sistema: unknown }
    assert.deepEqual(filtro.sistema, { equals: 'QuarkClinic', mode: 'insensitive' })
  })

  test('destaque_elemento (modo_identificacao=data_cy) com tela vazia continua elegível mesmo com widget informando tela=home', () => {
    const filtro = construirFiltroCandidatas('quarkclinic', 'home', 'ao_abrir_tela', undefined) as { OR: unknown[] }
    // data_cy entra incondicionalmente no OR — o alvo é o elemento, não a
    // tela; nada aqui exige que a `tela` da campanha (vazia, neste caso)
    // bata com a `tela` informada pelo widget.
    assert.ok(filtro.OR.some(clausula => JSON.stringify(clausula) === JSON.stringify({ modo_identificacao: 'data_cy' })))
  })

  test('campanha tradicional (sistema_tela) continua exigindo tela igual à informada pelo widget', () => {
    const filtro = construirFiltroCandidatas('quarkclinic', 'home', 'ao_abrir_tela', undefined) as { OR: unknown[] }
    assert.ok(filtro.OR.some(clausula => JSON.stringify(clausula) === JSON.stringify({ modo_identificacao: 'sistema_tela', tela: 'home' })))
    // Nenhuma outra tela aparece no OR — só a que o widget informou.
    assert.equal(filtro.OR.filter((c): c is { modo_identificacao: string; tela?: string } =>
      typeof c === 'object' && c !== null && (c as { modo_identificacao?: string }).modo_identificacao === 'sistema_tela'
    ).length, 1)
  })

  test('sem tela informada pelo widget, filtro de sistema_tela nem aparece no OR (comportamento preexistente, inalterado)', () => {
    const filtro = construirFiltroCandidatas('quarkclinic', '', 'ao_abrir_tela', undefined) as { OR: unknown[] }
    assert.equal(filtro.OR.some(c => typeof c === 'object' && c !== null && (c as { modo_identificacao?: string }).modo_identificacao === 'sistema_tela'), false)
  })

  test('gatilho incompatível: campanha apos_evento não é alcançada pelo filtro padrão ao_abrir_tela', () => {
    const filtro = construirFiltroCandidatas('quarkclinic', 'home', undefined, undefined) as { gatilho: string }
    assert.equal(filtro.gatilho, 'ao_abrir_tela')
  })

  test('gatilho apos_evento com evento nomeado filtra por esse evento específico', () => {
    const filtro = construirFiltroCandidatas('quarkclinic', 'home', 'apos_evento', 'checkout_concluido') as { gatilho: string; evento: string }
    assert.equal(filtro.gatilho, 'apos_evento')
    assert.equal(filtro.evento, 'checkout_concluido')
  })

  test('filtro nunca inclui tenant_id/public_key — isolamento de tenant continua aplicado só pelo caller', () => {
    const filtro = construirFiltroCandidatas('quarkclinic', 'home', 'ao_abrir_tela', undefined) as Record<string, unknown>
    assert.equal('tenant_id' in filtro, false)
    assert.equal('public_key' in filtro, false)
  })
})

// Fase 3 — tracking por item de destaque_elemento (destaque_item_id em
// EventoCampanha). validarDestaqueItemEvento é a função que decide
// ownership/isolamento — a query real (registrarEvento) busca o item só
// por id (sem where campanha_id, de propósito, ver comentário em
// widget.ts), então esta função pura é o único lugar que garante que um
// item de outra campanha (ou de outro tenant) nunca é aceito.
describe('TIPOS_EVENTO_CAMPANHA', () => {
  test('inclui os 2 tipos legados de modal_automatica e os 2 novos de destaque_elemento', () => {
    assert.deepEqual(TIPOS_EVENTO_CAMPANHA, ['visualizacao', 'clique_cta', 'interacao_badge', 'dispensa'])
  })
})

describe('validarDestaqueItemEvento', () => {
  test('destaque_item_id ausente/null/vazio -> válido, sem item (evento legado ou de modal_automatica)', () => {
    assert.deepEqual(validarDestaqueItemEvento(undefined, null, 'camp-1'), { erro: null, destaqueItemId: null })
    assert.deepEqual(validarDestaqueItemEvento(null, null, 'camp-1'), { erro: null, destaqueItemId: null })
    assert.deepEqual(validarDestaqueItemEvento('', null, 'camp-1'), { erro: null, destaqueItemId: null })
  })

  test('tipo errado (não string) -> inválido', () => {
    const r = validarDestaqueItemEvento(123, null, 'camp-1')
    assert.notEqual(r.erro, null)
    assert.equal(r.destaqueItemId, null)
  })

  test('item encontrado e pertence à campanha do evento -> aceito', () => {
    const item = { id: 'item-1', campanha_id: 'camp-1' }
    const r = validarDestaqueItemEvento('item-1', item, 'camp-1')
    assert.equal(r.erro, null)
    assert.equal(r.destaqueItemId, 'item-1')
  })

  test('ownership: item existe mas pertence a OUTRA campanha -> rejeitado', () => {
    const item = { id: 'item-1', campanha_id: 'camp-outra' }
    const r = validarDestaqueItemEvento('item-1', item, 'camp-1')
    assert.notEqual(r.erro, null)
    assert.equal(r.destaqueItemId, null)
  })

  test('isolamento de tenant: item de uma campanha de outro tenant (campanha_id diferente) -> rejeitado, mesmo caminho do ownership — nunca existe um "id de item" isolado sem passar pela campanha dele', () => {
    // A query real busca só por id (sem escopar por tenant/campanha) — é
    // esta comparação que impede um id de item vazado/adivinhado de outro
    // tenant de ser aceito, já que a campanha_id do evento nunca vai bater
    // com a campanha_id do item de outro tenant.
    const itemDeOutroTenant = { id: 'item-vazado', campanha_id: 'camp-de-outro-tenant' }
    const r = validarDestaqueItemEvento('item-vazado', itemDeOutroTenant, 'camp-do-tenant-atual')
    assert.notEqual(r.erro, null)
    assert.equal(r.destaqueItemId, null)
  })

  test('item não encontrado (id não existe em nenhuma campanha) -> rejeitado', () => {
    const r = validarDestaqueItemEvento('id-que-nao-existe', null, 'camp-1')
    assert.notEqual(r.erro, null)
  })

  test('id do item retornado pela query não bate com o id enviado (defesa extra) -> rejeitado', () => {
    const item = { id: 'item-diferente', campanha_id: 'camp-1' }
    const r = validarDestaqueItemEvento('item-1', item, 'camp-1')
    assert.notEqual(r.erro, null)
  })
})

// Fundação NPS/CSAT/utilidade_destaque (Feedback.tipo_avaliacao,
// Campanha.tipo_avaliacao_feedback). validarAvaliacaoFeedback é a regra pura
// central por tipo — quem chama (registrarFeedback) já resolveu
// tipoAvaliacao a partir de Campanha.tipo_avaliacao_feedback antes de
// chegar aqui, nunca de um campo enviado pelo cliente; estes testes cobrem
// só a validação do VALOR pro tipo já resolvido.
describe('TIPOS_AVALIACAO_FEEDBACK', () => {
  test('cobre nps, csat e utilidade_destaque', () => {
    assert.deepEqual(TIPOS_AVALIACAO_FEEDBACK, ['nps', 'csat', 'utilidade_destaque'])
  })
})

describe('validarAvaliacaoFeedback — nps (feedback legado e novo, 0..10)', () => {
  test('feedback legado (tipo resolvido "nps" pelo backfill/@default) é validado igual a antes — 0..10', () => {
    const r = validarAvaliacaoFeedback('nps', { nota: 7 }, null, 'camp-1')
    assert.equal(r.erro, null)
    assert.equal(r.nota, 7)
    assert.equal(r.util, null)
    assert.equal(r.destaqueItemId, null)
  })

  test('aceita os extremos 0 e 10', () => {
    assert.equal(validarAvaliacaoFeedback('nps', { nota: 0 }, null, 'camp-1').erro, null)
    assert.equal(validarAvaliacaoFeedback('nps', { nota: 10 }, null, 'camp-1').erro, null)
  })

  test('rejeita fora de 0..10', () => {
    assert.notEqual(validarAvaliacaoFeedback('nps', { nota: -1 }, null, 'camp-1').erro, null)
    assert.notEqual(validarAvaliacaoFeedback('nps', { nota: 11 }, null, 'camp-1').erro, null)
  })

  test('rejeita não-inteiro e nota ausente', () => {
    assert.notEqual(validarAvaliacaoFeedback('nps', { nota: 5.5 }, null, 'camp-1').erro, null)
    assert.notEqual(validarAvaliacaoFeedback('nps', {}, null, 'camp-1').erro, null)
  })
})

describe('validarAvaliacaoFeedback — csat (1..5, nunca confundido com nps)', () => {
  test('aceita os extremos 1 e 5', () => {
    const r1 = validarAvaliacaoFeedback('csat', { nota: 1 }, null, 'camp-1')
    const r5 = validarAvaliacaoFeedback('csat', { nota: 5 }, null, 'camp-1')
    assert.equal(r1.erro, null)
    assert.equal(r1.nota, 1)
    assert.equal(r5.erro, null)
    assert.equal(r5.nota, 5)
  })

  test('rejeita 0 e 6 — faixa de csat é 1..5, nunca a de nps (0..10)', () => {
    assert.notEqual(validarAvaliacaoFeedback('csat', { nota: 0 }, null, 'camp-1').erro, null)
    assert.notEqual(validarAvaliacaoFeedback('csat', { nota: 6 }, null, 'camp-1').erro, null)
  })

  test('csat nunca grava util/destaque_item_id, mesmo que só nota seja enviada', () => {
    const r = validarAvaliacaoFeedback('csat', { nota: 4 }, null, 'camp-1')
    assert.equal(r.util, null)
    assert.equal(r.destaqueItemId, null)
  })
})

describe('validarAvaliacaoFeedback — utilidade_destaque (Sim/Não por CampanhaDestaqueItem)', () => {
  test('boolean + destaque_item_id da própria campanha -> aceito, nota sempre null', () => {
    const item = { id: 'item-1', campanha_id: 'camp-1' }
    const r = validarAvaliacaoFeedback('utilidade_destaque', { util: true, destaque_item_id: 'item-1' }, item, 'camp-1')
    assert.equal(r.erro, null)
    assert.equal(r.util, true)
    assert.equal(r.destaqueItemId, 'item-1')
    assert.equal(r.nota, null)
  })

  test('util=false também é válido (não é "ausente", é uma resposta negativa de verdade)', () => {
    const item = { id: 'item-1', campanha_id: 'camp-1' }
    const r = validarAvaliacaoFeedback('utilidade_destaque', { util: false, destaque_item_id: 'item-1' }, item, 'camp-1')
    assert.equal(r.erro, null)
    assert.equal(r.util, false)
  })

  test('exige util boolean — ausente ou tipo errado é rejeitado', () => {
    const item = { id: 'item-1', campanha_id: 'camp-1' }
    assert.notEqual(validarAvaliacaoFeedback('utilidade_destaque', { destaque_item_id: 'item-1' }, item, 'camp-1').erro, null)
    assert.notEqual(validarAvaliacaoFeedback('utilidade_destaque', { util: 'sim', destaque_item_id: 'item-1' }, item, 'camp-1').erro, null)
  })

  test('exige destaque_item_id — ausente é rejeitado', () => {
    const r = validarAvaliacaoFeedback('utilidade_destaque', { util: true }, null, 'camp-1')
    assert.notEqual(r.erro, null)
  })

  test('rejeita item de OUTRA campanha (mesmo tenant) — ownership', () => {
    const itemDeOutraCampanha = { id: 'item-1', campanha_id: 'camp-outra' }
    const r = validarAvaliacaoFeedback('utilidade_destaque', { util: true, destaque_item_id: 'item-1' }, itemDeOutraCampanha, 'camp-1')
    assert.notEqual(r.erro, null)
    assert.equal(r.destaqueItemId, null)
  })

  test('rejeita item vazado de OUTRO TENANT — mesmo caminho de rejeição, nunca existe item "solto" sem passar pela campanha dele', () => {
    const itemDeOutroTenant = { id: 'item-vazado', campanha_id: 'camp-de-outro-tenant' }
    const r = validarAvaliacaoFeedback('utilidade_destaque', { util: true, destaque_item_id: 'item-vazado' }, itemDeOutroTenant, 'camp-do-tenant-atual')
    assert.notEqual(r.erro, null)
    assert.equal(r.destaqueItemId, null)
  })

  test('utilidade_destaque nunca grava nota, mesmo que nota venha no payload (campo simplesmente nunca é lido)', () => {
    const item = { id: 'item-1', campanha_id: 'camp-1' }
    const r = validarAvaliacaoFeedback('utilidade_destaque', { util: true, destaque_item_id: 'item-1', nota: 9 }, item, 'camp-1')
    assert.equal(r.nota, null)
  })
})

describe('validarAvaliacaoFeedback — tipo desconhecido', () => {
  test('tipo fora de TIPOS_AVALIACAO_FEEDBACK é rejeitado (defesa contra dado inconsistente no banco)', () => {
    const r = validarAvaliacaoFeedback('formato_que_nao_existe', { nota: 5 }, null, 'camp-1')
    assert.notEqual(r.erro, null)
  })
})

// Gating de reexibição — utilidade_destaque é independente do feedback
// geral da campanha (regra de produto: Campanha.tipo_avaliacao_feedback só
// representa nps/csat). Cobre "utilidade não interfere no gating NPS/CSAT"
// e "NPS/CSAT não interferem na utilidade": como o filtro SEMPRE usa
// tipo_avaliacao_feedback da campanha (nunca 'utilidade_destaque', porque
// esse campo nunca assume esse valor), uma resposta de utilidade_destaque
// nunca é contada como "campanha respondida", e o inverso também nunca
// acontece — são universos de tipo_avaliacao disjuntos por construção.
describe('filtroFeedbackGeralReexibicao', () => {
  test('usa tipo_avaliacao_feedback da campanha (nps) — nunca utilidade_destaque', () => {
    const r = filtroFeedbackGeralReexibicao('camp-1', 'user-1', 'nps')
    assert.deepEqual(r, { campanha_id: 'camp-1', usuario_id: 'user-1', tipo_avaliacao: 'nps' })
  })

  test('usa tipo_avaliacao_feedback da campanha (csat) — mesmo raciocínio, futuro-compatível', () => {
    const r = filtroFeedbackGeralReexibicao('camp-1', 'user-1', 'csat')
    assert.deepEqual(r, { campanha_id: 'camp-1', usuario_id: 'user-1', tipo_avaliacao: 'csat' })
  })

  test('nunca produz filtro com tipo_avaliacao "utilidade_destaque" — só ecoa o que a campanha resolve, e esse campo nunca assume esse valor', () => {
    const r = filtroFeedbackGeralReexibicao('camp-1', 'user-1', 'nps')
    assert.notEqual(r.tipo_avaliacao, 'utilidade_destaque')
  })

  test('mesmo usuario_id em outra campanha não entra na consulta de histórico', () => {
    const atual = filtroFeedbackGeralReexibicao('camp-tenant-a', 'user-igual', 'nps')
    const outroTenant = filtroFeedbackGeralReexibicao('camp-tenant-b', 'user-igual', 'nps')
    assert.notDeepEqual(atual, outroTenant)
    assert.deepEqual(atual, { campanha_id: 'camp-tenant-a', usuario_id: 'user-igual', tipo_avaliacao: 'nps' })
  })

  test('registrarFeedback valida ownership do tenant antes de consultar histórico', () => {
    const inicio = FONTE_WIDGET.indexOf('export async function registrarFeedback')
    const fim = FONTE_WIDGET.indexOf('export async function registrarUtilidadeDestaque')
    const controller = FONTE_WIDGET.slice(inicio, fim)
    const ownership = controller.indexOf('campanha.tenant_id !== resolucao.tenantId')
    const historico = controller.indexOf('verificarHistorico(campanha')
    assert.ok(ownership >= 0)
    assert.ok(historico > ownership)
  })
})

// segmentar_dominios (multi-URL do mesmo sistema, ex.: QuarkClinic) —
// comparado em lowercase nos dois lados (nunca confia que o valor salvo no
// admin já veio normalizado, defesa em profundidade além da normalização em
// campanhas.ts). Jornada reusa o mesmo passaSegmentacao/SegCampanha sem essa
// coluna — segmentar_dominios undefined equivale a lista vazia.
describe('passaSegmentacao — segmentar_dominios', () => {
  function campanhaBase(overrides: Partial<Parameters<typeof passaSegmentacao>[0]> = {}) {
    return {
      segmentar_cliente_ids: [],
      segmentar_unidade_ids: [],
      segmentar_perfis: [],
      segmentar_usuario_tipos: [],
      segmentar_estados: [],
      ...overrides,
    }
  }

  test('lista vazia (padrão) = todos os domínios', () => {
    assert.equal(passaSegmentacao(campanhaBase(), {}), true)
    assert.equal(passaSegmentacao(campanhaBase(), { dominio: 'ng.quarkclinic.com.br' }), true)
  })

  test('domínio do contexto bate com a lista, comparando em lowercase', () => {
    const campanha = campanhaBase({ segmentar_dominios: ['ng.quarkclinic.com.br'] })
    assert.equal(passaSegmentacao(campanha, { dominio: 'NG.QuarkClinic.com.br' }), true)
  })

  test('lista com valor salvo fora do padrão (defesa em profundidade) ainda compara em lowercase', () => {
    const campanha = campanhaBase({ segmentar_dominios: ['NG.QuarkClinic.com.br'] })
    assert.equal(passaSegmentacao(campanha, { dominio: 'ng.quarkclinic.com.br' }), true)
  })

  test('domínio fora da lista bloqueia', () => {
    const campanha = campanhaBase({ segmentar_dominios: ['ng.quarkclinic.com.br'] })
    assert.equal(passaSegmentacao(campanha, { dominio: 'gng.quarkclinic.com.br' }), false)
  })

  test('lista restrita sem domínio no contexto bloqueia', () => {
    const campanha = campanhaBase({ segmentar_dominios: ['ng.quarkclinic.com.br'] })
    assert.equal(passaSegmentacao(campanha, {}), false)
  })

  test('segmentar_dominios undefined (Jornada) equivale a sem restrição', () => {
    assert.equal(passaSegmentacao(campanhaBase(), { dominio: 'qualquer.dominio.com' }), true)
  })
})

// registrarConclusaoEvento (encerrar_apos_evento) precisa considerar
// segmentar_dominios como os demais segmentar_* — mesmo comportamento validado
// acima em passaSegmentacao, aqui só garantimos que o controller de fato busca
// a coluna e monta ctx.dominio (a partir do body ou de contexto.dominio).
describe('registrarConclusaoEvento — segmentação por domínio', () => {
  const inicio = FONTE_WIDGET.indexOf('export async function registrarConclusaoEvento')
  const fim = FONTE_WIDGET.indexOf('export async function registrarEventoUsuario')
  const controller = FONTE_WIDGET.slice(inicio, fim)

  test('select da query inclui segmentar_dominios', () => {
    assert.ok(controller.includes('segmentar_dominios: true'))
  })

  test('ctx.dominio é montado a partir do body ou de contexto.dominio', () => {
    assert.ok(/dominio:\s*dominio\s*\?\s*String\(dominio\)\s*:\s*\(contexto\?\.dominio/.test(controller))
  })
})
