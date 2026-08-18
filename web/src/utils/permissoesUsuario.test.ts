import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { PermissoesUsuario } from '../types'
import {
  matrizInicialPorRole,
  formularioInicialDePermissoes,
  montarPayloadPermissoes,
  metodoParaSalvarPermissoes,
  podeReceberPersonalizacao,
  rotuloIndicadorPersonalizacao,
  MODULOS_PAINEL,
} from './permissoesUsuario'

// Fase 3 de permissões personalizadas — só lógica pura (sem React/DOM/fetch
// aqui), mesmo espírito de campanhaForm.test.ts: cobre hidratação
// (GET -> formulário) e geração de payload (formulário -> PUT); a
// integração real com a API é validada manualmente contra um servidor
// local, mesmo padrão do restante do projeto (ver CLAUDE.md).

function respostaBase(over: Partial<PermissoesUsuario> = {}): PermissoesUsuario {
  return {
    role: 'EDITOR',
    permissoes_personalizadas: false,
    permissoes_efetivas: { CAMPANHAS: 'GERENCIAR', TOURS: 'GERENCIAR', JORNADAS: 'GERENCIAR', CONFIGURACOES: 'VISUALIZAR' },
    permissoes_personalizadas_salvas: { CAMPANHAS: null, TOURS: null, JORNADAS: null, CONFIGURACOES: null },
    ...over,
  }
}

describe('matrizInicialPorRole — role -> matriz inicial', () => {
  test('ADMIN -> GERENCIAR nos 3 módulos de conteúdo e em CONFIGURACOES', () => {
    const m = matrizInicialPorRole('ADMIN')
    assert.equal(m.CAMPANHAS, 'GERENCIAR')
    assert.equal(m.TOURS, 'GERENCIAR')
    assert.equal(m.JORNADAS, 'GERENCIAR')
    assert.equal(m.CONFIGURACOES, 'GERENCIAR')
  })

  // Ajuste pós-revisão (retrocompatibilidade da Fase 4): EDITOR/VIEWER são
  // NENHUM em CONFIGURACOES, não VISUALIZAR — antes da Fase 4 a rota de
  // Configurações inteira era ADMIN/SUPER_ADMIN-only.
  test('EDITOR -> GERENCIAR em conteúdo, mas NENHUM em CONFIGURACOES', () => {
    const m = matrizInicialPorRole('EDITOR')
    assert.equal(m.CAMPANHAS, 'GERENCIAR')
    assert.equal(m.CONFIGURACOES, 'NENHUM')
  })

  test('VIEWER -> VISUALIZAR em conteúdo, mas NENHUM em CONFIGURACOES', () => {
    const m = matrizInicialPorRole('VIEWER')
    assert.equal(m.CAMPANHAS, 'VISUALIZAR')
    assert.equal(m.TOURS, 'VISUALIZAR')
    assert.equal(m.JORNADAS, 'VISUALIZAR')
    assert.equal(m.CONFIGURACOES, 'NENHUM')
  })

  test('sempre retorna os 4 módulos, nunca omite nenhum', () => {
    const m = matrizInicialPorRole('VIEWER')
    assert.deepEqual(Object.keys(m).sort(), [...MODULOS_PAINEL].sort())
  })
})

describe('formularioInicialDePermissoes — matriz salva/resposta -> formulário', () => {
  test('personalização ativa -> usa permissoes_efetivas, switch ligado', () => {
    const resp = respostaBase({
      permissoes_personalizadas: true,
      permissoes_efetivas: { CAMPANHAS: 'GERENCIAR', TOURS: 'NENHUM', JORNADAS: 'VISUALIZAR', CONFIGURACOES: 'GERENCIAR' },
    })
    const form = formularioInicialDePermissoes(resp)
    assert.equal(form.personalizado, true)
    assert.deepEqual(form.matriz, { CAMPANHAS: 'GERENCIAR', TOURS: 'NENHUM', JORNADAS: 'VISUALIZAR', CONFIGURACOES: 'GERENCIAR' })
  })

  test('inativa, mas com matriz salva anterior -> preserva a matriz salva pra eventual reativação (switch continua desligado)', () => {
    const resp = respostaBase({
      permissoes_personalizadas: false,
      permissoes_personalizadas_salvas: { CAMPANHAS: 'GERENCIAR', TOURS: null, JORNADAS: 'VISUALIZAR', CONFIGURACOES: null },
    })
    const form = formularioInicialDePermissoes(resp)
    assert.equal(form.personalizado, false)
    // módulo salvo aparece igual; módulo nunca salvo (ausência) vira NENHUM,
    // mesma regra do backend (nunca herda de outro módulo/role).
    assert.deepEqual(form.matriz, { CAMPANHAS: 'GERENCIAR', TOURS: 'NENHUM', JORNADAS: 'VISUALIZAR', CONFIGURACOES: 'NENHUM' })
  })

  test('inativa e nunca houve matriz salva -> pré-preenche equivalente à role atual', () => {
    const resp = respostaBase({ role: 'VIEWER', permissoes_personalizadas: false })
    const form = formularioInicialDePermissoes(resp)
    assert.equal(form.personalizado, false)
    assert.deepEqual(form.matriz, matrizInicialPorRole('VIEWER'))
  })
})

describe('montarPayloadPermissoes — formulário -> payload completo dos 4 módulos', () => {
  test('inclui os 4 módulos explicitamente, inclusive NENHUM', () => {
    const payload = montarPayloadPermissoes({ CAMPANHAS: 'GERENCIAR', TOURS: 'NENHUM', JORNADAS: 'VISUALIZAR', CONFIGURACOES: 'NENHUM' })
    assert.equal(payload.permissoes.length, 4)
    assert.deepEqual(
      payload.permissoes.map(p => p.modulo).sort(),
      [...MODULOS_PAINEL].sort()
    )
    assert.ok(payload.permissoes.some(p => p.modulo === 'TOURS' && p.nivel === 'NENHUM'))
    assert.ok(payload.permissoes.some(p => p.modulo === 'CONFIGURACOES' && p.nivel === 'NENHUM'))
  })

  test('nunca omite um módulo mesmo quando todos são NENHUM', () => {
    const matrizVazia = { CAMPANHAS: 'NENHUM', TOURS: 'NENHUM', JORNADAS: 'NENHUM', CONFIGURACOES: 'NENHUM' } as const
    const payload = montarPayloadPermissoes(matrizVazia)
    assert.equal(payload.permissoes.length, 4)
  })
})

describe('metodoParaSalvarPermissoes — switch ativo/desativado decide PUT ou DELETE', () => {
  test('personalizado=true -> PUT', () => {
    assert.equal(metodoParaSalvarPermissoes(true), 'PUT')
  })
  test('personalizado=false -> DELETE (volta pra role)', () => {
    assert.equal(metodoParaSalvarPermissoes(false), 'DELETE')
  })
})

describe('podeReceberPersonalizacao — SUPER_ADMIN sem ação', () => {
  test('SUPER_ADMIN não pode receber personalização', () => {
    assert.equal(podeReceberPersonalizacao('SUPER_ADMIN'), false)
  })
  for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) {
    test(`${role} pode receber personalização`, () => {
      assert.equal(podeReceberPersonalizacao(role), true)
    })
  }
})

describe('rotuloIndicadorPersonalizacao — indicador PERSONALIZADO na listagem', () => {
  test('personalizado=true -> mostra o rótulo', () => {
    assert.equal(rotuloIndicadorPersonalizacao(true), 'PERSONALIZADO')
  })
  test('personalizado=false -> nada a mostrar', () => {
    assert.equal(rotuloIndicadorPersonalizacao(false), null)
  })
})
