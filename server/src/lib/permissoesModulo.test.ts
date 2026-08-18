import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AdminRole, ModuloPainel, NivelAcessoModulo } from '@prisma/client'
import { nivelAcessoEfetivo, possuiNivelMinimo, type SujeitoPermissao } from './permissoesModulo'

// Fase 1 de permissões personalizadas por usuário — cobertura das 4 regras
// fechadas da tarefa (ver comentário no topo de permissoesModulo.ts). Só
// função pura, sem Prisma/IO, mesmo espírito de tenantGuards.test.ts.

const TODOS_OS_MODULOS = Object.values(ModuloPainel)

function sujeito(
  role: AdminRole,
  permissoes_personalizadas = false,
  permissoes: { modulo: ModuloPainel; nivel: NivelAcessoModulo }[] = []
): SujeitoPermissao {
  return { role, permissoes_personalizadas, permissoes }
}

describe('nivelAcessoEfetivo — regra 1: SUPER_ADMIN sempre GERENCIAR', () => {
  for (const modulo of TODOS_OS_MODULOS) {
    test(`${modulo}, permissoes_personalizadas=false`, () => {
      assert.equal(nivelAcessoEfetivo(sujeito('SUPER_ADMIN', false), modulo), 'GERENCIAR')
    })
    test(`${modulo}, permissoes_personalizadas=true, sem nenhuma linha`, () => {
      assert.equal(nivelAcessoEfetivo(sujeito('SUPER_ADMIN', true, []), modulo), 'GERENCIAR')
    })
    test(`${modulo}, permissoes_personalizadas=true, com linha NENHUM explícita — SUPER_ADMIN ignora`, () => {
      const s = sujeito('SUPER_ADMIN', true, [{ modulo, nivel: 'NENHUM' }])
      assert.equal(nivelAcessoEfetivo(s, modulo), 'GERENCIAR')
    })
  }
})

describe('nivelAcessoEfetivo — regra 2: permissoes_personalizadas=false usa o padrão da role (sem regressão)', () => {
  // CONFIGURACOES: EDITOR/VIEWER são NENHUM (ajuste pós-revisão da Fase 4) —
  // antes da Fase 4 a rota inteira era ADMIN/SUPER_ADMIN-only, flag=false
  // precisa preservar exatamente isso.
  const ESPERADO: Record<ModuloPainel, Record<Exclude<AdminRole, 'SUPER_ADMIN'>, NivelAcessoModulo>> = {
    CAMPANHAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
    TOURS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
    JORNADAS: { ADMIN: 'GERENCIAR', EDITOR: 'GERENCIAR', VIEWER: 'VISUALIZAR' },
    CONFIGURACOES: { ADMIN: 'GERENCIAR', EDITOR: 'NENHUM', VIEWER: 'NENHUM' },
  }

  for (const modulo of TODOS_OS_MODULOS) {
    for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) {
      test(`${role} em ${modulo} => ${ESPERADO[modulo][role]}`, () => {
        assert.equal(nivelAcessoEfetivo(sujeito(role, false), modulo), ESPERADO[modulo][role])
      })
    }
  }

  test('permissoes_personalizadas=false ignora qualquer linha de override presente (nunca deveria existir, mas por segurança)', () => {
    const s = sujeito('VIEWER', false, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }])
    assert.equal(nivelAcessoEfetivo(s, 'CAMPANHAS'), 'VISUALIZAR')
  })
})

describe('nivelAcessoEfetivo — regras 3 e 4: permissoes_personalizadas=true é autoritativo; sem linha => NENHUM', () => {
  test('ADMIN com permissoes_personalizadas=true e NENHUMA linha => NENHUM em todos os módulos (role deixa de importar)', () => {
    const s = sujeito('ADMIN', true, [])
    for (const modulo of TODOS_OS_MODULOS) {
      assert.equal(nivelAcessoEfetivo(s, modulo), 'NENHUM')
    }
  })

  test('VIEWER com permissoes_personalizadas=true e GERENCIAR em CAMPANHAS => GERENCIAR (role não limita mais)', () => {
    const s = sujeito('VIEWER', true, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }])
    assert.equal(nivelAcessoEfetivo(s, 'CAMPANHAS'), 'GERENCIAR')
  })

  test('ADMIN com permissoes_personalizadas=true e VISUALIZAR em TOURS => VISUALIZAR (role não eleva mais)', () => {
    const s = sujeito('ADMIN', true, [{ modulo: 'TOURS', nivel: 'VISUALIZAR' }])
    assert.equal(nivelAcessoEfetivo(s, 'TOURS'), 'VISUALIZAR')
  })

  test('linha com nivel NENHUM explícito => NENHUM (mesmo resultado de ausência de linha)', () => {
    const s = sujeito('ADMIN', true, [{ modulo: 'JORNADAS', nivel: 'NENHUM' }])
    assert.equal(nivelAcessoEfetivo(s, 'JORNADAS'), 'NENHUM')
  })

  test('módulo sem permissão não herda de outro módulo com permissão (isolamento)', () => {
    const s = sujeito('EDITOR', true, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }])
    assert.equal(nivelAcessoEfetivo(s, 'CAMPANHAS'), 'GERENCIAR')
    assert.equal(nivelAcessoEfetivo(s, 'TOURS'), 'NENHUM')
    assert.equal(nivelAcessoEfetivo(s, 'JORNADAS'), 'NENHUM')
    assert.equal(nivelAcessoEfetivo(s, 'CONFIGURACOES'), 'NENHUM')
  })
})

// Ajuste pós-revisão da Fase 4 — cobertura direta pedida na tarefa:
// EDITOR/VIEWER só acessam CONFIGURACOES se a personalização conceder isso
// explicitamente; sem personalização, o comportamento é o mesmo de antes
// da Fase 4 (rota inteira ADMIN/SUPER_ADMIN-only).
describe('CONFIGURACOES — retrocompatibilidade da Fase 4 (ajuste pós-revisão)', () => {
  test('EDITOR, flag=false => NENHUM', () => {
    assert.equal(nivelAcessoEfetivo(sujeito('EDITOR', false), 'CONFIGURACOES'), 'NENHUM')
  })
  test('VIEWER, flag=false => NENHUM', () => {
    assert.equal(nivelAcessoEfetivo(sujeito('VIEWER', false), 'CONFIGURACOES'), 'NENHUM')
  })
  test('ADMIN, flag=false => GERENCIAR', () => {
    assert.equal(nivelAcessoEfetivo(sujeito('ADMIN', false), 'CONFIGURACOES'), 'GERENCIAR')
  })
  test('EDITOR personalizado com VISUALIZAR em CONFIGURACOES => acessa leitura (concedido explicitamente)', () => {
    const s = sujeito('EDITOR', true, [{ modulo: 'CONFIGURACOES', nivel: 'VISUALIZAR' }])
    assert.equal(possuiNivelMinimo(s, 'CONFIGURACOES', 'VISUALIZAR'), true)
    assert.equal(possuiNivelMinimo(s, 'CONFIGURACOES', 'GERENCIAR'), false)
  })
  test('VIEWER personalizado com GERENCIAR em CONFIGURACOES => acessa escrita funcional (concedido explicitamente)', () => {
    const s = sujeito('VIEWER', true, [{ modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' }])
    assert.equal(possuiNivelMinimo(s, 'CONFIGURACOES', 'GERENCIAR'), true)
  })
  test('desativar personalização (flag true -> false) — EDITOR/VIEWER perdem o acesso concedido, mesmo com a linha ainda salva', () => {
    const linhasAntigas = [{ modulo: 'CONFIGURACOES' as ModuloPainel, nivel: 'GERENCIAR' as NivelAcessoModulo }]
    const comPersonalizacao = sujeito('EDITOR', true, linhasAntigas)
    assert.equal(nivelAcessoEfetivo(comPersonalizacao, 'CONFIGURACOES'), 'GERENCIAR')

    const desativado = sujeito('EDITOR', false, linhasAntigas)
    assert.equal(nivelAcessoEfetivo(desativado, 'CONFIGURACOES'), 'NENHUM')

    const desativadoViewer = sujeito('VIEWER', false, linhasAntigas)
    assert.equal(nivelAcessoEfetivo(desativadoViewer, 'CONFIGURACOES'), 'NENHUM')
  })
})

describe('possuiNivelMinimo — GERENCIAR implica VISUALIZAR por ordem, nunca caso especial', () => {
  test('GERENCIAR satisfaz exigência de VISUALIZAR', () => {
    const s = sujeito('EDITOR', true, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }])
    assert.equal(possuiNivelMinimo(s, 'CAMPANHAS', 'VISUALIZAR'), true)
    assert.equal(possuiNivelMinimo(s, 'CAMPANHAS', 'GERENCIAR'), true)
  })

  test('VISUALIZAR satisfaz VISUALIZAR mas não GERENCIAR (lê, não escreve)', () => {
    const s = sujeito('EDITOR', true, [{ modulo: 'CAMPANHAS', nivel: 'VISUALIZAR' }])
    assert.equal(possuiNivelMinimo(s, 'CAMPANHAS', 'VISUALIZAR'), true)
    assert.equal(possuiNivelMinimo(s, 'CAMPANHAS', 'GERENCIAR'), false)
  })

  test('NENHUM não satisfaz nem VISUALIZAR nem GERENCIAR', () => {
    const s = sujeito('EDITOR', true, [{ modulo: 'CAMPANHAS', nivel: 'NENHUM' }])
    assert.equal(possuiNivelMinimo(s, 'CAMPANHAS', 'VISUALIZAR'), false)
    assert.equal(possuiNivelMinimo(s, 'CAMPANHAS', 'GERENCIAR'), false)
  })

  test('sem linha nenhuma (módulo nunca configurado) => NENHUM, bloqueia tudo', () => {
    const s = sujeito('ADMIN', true, [])
    assert.equal(possuiNivelMinimo(s, 'CONFIGURACOES', 'VISUALIZAR'), false)
  })
})
