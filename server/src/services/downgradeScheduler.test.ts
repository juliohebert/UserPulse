import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { selecionarDowngradesDevidos, montarEfetivacaoDowngrade } from './downgradeScheduler'

// Fase 8B — scheduler de efetivação. Só funções puras testadas aqui (sem
// I/O, sem mock de Prisma — não é padrão do projeto): buscarCandidatosDowngrade/
// efetivarDowngrade/processarDowngradesAgendados tocam o banco de verdade,
// validados manualmente contra servidor local (mesmo limite documentado em
// todas as rodadas anteriores de billing/asaasClient).

describe('selecionarDowngradesDevidos — dia civil BRT, mesma comparação de downgradeDeveEfetivar', () => {
  // "Claim incompleto" nunca aparece aqui de propósito: essa exclusão é
  // feita pela query de buscarCandidatosDowngrade (WHERE dos 4 campos not
  // null), não por esta função — que só recebe candidatos JÁ completos.
  test('antes da data (11/09 23:59 BRT) => ignorado', () => {
    const candidatos = [{ id: 't1', downgrade_efetivar_em: new Date('2026-09-12T00:00:00Z') }]
    const agora = new Date('2026-09-11T23:59:00-03:00')
    assert.deepEqual(selecionarDowngradesDevidos(candidatos, agora), [])
  })
  test('exatamente na data (12/09 00:00 BRT) => efetivado', () => {
    const candidatos = [{ id: 't1', downgrade_efetivar_em: new Date('2026-09-12T00:00:00Z') }]
    const agora = new Date('2026-09-12T00:00:00-03:00')
    assert.deepEqual(selecionarDowngradesDevidos(candidatos, agora), candidatos)
  })
  test('depois da data (13/09 BRT) => efetivado', () => {
    const candidatos = [{ id: 't1', downgrade_efetivar_em: new Date('2026-09-12T00:00:00Z') }]
    const agora = new Date('2026-09-13T10:00:00-03:00')
    assert.deepEqual(selecionarDowngradesDevidos(candidatos, agora), candidatos)
  })
  test('mistura: só os devidos passam, os demais ficam de fora sem alterar a ordem', () => {
    const devido = { id: 'devido', downgrade_efetivar_em: new Date('2026-09-01T00:00:00Z') }
    const futuro = { id: 'futuro', downgrade_efetivar_em: new Date('2026-12-01T00:00:00Z') }
    const resultado = selecionarDowngradesDevidos([devido, futuro], new Date('2026-09-12T00:00:00-03:00'))
    assert.deepEqual(resultado, [devido])
  })
})

describe('montarEfetivacaoDowngrade — payload puro do updateMany atômico', () => {
  const tenant = {
    id: 'tenant-1',
    plano_downgrade_id: 'plano-starter',
    downgrade_efetivar_em: new Date('2026-09-12T00:00:00Z'),
    downgrade_valor_origem: 349,
    downgrade_valor_destino: 149,
  }

  test('plano_id recebe plano_downgrade_id', () => {
    assert.equal(montarEfetivacaoDowngrade(tenant).data.plano_id, 'plano-starter')
  })

  // Caso exato da tarefa: downgrade agendado com destino=149, catálogo do
  // Starter muda pra 179 DEPOIS do agendamento — a função nem recebe o
  // preço de catálogo como parâmetro, então valor_assinatura_atual só pode
  // vir do snapshot (149), nunca do catálogo.
  test('valor_assinatura_atual recebe downgrade_valor_destino (snapshot), nunca preço de catálogo — função nem recebe esse dado', () => {
    const catalogoAtualIrrelevante = 179 // nunca passado pra montarEfetivacaoDowngrade
    const payload = montarEfetivacaoDowngrade(tenant)
    assert.equal(payload.data.valor_assinatura_atual, 149)
    assert.notEqual(payload.data.valor_assinatura_atual, catalogoAtualIrrelevante)
  })

  test('campos de downgrade são limpos (todos null) no data', () => {
    const { data } = montarEfetivacaoDowngrade(tenant)
    assert.equal(data.plano_downgrade_id, null)
    assert.equal(data.downgrade_efetivar_em, null)
    assert.equal(data.downgrade_valor_origem, null)
    assert.equal(data.downgrade_valor_destino, null)
  })

  test('data nunca inclui licenca_fim/proxima_cobranca/asaas_subscription_id/asaas_status/status/plano_pendente_id/plano_pendente_payment_id', () => {
    const { data } = montarEfetivacaoDowngrade(tenant)
    const chaves = Object.keys(data)
    for (const proibido of [
      'licenca_fim', 'proxima_cobranca', 'asaas_subscription_id', 'asaas_status',
      'status', 'plano_pendente_id', 'plano_pendente_payment_id',
    ]) {
      assert.equal(chaves.includes(proibido), false, `data não deveria conter "${proibido}"`)
    }
  })

  test('where protege id + os 4 snapshots exatos lidos (nunca um update cego)', () => {
    const { where } = montarEfetivacaoDowngrade(tenant)
    assert.deepEqual(where, {
      id: 'tenant-1',
      plano_downgrade_id: 'plano-starter',
      downgrade_efetivar_em: tenant.downgrade_efetivar_em,
      downgrade_valor_origem: 349,
      downgrade_valor_destino: 149,
    })
  })
})
