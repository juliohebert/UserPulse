import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarReexibicaoPorDias, construirFiltroCandidatas, fonteReferenciaReexibicao, ocultarTenantId } from './widget'

const DIA_MS = 86_400_000
const AGORA = new Date('2026-07-10T12:00:00Z')

function diasAtras(dias: number): Date {
  return new Date(AGORA.getTime() - dias * DIA_MS)
}

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
    const entrada = { id: 'c1', tenant_id: 't1', titulo: 'Campanha X', ativo: true }
    const saida = ocultarTenantId(entrada)
    assert.equal('tenant_id' in saida, false)
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
