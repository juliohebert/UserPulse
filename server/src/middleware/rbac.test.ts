import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response, NextFunction, Router } from 'express'
import { AdminRole, ModuloPainel } from '@prisma/client'
import {
  requireEscritaConteudo,
  requireExclusaoOuImportacaoConteudo,
  requireEscritaConfiguracao,
  requireGerenciarModuloConfiguracoes,
} from './requireEscritaTenant'
import { requireSuperAdmin } from './requireSuperAdmin'
import { requireAdminAuth } from './requireAdminAuth'
import type { PermissaoModuloLinha } from '../lib/permissoesModulo'
import campanhasRouter from '../routes/campanhas'
import toursRouter from '../routes/tours'
import jornadasRouter from '../routes/jornadas'
import sistemasRouter from '../routes/sistemas'
import aparenciaWidgetRouter from '../routes/aparenciaWidget'
import catalogoTelasRouter from '../routes/catalogoTelas'
import widgetRouter from '../routes/widget'
import dashboardRouter from '../routes/dashboard'
import billingRouter from '../routes/billing'
import authRouter from '../routes/auth'

// Cobertura da matriz de permissões RBAC (ADMIN/EDITOR/VIEWER de cliente +
// SUPER_ADMIN) + Fase 1 de permissões personalizadas por usuário. Sem tocar
// banco nem subir servidor de verdade (mesmo espírito de
// tours.test.ts/widget.test.ts — só função pura/estrutura, nada de I/O).
//
// requireEscritaConteudo/requireExclusaoOuImportacaoConteudo viraram
// factories (recebem o ModuloPainel) nesta fase — cada rota registra uma
// closure própria, então não dá mais pra comparar por identidade de função
// (`.includes(requireEscritaConteudo)`) como antes. A estratégia agora é
// pegar o handler de fato pendurado na rota (via introspecção de
// Router.stack, ainda sem invocar nada em import-time) e chamá-lo
// diretamente com fixtures de req — isso testa wiring E comportamento numa
// tacada só, e pega com mais precisão um erro de "usei o módulo errado
// nesta rota" do que a comparação de identidade testava antes.

// ─── Helpers ────────────────────────────────────────────────────────────────

type Handler = (req: Request, res: Response, next: NextFunction) => unknown

function handlersDaRota(router: Router, method: string, path: string): Handler[] {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> }).stack
  const layer = stack.find(l => l.route?.path === path && l.route.methods[method.toLowerCase()])
  if (!layer?.route) throw new Error(`Rota ${method.toUpperCase()} ${path} não encontrada.`)
  return layer.route.stack.map(l => l.handle)
}

// Handlers antes do controller final (assume-se, como em todo o projeto,
// que o último handler de cada rota é sempre o controller).
function guardsDaRota(router: Router, method: string, path: string): Handler[] {
  return handlersDaRota(router, method, path).slice(0, -1)
}

function reqComPapel(
  role: AdminRole | undefined,
  permissoes_personalizadas = false,
  permissoes: PermissaoModuloLinha[] = []
): Request {
  return { adminUser: role ? { role, permissoes_personalizadas, permissoes } : undefined } as unknown as Request
}

function resFake() {
  let statusCode: number | undefined
  let body: unknown
  const res = {
    status(code: number) { statusCode = code; return res },
    json(payload: unknown) { body = payload; return res },
  }
  return { res: res as unknown as Response, statusCode: () => statusCode, body: () => body }
}

// Chama o middleware direto (sem Express de verdade, sem controller, sem
// banco) e devolve se next() foi chamado e o status de resposta, se algum.
function chamar(
  mw: Handler,
  role: AdminRole | undefined,
  permissoes_personalizadas = false,
  permissoes: PermissaoModuloLinha[] = []
) {
  const { res, statusCode } = resFake()
  let nextChamado = false
  mw(reqComPapel(role, permissoes_personalizadas, permissoes), res, (() => { nextChamado = true }) as NextFunction)
  return { permitido: nextChamado, status: statusCode() }
}

const TODOS_OS_PAPEIS = Object.values(AdminRole)
const OUTRO_MODULO: Record<ModuloPainel, ModuloPainel> = {
  CAMPANHAS: 'TOURS',
  TOURS: 'CAMPANHAS',
  JORNADAS: 'CAMPANHAS',
  CONFIGURACOES: 'CAMPANHAS',
}

// ─── 1. Leitura — Fase 1 introduziu guard de VISUALIZAR onde antes não havia nenhum ──

describe('RBAC — leitura de Campanhas/Tours/Jornadas exige VISUALIZAR (Fase 1)', () => {
  // CONFIGURACOES fica de fora deste bloco genérico — desde o ajuste
  // pós-revisão da Fase 4, o padrão de EDITOR/VIEWER nesse módulo é NENHUM
  // (não VISUALIZAR como os outros 3), então a asserção "todo papel lê sem
  // personalização" não vale mais igual pros 4. Ver describes dedicadas
  // "CONFIGURACOES — leitura..." e "catalogo-telas/sistemas GET..." abaixo.
  const casos: { nome: string; router: Router; method: string; path: string; modulo: ModuloPainel }[] = [
    { nome: 'GET /campanhas', router: campanhasRouter, method: 'get', path: '/', modulo: 'CAMPANHAS' },
    { nome: 'GET /campanhas/:id', router: campanhasRouter, method: 'get', path: '/:id', modulo: 'CAMPANHAS' },
    { nome: 'GET /tours', router: toursRouter, method: 'get', path: '/', modulo: 'TOURS' },
    { nome: 'GET /tours/:id', router: toursRouter, method: 'get', path: '/:id', modulo: 'TOURS' },
    { nome: 'GET /jornadas', router: jornadasRouter, method: 'get', path: '/', modulo: 'JORNADAS' },
    { nome: 'GET /jornadas/:id', router: jornadasRouter, method: 'get', path: '/:id', modulo: 'JORNADAS' },
  ]

  for (const c of casos) {
    test(`${c.nome} — tem exatamente 1 guard antes do controller`, () => {
      assert.equal(guardsDaRota(c.router, c.method, c.path).length, 1)
    })

    for (const role of ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'] as const) {
      test(`${c.nome} — ${role} sem personalização lê normalmente (sem regressão vs. comportamento pré-Fase-1)`, () => {
        const [guard] = guardsDaRota(c.router, c.method, c.path)
        const r = chamar(guard, role)
        assert.equal(r.permitido, true)
      })
    }

    test(`${c.nome} — personalizado com NENHUM em ${c.modulo} bloqueia mesmo pra ADMIN (autoritativo sobre a role)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })

    test(`${c.nome} — personalizado com GERENCIAR só em ${OUTRO_MODULO[c.modulo]} não libera ${c.modulo} (isolamento entre módulos)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [{ modulo: OUTRO_MODULO[c.modulo], nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, false)
    })

    test(`${c.nome} — VISUALIZAR personalizado em ${c.modulo} libera leitura mesmo pra VIEWER`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'VIEWER', true, [{ modulo: c.modulo, nivel: 'VISUALIZAR' }])
      assert.equal(r.permitido, true)
    })
  }

  // Dashboard e widget público não fazem parte dos 4 módulos personalizáveis
  // desta fase (regra fechada da tarefa) — continuam exatamente como antes.
  test('GET /dashboard/campanhas/:id continua sem guard nenhum (fora do escopo da Fase 1)', () => {
    assert.equal(guardsDaRota(dashboardRouter, 'get', '/campanhas/:id').length, 0)
  })
  test('GET /widget/campanha (rota pública do widget) continua sem depender de adminUser/role', () => {
    assert.equal(guardsDaRota(widgetRouter, 'get', '/campanha').length, 0)
  })
})

// Ajuste pós-revisão: testar-elegibilidade é simulação (nunca escreve),
// exige só VISUALIZAR em CAMPANHAS, não GERENCIAR.
describe('RBAC — POST /campanhas/:id/testar-elegibilidade exige CAMPANHAS.VISUALIZAR', () => {
  test('tem exatamente 1 guard antes do controller', () => {
    assert.equal(guardsDaRota(campanhasRouter, 'post', '/:id/testar-elegibilidade').length, 1)
  })

  for (const role of ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'] as const) {
    test(`${role} sem personalização (flag=false) é permitido — equivalente às roles atuais`, () => {
      const [guard] = guardsDaRota(campanhasRouter, 'post', '/:id/testar-elegibilidade')
      const r = chamar(guard, role)
      assert.equal(r.permitido, true)
    })
  }

  test('personalizado com VISUALIZAR em CAMPANHAS => permitido', () => {
    const [guard] = guardsDaRota(campanhasRouter, 'post', '/:id/testar-elegibilidade')
    const r = chamar(guard, 'VIEWER', true, [{ modulo: 'CAMPANHAS', nivel: 'VISUALIZAR' }])
    assert.equal(r.permitido, true)
  })

  test('personalizado com GERENCIAR em CAMPANHAS => permitido (GERENCIAR implica VISUALIZAR)', () => {
    const [guard] = guardsDaRota(campanhasRouter, 'post', '/:id/testar-elegibilidade')
    const r = chamar(guard, 'VIEWER', true, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }])
    assert.equal(r.permitido, true)
  })

  test('personalizado com NENHUM (sem linha) em CAMPANHAS => 403', () => {
    const [guard] = guardsDaRota(campanhasRouter, 'post', '/:id/testar-elegibilidade')
    const r = chamar(guard, 'ADMIN', true, [])
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
})

// Ajuste pós-revisão da Fase 4: EDITOR/VIEWER só acessam CONFIGURACOES se a
// personalização conceder isso explicitamente — sem personalização, o
// padrão volta a ser exatamente o de antes da Fase 4 (só ADMIN/SUPER_ADMIN).
describe('RBAC — GET /aparencia-widget/default exige VISUALIZAR em CONFIGURACOES (ajuste pós-revisão)', () => {
  test('tem exatamente 1 guard antes do controller', () => {
    assert.equal(guardsDaRota(aparenciaWidgetRouter, 'get', '/default').length, 1)
  })

  test('SUPER_ADMIN sem personalização lê normalmente', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    assert.equal(chamar(guard, 'SUPER_ADMIN').permitido, true)
  })
  test('ADMIN sem personalização lê normalmente', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    assert.equal(chamar(guard, 'ADMIN').permitido, true)
  })
  test('EDITOR sem personalização é bloqueado (comportamento igual a antes da Fase 4)', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    const r = chamar(guard, 'EDITOR')
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
  test('VIEWER sem personalização é bloqueado (comportamento igual a antes da Fase 4)', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    const r = chamar(guard, 'VIEWER')
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })

  test('EDITOR personalizado com VISUALIZAR em CONFIGURACOES => acessa leitura', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    const r = chamar(guard, 'EDITOR', true, [{ modulo: 'CONFIGURACOES', nivel: 'VISUALIZAR' }])
    assert.equal(r.permitido, true)
  })
  test('VIEWER personalizado com GERENCIAR em CONFIGURACOES => acessa leitura (GERENCIAR implica VISUALIZAR)', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    const r = chamar(guard, 'VIEWER', true, [{ modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' }])
    assert.equal(r.permitido, true)
  })
  test('personalizado com GERENCIAR só em outro módulo não libera CONFIGURACOES (isolamento)', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    const r = chamar(guard, 'ADMIN', true, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }])
    assert.equal(r.permitido, false)
  })
  test('desativar personalização — EDITOR/VIEWER perdem de novo o acesso concedido', () => {
    const [guard] = guardsDaRota(aparenciaWidgetRouter, 'get', '/default')
    const linhaAntiga = [{ modulo: 'CONFIGURACOES' as const, nivel: 'GERENCIAR' as const }]
    assert.equal(chamar(guard, 'EDITOR', true, linhaAntiga).permitido, true)
    assert.equal(chamar(guard, 'EDITOR', false, linhaAntiga).permitido, false)
    assert.equal(chamar(guard, 'VIEWER', true, linhaAntiga).permitido, true)
    assert.equal(chamar(guard, 'VIEWER', false, linhaAntiga).permitido, false)
  })
})

// Ajuste pós-revisão da Fase 4: estes dois GETs voltaram a ficar SEM guard
// de módulo (mesmo comportamento de antes da Fase 1) porque são consumidos
// fora da tela de Configurações também — o seletor de sistema/tela usado ao
// criar campanha (ver web/src/pages/campanhas/CampanhaForm.tsx, módulo CAMPANHAS,
// independente de CONFIGURACOES). Gatear por CONFIGURACOES quebraria esse
// fluxo pra EDITOR agora que o padrão de EDITOR em CONFIGURACOES é NENHUM.
describe('RBAC — GET /catalogo-telas e GET /sistemas continuam sem guard de módulo (ajuste pós-revisão)', () => {
  test('GET /catalogo-telas não tem guard nenhum', () => {
    assert.equal(guardsDaRota(catalogoTelasRouter, 'get', '/').length, 0)
  })
  test('GET /sistemas não tem guard nenhum', () => {
    assert.equal(guardsDaRota(sistemasRouter, 'get', '/').length, 0)
  })
  test('EDITOR com CONFIGURACOES=NENHUM (padrão) ainda lê /catalogo-telas e /sistemas — dependência do fluxo de criação de campanha', () => {
    const handlersTelas = handlersDaRota(catalogoTelasRouter, 'get', '/')
    const handlersSistemas = handlersDaRota(sistemasRouter, 'get', '/')
    // Sem guard de role/módulo: o único handler é o controller (não
    // reproduzimos I/O aqui, só confirmamos que não há guard a chamar).
    assert.equal(handlersTelas.length, 1)
    assert.equal(handlersSistemas.length, 1)
  })
})

// ─── 2. Escrita — módulo correto amarrado em cada rota ─────────────────────

describe('RBAC — escrita exige GERENCIAR no módulo certo (wiring + comportamento)', () => {
  // Exclusão/importação (DELETE /tours/:id, POST /tours/importar, DELETE
  // /jornadas/:id) NÃO entram aqui — ao contrário da escrita comum, lá o
  // teto administrativo da role continua valendo mesmo com GERENCIAR
  // personalizado (ver describe própria abaixo, "exclusão/importação
  // respeita teto administrativo da role").
  const casos: { nome: string; router: Router; method: string; path: string; modulo: ModuloPainel }[] = [
    { nome: 'POST /campanhas', router: campanhasRouter, method: 'post', path: '/', modulo: 'CAMPANHAS' },
    { nome: 'PUT /campanhas/:id', router: campanhasRouter, method: 'put', path: '/:id', modulo: 'CAMPANHAS' },
    { nome: 'POST /tours', router: toursRouter, method: 'post', path: '/', modulo: 'TOURS' },
    { nome: 'PUT /tours/:id', router: toursRouter, method: 'put', path: '/:id', modulo: 'TOURS' },
    { nome: 'POST /jornadas', router: jornadasRouter, method: 'post', path: '/', modulo: 'JORNADAS' },
    { nome: 'PUT /aparencia-widget/:sistema', router: aparenciaWidgetRouter, method: 'put', path: '/:sistema', modulo: 'CONFIGURACOES' },
    { nome: 'POST /catalogo-telas', router: catalogoTelasRouter, method: 'post', path: '/', modulo: 'CONFIGURACOES' },
    { nome: 'POST /sistemas', router: sistemasRouter, method: 'post', path: '/', modulo: 'CONFIGURACOES' },
  ]

  for (const c of casos) {
    test(`${c.nome} — personalizado com GERENCIAR em ${c.modulo} passa mesmo pra VIEWER (autoritativo sobre a role)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'VIEWER', true, [{ modulo: c.modulo, nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, true)
    })

    test(`${c.nome} — personalizado com VISUALIZAR em ${c.modulo} NÃO basta pra escrever`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [{ modulo: c.modulo, nivel: 'VISUALIZAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })

    test(`${c.nome} — personalizado com GERENCIAR só em ${OUTRO_MODULO[c.modulo]} não libera ${c.modulo} (isolamento)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [{ modulo: OUTRO_MODULO[c.modulo], nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, false)
    })
  }

  // DELETE /campanhas/:id é "inativar" (soft), não hard delete — continua
  // em requireEscritaConteudo, nunca na exclusão restrita (ver comentário em
  // routes/campanhas.ts). Confirma que o módulo continua correto (CAMPANHAS).
  test('DELETE /campanhas/:id (inativar, não exclui de verdade) também exige só GERENCIAR em CAMPANHAS', () => {
    const [guard] = guardsDaRota(campanhasRouter, 'delete', '/:id')
    assert.equal(chamar(guard, 'VIEWER', true, [{ modulo: 'CAMPANHAS', nivel: 'GERENCIAR' }]).permitido, true)
    assert.equal(chamar(guard, 'ADMIN', true, [{ modulo: 'TOURS', nivel: 'GERENCIAR' }]).permitido, false)
  })
})

// Ajuste pós-revisão da Fase 1: exclusão de verdade (hard delete) e
// importação NUNCA são elevadas por permissão personalizada — o teto
// administrativo da role (SUPER_ADMIN/ADMIN) continua valendo por cima de
// GERENCIAR personalizado. Diferente do describe acima (escrita comum),
// onde GERENCIAR personalizado é autoritativo mesmo pra VIEWER.
describe('RBAC — exclusão/importação respeita teto administrativo da role mesmo com GERENCIAR personalizado', () => {
  const casos: { nome: string; router: Router; method: string; path: string; modulo: ModuloPainel }[] = [
    { nome: 'DELETE /tours/:id (hard delete)', router: toursRouter, method: 'delete', path: '/:id', modulo: 'TOURS' },
    { nome: 'POST /tours/importar', router: toursRouter, method: 'post', path: '/importar', modulo: 'TOURS' },
    { nome: 'DELETE /jornadas/:id (hard delete)', router: jornadasRouter, method: 'delete', path: '/:id', modulo: 'JORNADAS' },
  ]

  for (const c of casos) {
    test(`${c.nome} — ADMIN + GERENCIAR personalizado em ${c.modulo} exclui/importa`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [{ modulo: c.modulo, nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, true)
    })

    test(`${c.nome} — ADMIN + VISUALIZAR personalizado em ${c.modulo} é bloqueado`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [{ modulo: c.modulo, nivel: 'VISUALIZAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })

    test(`${c.nome} — ADMIN + NENHUM (sem linha) personalizado em ${c.modulo} é bloqueado`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'ADMIN', true, [])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })

    test(`${c.nome} — EDITOR + GERENCIAR personalizado em ${c.modulo} continua bloqueado (teto da role)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'EDITOR', true, [{ modulo: c.modulo, nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })

    test(`${c.nome} — VIEWER + GERENCIAR personalizado em ${c.modulo} continua bloqueado (teto da role)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      const r = chamar(guard, 'VIEWER', true, [{ modulo: c.modulo, nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })

    test(`${c.nome} — SUPER_ADMIN sempre passa, com ou sem personalização`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      assert.equal(chamar(guard, 'SUPER_ADMIN', false).permitido, true)
      assert.equal(chamar(guard, 'SUPER_ADMIN', true, []).permitido, true)
    })

    test(`${c.nome} — flag=false permanece igual ao comportamento pré-ajuste (SUPER_ADMIN/ADMIN passam, EDITOR/VIEWER bloqueados)`, () => {
      const [guard] = guardsDaRota(c.router, c.method, c.path)
      assert.equal(chamar(guard, 'SUPER_ADMIN').permitido, true)
      assert.equal(chamar(guard, 'ADMIN').permitido, true)
      assert.equal(chamar(guard, 'EDITOR').permitido, false)
      assert.equal(chamar(guard, 'VIEWER').permitido, false)
    })
  }
})

// Fase 5 — billing self-service (ver routes/billing.ts). requireEscritaConfiguracao
// NÃO é a mesma guarda usada pelas rotas de CONFIGURACOES (essas usam
// requireGerenciarModuloConfiguracoes) — regra fechada da tarefa: "Billing/
// Minha Assinatura fica fora de CONFIGURACOES". A identidade de função
// continua válida aqui porque esta guarda nunca virou factory.
describe('RBAC — wiring das rotas de billing self-service (Fase 5) — sem regressão', () => {
  test('GET /situacao usa requireEscritaConfiguracao', () => {
    assert.ok(handlersDaRota(billingRouter, 'get', '/situacao').includes(requireEscritaConfiguracao))
  })
  test('GET /planos-disponiveis usa requireEscritaConfiguracao (Fase 6B)', () => {
    assert.ok(handlersDaRota(billingRouter, 'get', '/planos-disponiveis').includes(requireEscritaConfiguracao))
  })
  test('PUT /dados-cobranca usa requireEscritaConfiguracao', () => {
    assert.ok(handlersDaRota(billingRouter, 'put', '/dados-cobranca').includes(requireEscritaConfiguracao))
  })
  test('POST /assinatura usa requireEscritaConfiguracao', () => {
    assert.ok(handlersDaRota(billingRouter, 'post', '/assinatura').includes(requireEscritaConfiguracao))
  })
  test('POST /cobrancas/:cobrancaId/pagar usa requireEscritaConfiguracao', () => {
    assert.ok(handlersDaRota(billingRouter, 'post', '/cobrancas/:cobrancaId/pagar').includes(requireEscritaConfiguracao))
  })
  test('GET /upgrade/preview usa requireEscritaConfiguracao (Fase 8A)', () => {
    assert.ok(handlersDaRota(billingRouter, 'get', '/upgrade/preview').includes(requireEscritaConfiguracao))
  })
  test('POST /upgrade usa requireEscritaConfiguracao (Fase 8A)', () => {
    assert.ok(handlersDaRota(billingRouter, 'post', '/upgrade').includes(requireEscritaConfiguracao))
  })
  test('POST /reativar não existe mais (reativação self-service removida)', () => {
    assert.throws(() => handlersDaRota(billingRouter, 'post', '/reativar'), /não encontrada/)
  })
  test('nenhuma rota de billing aceita tenant/tenantId pela URL', () => {
    const stack = (billingRouter as unknown as { stack: Array<{ route?: { path: string } }> }).stack
    const caminhos = stack.map(l => l.route?.path).filter((p): p is string => !!p)
    assert.ok(caminhos.length > 0)
    for (const caminho of caminhos) {
      assert.ok(!/:id\b|:tenantId\b/.test(caminho), `rota "${caminho}" não deveria aceitar tenant pela URL`)
    }
  })
  // Prova direta da regra fechada "Billing/Minha Assinatura fica fora de
  // CONFIGURACOES": mesmo com permissoes_personalizadas=true, billing
  // continua 100% Set-based (role), nunca consulta AdminUserPermissao.
  test('billing ignora permissoes_personalizadas — ADMIN com NENHUM em CONFIGURACOES ainda acessa billing', () => {
    const r = chamar(requireEscritaConfiguracao, 'ADMIN', true, [{ modulo: 'CONFIGURACOES', nivel: 'NENHUM' }])
    assert.equal(r.permitido, true)
  })
  test('billing ignora permissoes_personalizadas — EDITOR com GERENCIAR em CONFIGURACOES ainda assim é bloqueado em billing', () => {
    const r = chamar(requireEscritaConfiguracao, 'EDITOR', true, [{ modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' }])
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
})

// Fase 6B — cadastro público self-service (ver routes/auth.ts).
describe('RBAC — wiring do cadastro público (Fase 6B)', () => {
  test('GET /cadastro/config é pública (sem requireAdminAuth)', () => {
    assert.ok(!handlersDaRota(authRouter, 'get', '/cadastro/config').includes(requireAdminAuth))
  })
  test('POST /cadastro é pública (sem requireAdminAuth)', () => {
    assert.ok(!handlersDaRota(authRouter, 'post', '/cadastro').includes(requireAdminAuth))
  })
  test('POST /esqueci-senha é pública (sem requireAdminAuth)', () => {
    assert.ok(!handlersDaRota(authRouter, 'post', '/esqueci-senha').includes(requireAdminAuth))
  })
  test('POST /redefinir-senha é pública (sem requireAdminAuth)', () => {
    assert.ok(!handlersDaRota(authRouter, 'post', '/redefinir-senha').includes(requireAdminAuth))
  })
  test('GET /me continua exigindo requireAdminAuth', () => {
    assert.ok(handlersDaRota(authRouter, 'get', '/me').includes(requireAdminAuth))
  })
  test('POST /trocar-senha continua exigindo requireAdminAuth', () => {
    assert.ok(handlersDaRota(authRouter, 'post', '/trocar-senha').includes(requireAdminAuth))
  })
})

// ─── 3. Comportamento por papel, sem personalização (regressão) ────────────

describe('requireEscritaConteudo — sem personalização, comportamento idêntico ao pré-Fase-1', () => {
  const mw = requireEscritaConteudo('CAMPANHAS')
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'EDITOR'] as const) {
    test(`${role} passa (next chamado, sem 403)`, () => {
      const r = chamar(mw, role)
      assert.equal(r.permitido, true)
      assert.equal(r.status, undefined)
    })
  }
  test('VIEWER é bloqueado com 403', () => {
    const r = chamar(mw, 'VIEWER')
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
})

describe('requireExclusaoOuImportacaoConteudo — teto administrativo da role nunca é elevado por personalização (ajuste pós-revisão)', () => {
  const mw = requireExclusaoOuImportacaoConteudo('TOURS')

  describe('flag=false — comportamento permanece idêntico ao pré-Fase-1', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN'] as const) {
      test(`${role} passa (next chamado, sem 403)`, () => {
        const r = chamar(mw, role)
        assert.equal(r.permitido, true)
        assert.equal(r.status, undefined)
      })
    }
    for (const role of ['EDITOR', 'VIEWER'] as const) {
      test(`${role} é bloqueado com 403`, () => {
        const r = chamar(mw, role)
        assert.equal(r.permitido, false)
        assert.equal(r.status, 403)
      })
    }
  })

  describe('flag=true — GERENCIAR personalizado nunca eleva EDITOR/VIEWER acima do teto da role', () => {
    test('ADMIN + GERENCIAR personalizado em TOURS => exclui/importa', () => {
      const r = chamar(mw, 'ADMIN', true, [{ modulo: 'TOURS', nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, true)
    })
    test('ADMIN + VISUALIZAR personalizado em TOURS => bloqueado', () => {
      const r = chamar(mw, 'ADMIN', true, [{ modulo: 'TOURS', nivel: 'VISUALIZAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
    test('ADMIN + NENHUM (sem linha) personalizado em TOURS => bloqueado', () => {
      const r = chamar(mw, 'ADMIN', true, [])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
    test('EDITOR + GERENCIAR personalizado em TOURS => continua bloqueado (teto da role)', () => {
      const r = chamar(mw, 'EDITOR', true, [{ modulo: 'TOURS', nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
    test('VIEWER + GERENCIAR personalizado em TOURS => continua bloqueado (teto da role)', () => {
      const r = chamar(mw, 'VIEWER', true, [{ modulo: 'TOURS', nivel: 'GERENCIAR' }])
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
    test('SUPER_ADMIN passa mesmo com permissoes_personalizadas=true e nenhuma linha (regra 1 é irrestrita)', () => {
      const r = chamar(mw, 'SUPER_ADMIN', true, [])
      assert.equal(r.permitido, true)
    })
  })
})

describe('requireGerenciarModuloConfiguracoes — aparência do widget, catálogo de telas e sistemas', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN'] as const) {
    test(`${role} passa sem personalização (next chamado, sem 403)`, () => {
      const r = chamar(requireGerenciarModuloConfiguracoes, role)
      assert.equal(r.permitido, true)
      assert.equal(r.status, undefined)
    })
  }
  for (const role of ['EDITOR', 'VIEWER'] as const) {
    test(`${role} é bloqueado com 403 sem personalização`, () => {
      const r = chamar(requireGerenciarModuloConfiguracoes, role)
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
  }
  test('EDITOR com GERENCIAR personalizado em CONFIGURACOES passa (autoritativo sobre a role)', () => {
    const r = chamar(requireGerenciarModuloConfiguracoes, 'EDITOR', true, [{ modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' }])
    assert.equal(r.permitido, true)
  })
  test('ADMIN com permissoes_personalizadas=true e sem nenhuma linha é bloqueado (NENHUM por ausência)', () => {
    const r = chamar(requireGerenciarModuloConfiguracoes, 'ADMIN', true, [])
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
})

describe('requireSuperAdmin — Gestão SaaS (/api/admin/*) — sem regressão, ignora permissoes_personalizadas', () => {
  test('SUPER_ADMIN passa (next chamado, sem 403)', () => {
    const r = chamar(requireSuperAdmin, 'SUPER_ADMIN')
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })
  for (const role of ['ADMIN', 'EDITOR', 'VIEWER'] as const) {
    test(`${role} comum é bloqueado com 403 (não acessa Gestão SaaS)`, () => {
      const r = chamar(requireSuperAdmin, role)
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
  }
  test('sem adminUser (nunca deveria acontecer atrás de requireAdminAuth, mas por segurança) também é bloqueado', () => {
    const r = chamar(requireSuperAdmin, undefined)
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
  test('ADMIN com permissoes_personalizadas=true e GERENCIAR em todos os módulos ainda assim não acessa Gestão SaaS', () => {
    const r = chamar(requireSuperAdmin, 'ADMIN', true, [
      { modulo: 'CAMPANHAS', nivel: 'GERENCIAR' },
      { modulo: 'TOURS', nivel: 'GERENCIAR' },
      { modulo: 'JORNADAS', nivel: 'GERENCIAR' },
      { modulo: 'CONFIGURACOES', nivel: 'GERENCIAR' },
    ])
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
})

// Confirma que os 4 papéis usados nos testes acima cobrem o enum inteiro do
// Prisma — se alguém adicionar um novo AdminRole, este teste lembra de
// também decidir onde ele entra nas permissões de conteúdo/configuração
// acima (sem isso, TODOS_OS_PAPEIS ficaria satisfazendo o teste por engano).
describe('AdminRole — enum completo coberto pelos testes acima', () => {
  test('SUPER_ADMIN, ADMIN, EDITOR, VIEWER são os únicos papéis existentes', () => {
    assert.deepEqual([...TODOS_OS_PAPEIS].sort(), ['ADMIN', 'EDITOR', 'SUPER_ADMIN', 'VIEWER'])
  })
})

describe('ModuloPainel — enum completo coberto pelos testes acima', () => {
  test('CAMPANHAS, TOURS, JORNADAS, CONFIGURACOES são os únicos módulos existentes', () => {
    assert.deepEqual([...Object.values(ModuloPainel)].sort(), ['CAMPANHAS', 'CONFIGURACOES', 'JORNADAS', 'TOURS'])
  })
})
