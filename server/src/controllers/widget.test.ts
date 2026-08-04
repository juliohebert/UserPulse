import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarReexibicaoPorDias, fonteReferenciaReexibicao, ocultarTenantId } from './widget'

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
