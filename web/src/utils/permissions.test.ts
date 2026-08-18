import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { AdminRole, AdminUser, ModuloPainel, NivelAcessoModulo } from '../types'
import { podeVisualizarModulo, podeGerenciarModulo, podeExcluirOuImportarModulo, podeEscreverConfiguracao } from './permissions'

// Fase 4 de permissões personalizadas — só função pura aqui (sem React/DOM),
// mesmo espírito de permissoesUsuario.test.ts. user.permissoes_efetivas já
// vem calculado pelo backend (mesma nivelAcessoEfetivo testada em
// server/src/lib/permissoesModulo.test.ts) — estes testes cobrem só a
// COMPARAÇÃO que o front faz em cima do valor já pronto, nunca reimplementam
// a regra de autorização.

function usuario(over: {
  role?: AdminRole
  efetivas?: Partial<Record<ModuloPainel, NivelAcessoModulo>>
} = {}): AdminUser {
  const base: Record<ModuloPainel, NivelAcessoModulo> = {
    CAMPANHAS: 'NENHUM', TOURS: 'NENHUM', JORNADAS: 'NENHUM', CONFIGURACOES: 'NENHUM',
  }
  return {
    id: 'u1', nome: 'Ana', email: 'ana@acme.com', role: over.role ?? 'EDITOR',
    ativo: true, senha_temporaria: false, precisa_trocar_senha: false,
    permissoes_personalizadas: false,
    permissoes_efetivas: { ...base, ...over.efetivas },
    criado_em: '', atualizado_em: '',
    tenant: {} as AdminUser['tenant'],
  }
}

describe('podeVisualizarModulo — VISUALIZAR (ou mais) libera menu/rota/leitura; NENHUM bloqueia', () => {
  test('NENHUM => false (esconde menu, bloqueia rota)', () => {
    const u = usuario({ efetivas: { CAMPANHAS: 'NENHUM' } })
    assert.equal(podeVisualizarModulo(u, 'CAMPANHAS'), false)
  })
  test('VISUALIZAR => true (permite leitura)', () => {
    const u = usuario({ efetivas: { CAMPANHAS: 'VISUALIZAR' } })
    assert.equal(podeVisualizarModulo(u, 'CAMPANHAS'), true)
  })
  test('GERENCIAR => true (GERENCIAR implica VISUALIZAR)', () => {
    const u = usuario({ efetivas: { CAMPANHAS: 'GERENCIAR' } })
    assert.equal(podeVisualizarModulo(u, 'CAMPANHAS'), true)
  })
  test('sem usuário (deslogado) => false em qualquer módulo', () => {
    assert.equal(podeVisualizarModulo(null, 'CAMPANHAS'), false)
    assert.equal(podeVisualizarModulo(undefined, 'TOURS'), false)
  })
})

describe('podeGerenciarModulo — GERENCIAR libera escrita comum; VISUALIZAR bloqueia', () => {
  test('NENHUM => false', () => {
    assert.equal(podeGerenciarModulo(usuario({ efetivas: { CAMPANHAS: 'NENHUM' } }), 'CAMPANHAS'), false)
  })
  test('VISUALIZAR => false (lê, não escreve)', () => {
    assert.equal(podeGerenciarModulo(usuario({ efetivas: { CAMPANHAS: 'VISUALIZAR' } }), 'CAMPANHAS'), false)
  })
  test('GERENCIAR => true', () => {
    assert.equal(podeGerenciarModulo(usuario({ efetivas: { CAMPANHAS: 'GERENCIAR' } }), 'CAMPANHAS'), true)
  })
})

describe('módulo não libera outro módulo (isolamento)', () => {
  test('GERENCIAR em CAMPANHAS não libera visualizar/gerenciar em TOURS', () => {
    const u = usuario({ efetivas: { CAMPANHAS: 'GERENCIAR', TOURS: 'NENHUM' } })
    assert.equal(podeGerenciarModulo(u, 'CAMPANHAS'), true)
    assert.equal(podeVisualizarModulo(u, 'TOURS'), false)
    assert.equal(podeGerenciarModulo(u, 'TOURS'), false)
  })
})

describe('podeExcluirOuImportarModulo — exige GERENCIAR + teto ADMIN/SUPER_ADMIN', () => {
  test('ADMIN + GERENCIAR => true (exclui/importa)', () => {
    const u = usuario({ role: 'ADMIN', efetivas: { TOURS: 'GERENCIAR' } })
    assert.equal(podeExcluirOuImportarModulo(u, 'TOURS'), true)
  })
  test('SUPER_ADMIN + GERENCIAR => true (irrestrito)', () => {
    const u = usuario({ role: 'SUPER_ADMIN', efetivas: { TOURS: 'GERENCIAR', JORNADAS: 'GERENCIAR' } })
    assert.equal(podeExcluirOuImportarModulo(u, 'TOURS'), true)
    assert.equal(podeExcluirOuImportarModulo(u, 'JORNADAS'), true)
  })
  test('EDITOR + GERENCIAR => false (teto da role barra, mesmo com GERENCIAR efetivo)', () => {
    const u = usuario({ role: 'EDITOR', efetivas: { TOURS: 'GERENCIAR' } })
    assert.equal(podeGerenciarModulo(u, 'TOURS'), true)
    assert.equal(podeExcluirOuImportarModulo(u, 'TOURS'), false)
  })
  test('VIEWER + GERENCIAR => false (teto da role barra, mesmo com GERENCIAR efetivo)', () => {
    const u = usuario({ role: 'VIEWER', efetivas: { TOURS: 'GERENCIAR' } })
    assert.equal(podeGerenciarModulo(u, 'TOURS'), true)
    assert.equal(podeExcluirOuImportarModulo(u, 'TOURS'), false)
  })
  test('ADMIN + VISUALIZAR => false (GERENCIAR é exigido, não só o teto da role)', () => {
    const u = usuario({ role: 'ADMIN', efetivas: { TOURS: 'VISUALIZAR' } })
    assert.equal(podeExcluirOuImportarModulo(u, 'TOURS'), false)
  })
})

describe('flag=false mantém UI atual por role (sem regressão) — padrão espelhado de lib/permissoesModulo.ts', () => {
  // CONFIGURACOES: EDITOR/VIEWER são NENHUM (ajuste pós-revisão da Fase 4)
  // — os únicos dois papéis, dos 4 módulos, que ficam de fora do menu/rota
  // por padrão. Os outros 3 módulos continuam abertos (VISUALIZAR+) pra
  // qualquer papel autenticado, como sempre foram.
  const PADRAO: Record<ModuloPainel, Record<Exclude<AdminRole, 'SUPER_ADMIN'>, NivelAcessoModulo>> = {
    CAMPANHAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
    TOURS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
    JORNADAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
    CONFIGURACOES: { ADMIN: 'GERENCIAR', EDITOR: 'NENHUM', VIEWER: 'NENHUM' },
  }
  const MODULOS: ModuloPainel[] = ['CAMPANHAS', 'TOURS', 'JORNADAS', 'CONFIGURACOES']

  for (const modulo of MODULOS) {
    for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) {
      const nivel = PADRAO[modulo][role]
      const visualiza = nivel !== 'NENHUM'
      test(`${role} em ${modulo} (sem personalização) => visualiza=${visualiza}, gerencia=${nivel === 'GERENCIAR'}`, () => {
        const u = usuario({ role, efetivas: { [modulo]: nivel } })
        assert.equal(podeVisualizarModulo(u, modulo), visualiza)
        assert.equal(podeGerenciarModulo(u, modulo), nivel === 'GERENCIAR')
      })
    }
  }

  test('SUPER_ADMIN irrestrito em todos os módulos', () => {
    const u = usuario({
      role: 'SUPER_ADMIN',
      efetivas: { CAMPANHAS: 'GERENCIAR', TOURS: 'GERENCIAR', JORNADAS: 'GERENCIAR', CONFIGURACOES: 'GERENCIAR' },
    })
    for (const modulo of MODULOS) {
      assert.equal(podeVisualizarModulo(u, modulo), true)
      assert.equal(podeGerenciarModulo(u, modulo), true)
      assert.equal(podeExcluirOuImportarModulo(u, modulo), true)
    }
  })
})

// Ajuste pós-revisão da Fase 4 — cobertura direta pedida na tarefa.
describe('CONFIGURACOES — retrocompatibilidade da Fase 4 (ajuste pós-revisão)', () => {
  test('EDITOR, flag=false => NENHUM (esconde menu, bloqueia rota)', () => {
    const u = usuario({ role: 'EDITOR', efetivas: { CONFIGURACOES: 'NENHUM' } })
    assert.equal(podeVisualizarModulo(u, 'CONFIGURACOES'), false)
  })
  test('VIEWER, flag=false => NENHUM (esconde menu, bloqueia rota)', () => {
    const u = usuario({ role: 'VIEWER', efetivas: { CONFIGURACOES: 'NENHUM' } })
    assert.equal(podeVisualizarModulo(u, 'CONFIGURACOES'), false)
  })
  test('ADMIN, flag=false => GERENCIAR (menu, rota e escrita)', () => {
    const u = usuario({ role: 'ADMIN', efetivas: { CONFIGURACOES: 'GERENCIAR' } })
    assert.equal(podeVisualizarModulo(u, 'CONFIGURACOES'), true)
    assert.equal(podeGerenciarModulo(u, 'CONFIGURACOES'), true)
  })
  test('EDITOR personalizado com VISUALIZAR em CONFIGURACOES => acessa leitura (concedido explicitamente)', () => {
    const u = usuario({ role: 'EDITOR', efetivas: { CONFIGURACOES: 'VISUALIZAR' } })
    assert.equal(podeVisualizarModulo(u, 'CONFIGURACOES'), true)
    assert.equal(podeGerenciarModulo(u, 'CONFIGURACOES'), false)
  })
  test('VIEWER personalizado com GERENCIAR em CONFIGURACOES => acessa escrita funcional (concedido explicitamente)', () => {
    const u = usuario({ role: 'VIEWER', efetivas: { CONFIGURACOES: 'GERENCIAR' } })
    assert.equal(podeGerenciarModulo(u, 'CONFIGURACOES'), true)
  })
  test('desativar personalização — efetivas volta pro padrão da role, EDITOR/VIEWER perdem o acesso concedido', () => {
    // permissoes_efetivas já reflete a decisão do backend (nivelAcessoEfetivo)
    // — depois de desativar, o backend recalcula pro padrão da role
    // (NENHUM), então o front nunca vê mais o VISUALIZAR/GERENCIAR
    // concedido antes, mesmo que a matriz continue salva no servidor.
    const comPersonalizacao = usuario({ role: 'EDITOR', efetivas: { CONFIGURACOES: 'GERENCIAR' } })
    assert.equal(podeGerenciarModulo(comPersonalizacao, 'CONFIGURACOES'), true)

    const desativado = usuario({ role: 'EDITOR', efetivas: { CONFIGURACOES: 'NENHUM' } })
    assert.equal(podeVisualizarModulo(desativado, 'CONFIGURACOES'), false)
    assert.equal(podeGerenciarModulo(desativado, 'CONFIGURACOES'), false)
  })
})

describe('podeEscreverConfiguracao — legado, só pra Billing/Minha Assinatura (sem regressão)', () => {
  test('SUPER_ADMIN e ADMIN podem', () => {
    assert.equal(podeEscreverConfiguracao('SUPER_ADMIN'), true)
    assert.equal(podeEscreverConfiguracao('ADMIN'), true)
  })
  test('EDITOR e VIEWER não podem', () => {
    assert.equal(podeEscreverConfiguracao('EDITOR'), false)
    assert.equal(podeEscreverConfiguracao('VIEWER'), false)
  })
  test('undefined (deslogado) não pode', () => {
    assert.equal(podeEscreverConfiguracao(undefined), false)
  })
})
