import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response, NextFunction, Router } from 'express'
import { AdminRole } from '@prisma/client'
import { requireAcessoOperacional, CODIGO_TRIAL_EXPIRADO, CODIGO_INADIMPLENCIA } from './requireAcessoOperacional'
import billingRouter from '../routes/billing'
import authRouter from '../routes/auth'

// Fase 6C — requireAcessoOperacional bloqueia USO OPERACIONAL inteiro
// (leitura incluída) quando o trial do tenant já venceu. Diferente de
// requireEscritaConteudo/Configuracao (rotas do próprio router, ver
// rbac.test.ts), este middleware é wireado a nível de router em index.ts
// (mesmo padrão de requireSuperAdmin — ver "Backend request flow" no
// CLAUDE.md), então não dá pra testar o "wiring" por introspecção de
// Router.stack como os demais: cobre-se aqui (a) o comportamento do
// middleware chamado direto, por papel/situação de tenant, e (b) que
// billing/auth (que NUNCA devem usar este guard) de fato não o usam.

type Handler = (req: Request, res: Response, next: NextFunction) => unknown

function handlersDaRota(router: Router, method: string, path: string): Handler[] {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> }).stack
  const layer = stack.find(l => l.route?.path === path && l.route.methods[method.toLowerCase()])
  if (!layer?.route) throw new Error(`Rota ${method.toUpperCase()} ${path} não encontrada.`)
  return layer.route.stack.map(l => l.handle)
}

function reqComTenant(role: AdminRole, tenant: { status: string; trial_fim: Date | null; licenca_fim: Date | null }): Request {
  return { adminUser: { role, tenant } } as unknown as Request
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

function chamar(role: AdminRole, tenant: { status: string; trial_fim: Date | null; licenca_fim: Date | null }) {
  const { res, statusCode, body } = resFake()
  let nextChamado = false
  requireAcessoOperacional(reqComTenant(role, tenant), res, (() => { nextChamado = true }) as NextFunction)
  return { permitido: nextChamado, status: statusCode(), body: body() }
}

const AGORA = new Date('2026-08-09T12:00:00Z')
const DIA_MS = 86_400_000
const futuro = (dias: number) => new Date(AGORA.getTime() + dias * DIA_MS)
const passado = (dias: number) => new Date(AGORA.getTime() - dias * DIA_MS)

describe('requireAcessoOperacional — comportamento por papel/situação de tenant', () => {
  test('trial ativo permite (next chamado, sem 403)', () => {
    const r = chamar('ADMIN', { status: 'TRIAL', trial_fim: futuro(5), licenca_fim: null })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('trial vencido bloqueia ADMIN com 403 e código TRIAL_EXPIRADO', () => {
    const r = chamar('ADMIN', { status: 'TRIAL', trial_fim: passado(1), licenca_fim: null })
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
    assert.equal((r.body as { codigo: string }).codigo, CODIGO_TRIAL_EXPIRADO)
  })

  test('trial vencido bloqueia EDITOR e VIEWER também', () => {
    for (const role of ['EDITOR', 'VIEWER'] as const) {
      const r = chamar(role, { status: 'TRIAL', trial_fim: passado(1), licenca_fim: null })
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    }
  })

  test('SUPER_ADMIN nunca é bloqueado, mesmo com o próprio tenant em trial vencido', () => {
    const r = chamar('SUPER_ADMIN', { status: 'TRIAL', trial_fim: passado(30), licenca_fim: null })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('tenant pago (ACTIVE, licença em dia) não é afetado', () => {
    const r = chamar('ADMIN', { status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('ACTIVE com licença vencida NÃO leva o 403 de TRIAL_EXPIRADO (continua só bloqueio de escrita, sem mudança)', () => {
    const r = chamar('ADMIN', { status: 'ACTIVE', trial_fim: null, licenca_fim: passado(1) })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('SUSPENDED não leva o 403 de TRIAL_EXPIRADO (continua só bloqueio de escrita, sem mudança)', () => {
    const r = chamar('ADMIN', { status: 'SUSPENDED', trial_fim: null, licenca_fim: null })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })
})

// Fase 7 — tolerância de inadimplência (assinatura paga vencida). Mesmo
// middleware, novo motivo de bloqueio (motivoBloqueioOperacionalInadimplencia)
// e novo código estável (CODIGO_INADIMPLENCIA), só depois que a tolerância
// de 5 dias expira — dentro dela, acesso operacional continua normal.
describe('requireAcessoOperacional — tolerância de inadimplência (Fase 7)', () => {
  // 1 a 4 dias, não 5: este teste usa o relógio real (o middleware chama
  // motivoBloqueioOperacionalInadimplencia sem injetar `agora`, mesmo padrão
  // de motivoBloqueioOperacionalTrial acima), então testar exatamente no
  // limite de 5 dias contra um `passado()` baseado num AGORA fixo é frágil
  // (o relógio real avança além do AGORA fixo entre quando o teste foi
  // escrito e quando roda, empurrando pra além do limite). O limite exato
  // já é coberto de forma determinística em tenantGuards.test.ts
  // (situacaoAdimplenciaTenant, com `agora` injetado).
  test('licença vencida DENTRO da tolerância (1 a 4 dias) permite acesso operacional normal', () => {
    for (const dias of [1, 2, 3, 4]) {
      const r = chamar('ADMIN', { status: 'ACTIVE', trial_fim: null, licenca_fim: passado(dias) })
      assert.equal(r.permitido, true)
      assert.equal(r.status, undefined)
    }
  })

  test('licença vencida ALÉM da tolerância (6 dias) bloqueia ADMIN com 403 e código INADIMPLENCIA', () => {
    const r = chamar('ADMIN', { status: 'ACTIVE', trial_fim: null, licenca_fim: passado(6) })
    assert.equal(r.permitido, false)
    assert.equal(r.status, 403)
    assert.equal((r.body as { codigo: string }).codigo, CODIGO_INADIMPLENCIA)
  })

  test('licença vencida além da tolerância bloqueia EDITOR e VIEWER também', () => {
    for (const role of ['EDITOR', 'VIEWER'] as const) {
      const r = chamar(role, { status: 'ACTIVE', trial_fim: null, licenca_fim: passado(6) })
      assert.equal(r.permitido, false)
      assert.equal(r.status, 403)
    }
  })

  test('SUPER_ADMIN nunca é bloqueado, mesmo com o próprio tenant além da tolerância', () => {
    const r = chamar('SUPER_ADMIN', { status: 'ACTIVE', trial_fim: null, licenca_fim: passado(30) })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('SUSPENDED não leva o 403 de INADIMPLENCIA (preservado — continua só bloqueio de escrita)', () => {
    const r = chamar('ADMIN', { status: 'SUSPENDED', trial_fim: null, licenca_fim: passado(30) })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('CANCELED não leva o 403 de INADIMPLENCIA (preservado — continua só bloqueio de escrita)', () => {
    const r = chamar('ADMIN', { status: 'CANCELED', trial_fim: null, licenca_fim: passado(30) })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })

  test('pagamento confirmado libera automaticamente — licenca_fim no futuro nunca bloqueia, mesmo tendo passado da tolerância antes', () => {
    const r = chamar('ADMIN', { status: 'ACTIVE', trial_fim: null, licenca_fim: futuro(30) })
    assert.equal(r.permitido, true)
    assert.equal(r.status, undefined)
  })
})

// billing/auth precisam continuar acessíveis com o trial vencido (Minha
// Assinatura, planos disponíveis, dados de cobrança, contratação/pagamento,
// login/logout/me/troca de senha) — nunca devem ganhar este guard.
describe('requireAcessoOperacional — billing e auth nunca usam este guard', () => {
  test('GET /situacao (billing) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(billingRouter, 'get', '/situacao').includes(requireAcessoOperacional))
  })
  test('GET /planos-disponiveis (billing) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(billingRouter, 'get', '/planos-disponiveis').includes(requireAcessoOperacional))
  })
  test('POST /assinatura (billing) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(billingRouter, 'post', '/assinatura').includes(requireAcessoOperacional))
  })
  test('PUT /dados-cobranca (billing) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(billingRouter, 'put', '/dados-cobranca').includes(requireAcessoOperacional))
  })
  test('POST /cobrancas/:cobrancaId/pagar (billing) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(billingRouter, 'post', '/cobrancas/:cobrancaId/pagar').includes(requireAcessoOperacional))
  })
  test('GET /me (auth) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(authRouter, 'get', '/me').includes(requireAcessoOperacional))
  })
  test('POST /trocar-senha (auth) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(authRouter, 'post', '/trocar-senha').includes(requireAcessoOperacional))
  })
  test('POST /login (auth) não usa requireAcessoOperacional', () => {
    assert.ok(!handlersDaRota(authRouter, 'post', '/login').includes(requireAcessoOperacional))
  })
})
