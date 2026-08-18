import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ModuloPainel } from '@prisma/client'
import {
  validarPayloadPermissoes,
  motivoBloqueioAlvoPermissoes,
  montarRespostaPermissoes,
} from './adminTenantsPermissoes'

// Fase 2 de permissões personalizadas — API de gestão. Só função pura aqui
// (sem Prisma/IO), mesmo espírito de adminTenants.test.ts
// (montarDadosResetSenhaAdministrativo): os caminhos que tocam banco
// (consultarPermissoes/salvarPermissoes/desativarPermissoes) delegam toda
// decisão pras funções puras testadas abaixo, então cobrir estas já cobre a
// lógica de negócio inteira sem precisar de Postgres rodando.

// ─── validarPayloadPermissoes ───────────────────────────────────────────────

describe('validarPayloadPermissoes — payload explícito e validado, nunca inventa nada', () => {
  test('permissoes ausente no body => erro (nunca um default silencioso pra [])', () => {
    const r = validarPayloadPermissoes({})
    assert.equal(r.ok, false)
  })

  test('body nulo/undefined => erro', () => {
    assert.equal(validarPayloadPermissoes(null).ok, false)
    assert.equal(validarPayloadPermissoes(undefined).ok, false)
  })

  test('permissoes não é array (ex.: string, objeto) => erro', () => {
    assert.equal(validarPayloadPermissoes({ permissoes: 'CAMPANHAS' }).ok, false)
    assert.equal(validarPayloadPermissoes({ permissoes: { CAMPANHAS: 'GERENCIAR' } }).ok, false)
  })

  test('permissoes: [] (matriz completa vazia, ativa com tudo NENHUM) => válido', () => {
    const r = validarPayloadPermissoes({ permissoes: [] })
    assert.equal(r.ok, true)
    if (r.ok) assert.deepEqual(r.permissoes, [])
  })

  test('módulo desconhecido => erro citando o módulo', () => {
    const r = validarPayloadPermissoes({ permissoes: [{ modulo: 'FATURAMENTO', nivel: 'GERENCIAR' }] })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.erro, /FATURAMENTO/)
  })

  test('nível desconhecido => erro citando o módulo e o nível', () => {
    const r = validarPayloadPermissoes({ permissoes: [{ modulo: 'CAMPANHAS', nivel: 'ESCREVER' }] })
    assert.equal(r.ok, false)
    if (!r.ok) { assert.match(r.erro, /CAMPANHAS/); assert.match(r.erro, /ESCREVER/) }
  })

  test('módulo duplicado no payload => erro', () => {
    const r = validarPayloadPermissoes({
      permissoes: [
        { modulo: 'CAMPANHAS', nivel: 'GERENCIAR' },
        { modulo: 'CAMPANHAS', nivel: 'VISUALIZAR' },
      ],
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.erro, /duplicado/i)
  })

  test('matriz completa com os 4 módulos válidos => aceita e preserva a ordem/valores enviados', () => {
    const r = validarPayloadPermissoes({
      permissoes: [
        { modulo: 'CAMPANHAS', nivel: 'GERENCIAR' },
        { modulo: 'TOURS', nivel: 'VISUALIZAR' },
        { modulo: 'JORNADAS', nivel: 'NENHUM' },
        { modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' },
      ],
    })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.deepEqual(r.permissoes, [
        { modulo: 'CAMPANHAS', nivel: 'GERENCIAR' },
        { modulo: 'TOURS', nivel: 'VISUALIZAR' },
        { modulo: 'JORNADAS', nivel: 'NENHUM' },
        { modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' },
      ])
    }
  })

  test('NENHUM explícito é aceito (não filtrado/ignorado na validação)', () => {
    const r = validarPayloadPermissoes({ permissoes: [{ modulo: 'TOURS', nivel: 'NENHUM' }] })
    assert.equal(r.ok, true)
    if (r.ok) assert.deepEqual(r.permissoes, [{ modulo: 'TOURS', nivel: 'NENHUM' }])
  })

  test('item sem modulo ou sem nivel => erro (não assume valor)', () => {
    assert.equal(validarPayloadPermissoes({ permissoes: [{ nivel: 'GERENCIAR' }] }).ok, false)
    assert.equal(validarPayloadPermissoes({ permissoes: [{ modulo: 'CAMPANHAS' }] }).ok, false)
  })
})

// ─── motivoBloqueioAlvoPermissoes ───────────────────────────────────────────

describe('motivoBloqueioAlvoPermissoes — quem pode ser alvo de personalização', () => {
  test('usuarioAlvo=null (não encontrado OU de outro tenant — mesmo caminho, nunca revela cross-tenant) => 404', () => {
    const b = motivoBloqueioAlvoPermissoes(null)
    assert.equal(b?.status, 404)
  })

  test('alvo SUPER_ADMIN => 403, nunca recebe personalização', () => {
    const b = motivoBloqueioAlvoPermissoes({ role: 'SUPER_ADMIN' })
    assert.equal(b?.status, 403)
  })

  for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) {
    test(`alvo ${role} => permitido (sem bloqueio)`, () => {
      assert.equal(motivoBloqueioAlvoPermissoes({ role }), null)
    })
  }
})

// ─── montarRespostaPermissoes ───────────────────────────────────────────────

describe('montarRespostaPermissoes — contrato de resposta (role, flag, efetivas, salvas)', () => {
  test('flag=false — permissoes_efetivas reflete o padrão da role (reuso do helper da Fase 1, nunca duplicado)', () => {
    const resp = montarRespostaPermissoes({ role: 'EDITOR', permissoes_personalizadas: false }, [])
    assert.equal(resp.role, 'EDITOR')
    assert.equal(resp.permissoes_personalizadas, false)
    assert.equal(resp.permissoes_efetivas.CAMPANHAS, 'GERENCIAR')
    // EDITOR em CONFIGURACOES é NENHUM por padrão (ajuste pós-revisão da
    // Fase 4) — antes da Fase 4 a rota inteira era ADMIN/SUPER_ADMIN-only.
    assert.equal(resp.permissoes_efetivas.CONFIGURACOES, 'NENHUM')
  })

  test('permissoes_personalizadas_salvas é null pra módulo sem linha salva', () => {
    const resp = montarRespostaPermissoes({ role: 'VIEWER', permissoes_personalizadas: false }, [])
    for (const modulo of Object.values(ModuloPainel)) {
      assert.equal(resp.permissoes_personalizadas_salvas[modulo], null)
    }
  })

  test('flag=true com matriz completa — permissoes_efetivas reflete exatamente o que foi salvo', () => {
    const linhas = [
      { modulo: 'CAMPANHAS' as ModuloPainel, nivel: 'GERENCIAR' as const },
      { modulo: 'TOURS' as ModuloPainel, nivel: 'VISUALIZAR' as const },
      { modulo: 'JORNADAS' as ModuloPainel, nivel: 'NENHUM' as const },
      { modulo: 'CONFIGURACOES' as ModuloPainel, nivel: 'GERENCIAR' as const },
    ]
    const resp = montarRespostaPermissoes({ role: 'VIEWER', permissoes_personalizadas: true }, linhas)
    assert.equal(resp.permissoes_efetivas.CAMPANHAS, 'GERENCIAR')
    assert.equal(resp.permissoes_efetivas.TOURS, 'VISUALIZAR')
    assert.equal(resp.permissoes_efetivas.JORNADAS, 'NENHUM')
    assert.equal(resp.permissoes_efetivas.CONFIGURACOES, 'GERENCIAR')
  })

  test('NENHUM persistido explicitamente aparece em permissoes_personalizadas_salvas (não vira null)', () => {
    const resp = montarRespostaPermissoes(
      { role: 'ADMIN', permissoes_personalizadas: true },
      [{ modulo: 'JORNADAS', nivel: 'NENHUM' }]
    )
    assert.equal(resp.permissoes_personalizadas_salvas.JORNADAS, 'NENHUM')
    assert.equal(resp.permissoes_efetivas.JORNADAS, 'NENHUM')
  })

  test('módulo ausente do payload salvo => efetiva NENHUM, salva null (ausência de linha = NENHUM)', () => {
    const resp = montarRespostaPermissoes(
      { role: 'ADMIN', permissoes_personalizadas: true },
      [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }]
    )
    assert.equal(resp.permissoes_personalizadas_salvas.TOURS, null)
    assert.equal(resp.permissoes_efetivas.TOURS, 'NENHUM')
  })

  test('SUPER_ADMIN — permissoes_efetivas sempre GERENCIAR, mesmo com flag=true e linhas NENHUM (regra 1, nunca duplicada aqui)', () => {
    const resp = montarRespostaPermissoes(
      { role: 'SUPER_ADMIN', permissoes_personalizadas: true },
      [{ modulo: 'CAMPANHAS', nivel: 'NENHUM' }]
    )
    for (const modulo of Object.values(ModuloPainel)) {
      assert.equal(resp.permissoes_efetivas[modulo], 'GERENCIAR')
    }
  })

  // Prova de "desativar personalização => volta pra role" e "permissões
  // antigas não ficam efetivas após desativar": mesma linha salva (matriz
  // antiga), só o flag muda de true pra false — permissoes_efetivas some,
  // permissoes_personalizadas_salvas continua mostrando a matriz antiga
  // (dormente, não apagada — ver comentário em desativarPermissoes).
  test('desativar (flag true → false) com a MESMA matriz salva: efetivas voltam pra role, salvas continuam visíveis', () => {
    const matrizAntiga = [
      { modulo: 'CAMPANHAS' as ModuloPainel, nivel: 'GERENCIAR' as const },
      { modulo: 'TOURS' as ModuloPainel, nivel: 'GERENCIAR' as const },
    ]

    const comPersonalizacao = montarRespostaPermissoes({ role: 'VIEWER', permissoes_personalizadas: true }, matrizAntiga)
    assert.equal(comPersonalizacao.permissoes_efetivas.CAMPANHAS, 'GERENCIAR')
    assert.equal(comPersonalizacao.permissoes_efetivas.TOURS, 'GERENCIAR')

    const desativado = montarRespostaPermissoes({ role: 'VIEWER', permissoes_personalizadas: false }, matrizAntiga)
    // Volta pro padrão da role VIEWER (VISUALIZAR em CAMPANHAS/TOURS) — a
    // matriz de GERENCIAR salva não fica mais efetiva.
    assert.equal(desativado.permissoes_efetivas.CAMPANHAS, 'VISUALIZAR')
    assert.equal(desativado.permissoes_efetivas.TOURS, 'VISUALIZAR')
    // Mas continua visível como "salva", pra caso reative depois.
    assert.equal(desativado.permissoes_personalizadas_salvas.CAMPANHAS, 'GERENCIAR')
    assert.equal(desativado.permissoes_personalizadas_salvas.TOURS, 'GERENCIAR')
  })

  test('atualizar matriz existente: nova chamada com matriz diferente substitui as efetivas por completo', () => {
    const matrizV1 = [{ modulo: 'CAMPANHAS' as ModuloPainel, nivel: 'VISUALIZAR' as const }]
    const respV1 = montarRespostaPermissoes({ role: 'EDITOR', permissoes_personalizadas: true }, matrizV1)
    assert.equal(respV1.permissoes_efetivas.CAMPANHAS, 'VISUALIZAR')

    const matrizV2 = [{ modulo: 'CAMPANHAS' as ModuloPainel, nivel: 'GERENCIAR' as const }]
    const respV2 = montarRespostaPermissoes({ role: 'EDITOR', permissoes_personalizadas: true }, matrizV2)
    assert.equal(respV2.permissoes_efetivas.CAMPANHAS, 'GERENCIAR')
  })
})
