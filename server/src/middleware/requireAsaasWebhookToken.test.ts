import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response, NextFunction } from 'express'
import { requireAsaasWebhookToken } from './requireAsaasWebhookToken'

// Mesmo padrão de resFake/reqComPapel em rbac.test.ts — sem Express de
// verdade, só um req/res fake o suficiente pro middleware.

function reqComHeader(token: string | undefined): Request {
  return { header: (nome: string) => (nome.toLowerCase() === 'asaas-access-token' ? token : undefined) } as unknown as Request
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

function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const originais: Record<string, string | undefined> = {}
  for (const chave of Object.keys(vars)) {
    originais[chave] = process.env[chave]
    if (vars[chave] === undefined) delete process.env[chave]
    else process.env[chave] = vars[chave]
  }
  try {
    return fn()
  } finally {
    for (const chave of Object.keys(originais)) {
      if (originais[chave] === undefined) delete process.env[chave]
      else process.env[chave] = originais[chave]
    }
  }
}

describe('requireAsaasWebhookToken', () => {
  test('sem ASAAS_WEBHOOK_TOKEN configurado, recusa com 503 mesmo com header presente', () => {
    comEnv({ ASAAS_WEBHOOK_TOKEN: undefined }, () => {
      const { res, statusCode } = resFake()
      let chamouNext = false
      requireAsaasWebhookToken(reqComHeader('qualquer-token'), res, (() => { chamouNext = true }) as NextFunction)
      assert.equal(chamouNext, false)
      assert.equal(statusCode(), 503)
    })
  })

  test('sem header, recusa com 401', () => {
    comEnv({ ASAAS_WEBHOOK_TOKEN: 'token-correto' }, () => {
      const { res, statusCode } = resFake()
      let chamouNext = false
      requireAsaasWebhookToken(reqComHeader(undefined), res, (() => { chamouNext = true }) as NextFunction)
      assert.equal(chamouNext, false)
      assert.equal(statusCode(), 401)
    })
  })

  test('header com token errado, recusa com 401', () => {
    comEnv({ ASAAS_WEBHOOK_TOKEN: 'token-correto' }, () => {
      const { res, statusCode } = resFake()
      let chamouNext = false
      requireAsaasWebhookToken(reqComHeader('token-errado'), res, (() => { chamouNext = true }) as NextFunction)
      assert.equal(chamouNext, false)
      assert.equal(statusCode(), 401)
    })
  })

  test('nunca aceita a própria ASAAS_API_KEY como token de webhook', () => {
    comEnv({ ASAAS_WEBHOOK_TOKEN: 'token-correto', ASAAS_API_KEY: 'chave-api-diferente' }, () => {
      const { res, statusCode } = resFake()
      let chamouNext = false
      requireAsaasWebhookToken(reqComHeader('chave-api-diferente'), res, (() => { chamouNext = true }) as NextFunction)
      assert.equal(chamouNext, false)
      assert.equal(statusCode(), 401)
    })
  })

  test('header com token correto, chama next()', () => {
    comEnv({ ASAAS_WEBHOOK_TOKEN: 'token-correto' }, () => {
      const { res, statusCode } = resFake()
      let chamouNext = false
      requireAsaasWebhookToken(reqComHeader('token-correto'), res, (() => { chamouNext = true }) as NextFunction)
      assert.equal(chamouNext, true)
      assert.equal(statusCode(), undefined)
    })
  })
})
