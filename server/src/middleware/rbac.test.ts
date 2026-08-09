import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response, NextFunction, Router } from 'express'
import { AdminRole } from '@prisma/client'
import { requireEscritaConteudo, requireExclusaoOuImportacaoConteudo, requireEscritaConfiguracao } from './requireEscritaTenant'
import { requireSuperAdmin } from './requireSuperAdmin'
import { requireAdminAuth } from './requireAdminAuth'
import campanhasRouter from '../routes/campanhas'
import toursRouter from '../routes/tours'
import jornadasRouter from '../routes/jornadas'
import aparenciaWidgetRouter from '../routes/aparenciaWidget'
import catalogoTelasRouter from '../routes/catalogoTelas'
import widgetRouter from '../routes/widget'
import dashboardRouter from '../routes/dashboard'
import billingRouter from '../routes/billing'
import authRouter from '../routes/auth'

// Cobertura mínima da matriz de permissões RBAC (ADMIN/EDITOR/VIEWER de
// cliente + SUPER_ADMIN) descrita no contexto da tarefa. Duas frentes, as
// duas sem tocar banco nem subir servidor de verdade (mesmo espírito de
// tours.test.ts/widget.test.ts — só função pura/estrutura, nada de I/O):
//
// 1. "Wiring" — os middlewares certos estão de fato pendurados nas rotas
//    certas (introspecção de Router.stack, sem invocar nada). Pega o erro
//    de "esqueci de proteger a rota", que um teste só do middleware isolado
//    não pegaria.
// 2. Comportamento dos middlewares — chamados diretamente com um req/res
//    fake por papel, sem passar pelo Express de verdade. Só é seguro testar
//    o caminho "permitido" (next() chamado) desta forma porque os
//    middlewares em si são puros (só olham req.adminUser.role, nunca tocam
//    Prisma) — o controller que viria depois (esse sim precisa de banco)
//    nunca chega a ser invocado aqui.
//
// Não cobre every endpoint (fora do pedido da tarefa) — cobre pelo menos um
// endpoint por categoria (escrita de conteúdo, exclusão/importação, escrita
// de configuração, Gestão SaaS, leitura permitida), como pedido.

// ─── Helpers ────────────────────────────────────────────────────────────────

type Handler = (req: Request, res: Response, next: NextFunction) => unknown

// Introspecção pura do Router do Express — nunca invoca os handlers, só lê a
// estrutura já montada em tempo de import (routes/*.ts rodam `router.get(...)`
// etc. no top-level do módulo). Layer.route existe só pra layers criadas por
// router.METHOD(path, ...); route.stack é a cadeia de handlers daquela rota.
function handlersDaRota(router: Router, method: string, path: string): Handler[] {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> }).stack
  const layer = stack.find(l => l.route?.path === path && l.route.methods[method.toLowerCase()])
  if (!layer?.route) throw new Error(`Rota ${method.toUpperCase()} ${path} não encontrada.`)
  return layer.route.stack.map(l => l.handle)
}

function reqComPapel(role: AdminRole | undefined): Request {
  return { adminUser: role ? { role } : undefined } as unknown as Request
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
function chamar(mw: Handler, role: AdminRole | undefined) {
  const { res, statusCode } = resFake()
  let nextChamado = false
  mw(reqComPapel(role), res, (() => { nextChamado = true }) as NextFunction)
  return { permitido: nextChamado, status: statusCode() }
}

const TODOS_OS_PAPEIS = Object.values(AdminRole)

// ─── 1. Wiring — middleware certo na rota certa ────────────────────────────

describe('RBAC — wiring das rotas de escrita', () => {
  test('POST /campanhas usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(campanhasRouter, 'post', '/').includes(requireEscritaConteudo))
  })
  test('PUT /campanhas/:id usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(campanhasRouter, 'put', '/:id').includes(requireEscritaConteudo))
  })
  test('POST /campanhas/:id/duplicar usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(campanhasRouter, 'post', '/:id/duplicar').includes(requireEscritaConteudo))
  })
  test('DELETE /campanhas/:id (inativar, não exclui de verdade) usa requireEscritaConteudo — não a exclusão restrita a ADMIN', () => {
    const handlers = handlersDaRota(campanhasRouter, 'delete', '/:id')
    assert.ok(handlers.includes(requireEscritaConteudo))
    assert.ok(!handlers.includes(requireExclusaoOuImportacaoConteudo))
  })
  test('POST /tours usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(toursRouter, 'post', '/').includes(requireEscritaConteudo))
  })
  test('PUT /tours/:id usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(toursRouter, 'put', '/:id').includes(requireEscritaConteudo))
  })
  test('POST /tours/:id/duplicar usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(toursRouter, 'post', '/:id/duplicar').includes(requireEscritaConteudo))
  })
  test('DELETE /tours/:id (exclusão de verdade) usa requireExclusaoOuImportacaoConteudo', () => {
    assert.ok(handlersDaRota(toursRouter, 'delete', '/:id').includes(requireExclusaoOuImportacaoConteudo))
  })
  test('POST /tours/importar usa requireExclusaoOuImportacaoConteudo', () => {
    assert.ok(handlersDaRota(toursRouter, 'post', '/importar').includes(requireExclusaoOuImportacaoConteudo))
  })
  test('POST /jornadas usa requireEscritaConteudo', () => {
    assert.ok(handlersDaRota(jornadasRouter, 'post', '/').includes(requireEscritaConteudo))
  })
  test('DELETE /jornadas/:id (exclusão de verdade) usa requireExclusaoOuImportacaoConteudo', () => {
    assert.ok(handlersDaRota(jornadasRouter, 'delete', '/:id').includes(requireExclusaoOuImportacaoConteudo))
  })
  test('PUT /aparencia-widget/:sistema usa requireEscritaConfiguracao', () => {
    assert.ok(handlersDaRota(aparenciaWidgetRouter, 'put', '/:sistema').includes(requireEscritaConfiguracao))
  })
  test('POST /catalogo-telas usa requireEscritaConfiguracao', () => {
    assert.ok(handlersDaRota(catalogoTelasRouter, 'post', '/').includes(requireEscritaConfiguracao))
  })
})

// Fase 5 — billing self-service (ver routes/billing.ts). Diferente das
// demais categorias acima, aqui TODA rota (inclusive leitura) usa
// requireEscritaConfiguracao — billing é sensível o bastante pra restringir
// a leitura também, não só a escrita (regra explícita da tarefa: "somente
// ADMIN do próprio tenant").
describe('RBAC — wiring das rotas de billing self-service (Fase 5)', () => {
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
  // Correção de segurança pós-revisão: reativação self-service foi
  // removida — não existe hoje forma confiável de saber se uma assinatura
  // INACTIVE reflete suspensão manual ou causada pelo billing (ver
  // bloqueioOperacaoFinanceiraSelfService em asaasClient.ts).
  test('POST /reativar não existe mais (reativação self-service removida)', () => {
    assert.throws(() => handlersDaRota(billingRouter, 'post', '/reativar'), /não encontrada/)
  })

  // Garante estruturalmente que nenhuma rota de billing aceita um id de
  // tenant pela URL — o tenant tem que vir sempre de req.adminUser (sessão),
  // nunca de um parâmetro que o cliente controla (regra explícita da
  // tarefa: "nunca receber tenant_id pelo frontend para decidir qual tenant
  // operar"). cobrancaId é o único :param permitido (identifica a cobrança,
  // não o tenant).
  test('nenhuma rota de billing aceita tenant/tenantId pela URL', () => {
    const stack = (billingRouter as unknown as { stack: Array<{ route?: { path: string } }> }).stack
    const caminhos = stack.map(l => l.route?.path).filter((p): p is string => !!p)
    assert.ok(caminhos.length > 0)
    for (const caminho of caminhos) {
      assert.ok(!/:id\b|:tenantId\b/.test(caminho), `rota "${caminho}" não deveria aceitar tenant pela URL`)
    }
  })
})

// Fase 6B — cadastro público self-service (ver routes/auth.ts). Único par de
// rotas deste router (fora do login) que precisa ficar acessível sem
// requireAdminAuth — o teste garante que exatamente essas duas ficam
// públicas e que as demais (me/trocar-senha) continuam exigindo sessão, sem
// precisar subir servidor/disparar request de verdade.
describe('RBAC — wiring do cadastro público (Fase 6B)', () => {
  test('GET /cadastro/config é pública (sem requireAdminAuth)', () => {
    assert.ok(!handlersDaRota(authRouter, 'get', '/cadastro/config').includes(requireAdminAuth))
  })
  test('POST /cadastro é pública (sem requireAdminAuth)', () => {
    assert.ok(!handlersDaRota(authRouter, 'post', '/cadastro').includes(requireAdminAuth))
  })
  // "Esqueci minha senha" — mesmo raciocínio: quem chega aqui ainda não tem
  // sessão, então também precisam ficar públicas.
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

describe('RBAC — wiring das rotas de leitura (sem guard, abertas a qualquer papel autenticado)', () => {
  const GUARDS: Handler[] = [requireEscritaConteudo, requireExclusaoOuImportacaoConteudo, requireEscritaConfiguracao]
  const semGuard = (handlers: Handler[]) => handlers.every(h => !GUARDS.includes(h))

  test('GET /campanhas não tem guard de escrita — VIEWER lê normalmente', () => {
    assert.ok(semGuard(handlersDaRota(campanhasRouter, 'get', '/')))
  })
  test('GET /tours não tem guard de escrita', () => {
    assert.ok(semGuard(handlersDaRota(toursRouter, 'get', '/')))
  })
  test('GET /catalogo-telas não tem guard de escrita — EDITOR/VIEWER continuam lendo o catálogo', () => {
    assert.ok(semGuard(handlersDaRota(catalogoTelasRouter, 'get', '/')))
  })
  test('GET /dashboard/campanhas/:id não tem guard nenhum', () => {
    assert.ok(semGuard(handlersDaRota(dashboardRouter, 'get', '/campanhas/:id')))
  })
  test('GET /widget/campanha (rota pública do widget) não depende de adminUser/role', () => {
    const handlers = handlersDaRota(widgetRouter, 'get', '/campanha')
    assert.ok(semGuard(handlers))
    assert.equal(handlers.length, 1) // só o controller — nenhum middleware de auth/role no meio
  })
})

// ─── 2. Comportamento por papel ─────────────────────────────────────────────

describe('requireEscritaConteudo — criar/editar/ativar/inativar/duplicar campanhas, tours e jornadas', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'EDITOR'] as const) {
    test(`${role} passa (next chamado, sem 403)`, () => {
      const r = chamar(requireEscritaConteudo, role)
      assert.equal(r.permitido, true)
      assert.equal(r.status, undefined)
    })
  }
  test('VIEWER é bloqueado com 403', () => {
    const r = chamar(requireEscritaConteudo, 'VIEWER')
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
  })
})

describe('requireExclusaoOuImportacaoConteudo — excluir tour/jornada de verdade e importar tour', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN'] as const) {
    test(`${role} passa (next chamado, sem 403)`, () => {
      const r = chamar(requireExclusaoOuImportacaoConteudo, role)
      assert.equal(r.permitido, true)
      assert.equal(r.status, undefined)
    })
  }
  for (const role of ['EDITOR', 'VIEWER'] as const) {
    test(`${role} é bloqueado com 403`, () => {
      const r = chamar(requireExclusaoOuImportacaoConteudo, role)
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
  }
})

describe('requireEscritaConfiguracao — aparência do widget e catálogo de telas', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN'] as const) {
    test(`${role} passa (next chamado, sem 403)`, () => {
      const r = chamar(requireEscritaConfiguracao, role)
      assert.equal(r.permitido, true)
      assert.equal(r.status, undefined)
    })
  }
  for (const role of ['EDITOR', 'VIEWER'] as const) {
    test(`${role} é bloqueado com 403`, () => {
      const r = chamar(requireEscritaConfiguracao, role)
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    })
  }
})

describe('requireSuperAdmin — Gestão SaaS (/api/admin/*)', () => {
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
})

// Confirma que os 4 papéis usados nos testes acima cobrem o enum inteiro do
// Prisma — se alguém adicionar um novo AdminRole, este teste lembra de
// também decidir onde ele entra nas 3 permissões de conteúdo/configuração
// acima (sem isso, TODOS_OS_PAPEIS ficaria satisfazendo o teste por engano).
describe('AdminRole — enum completo coberto pelos testes acima', () => {
  test('SUPER_ADMIN, ADMIN, EDITOR, VIEWER são os únicos papéis existentes', () => {
    assert.deepEqual([...TODOS_OS_PAPEIS].sort(), ['ADMIN', 'EDITOR', 'SUPER_ADMIN', 'VIEWER'])
  })
})
