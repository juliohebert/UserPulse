import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolverEmailProvider } from './provider'
import { ResendEmailProvider } from './providers/ResendEmailProvider'

// Salva/restaura as 3 variáveis envolvidas em cada teste — evita que um
// teste vaze configuração pro próximo (mesmo cuidado de outros testes deste
// projeto que mexem em process.env, ver asaasClient.test.ts).
const VARS = ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM'] as const
let original: Record<string, string | undefined>

beforeEach(() => {
  original = Object.fromEntries(VARS.map(v => [v, process.env[v]]))
  for (const v of VARS) delete process.env[v]
})

afterEach(() => {
  for (const v of VARS) {
    if (original[v] === undefined) delete process.env[v]
    else process.env[v] = original[v]
  }
})

describe('resolverEmailProvider — sem EMAIL_PROVIDER (comportamento normal de dev)', () => {
  test('EMAIL_PROVIDER ausente resolve null, nunca lança', () => {
    assert.equal(resolverEmailProvider(), null)
  })
})

describe('resolverEmailProvider — EMAIL_PROVIDER não reconhecido', () => {
  test('valor desconhecido resolve null (loga aviso, nunca lança)', () => {
    process.env.EMAIL_PROVIDER = 'sendgrid'
    assert.equal(resolverEmailProvider(), null)
  })
})

// Fase "e-mail funcional" — EMAIL_PROVIDER=resend com configuração
// incompleta é erro de CONFIGURAÇÃO (falha clara, nunca envia com config
// pela metade), diferente de EMAIL_PROVIDER ausente (caminho normal).
describe('resolverEmailProvider — EMAIL_PROVIDER=resend', () => {
  test('sem RESEND_API_KEY nem EMAIL_FROM lança erro claro', () => {
    process.env.EMAIL_PROVIDER = 'resend'
    assert.throws(() => resolverEmailProvider(), /RESEND_API_KEY.*EMAIL_FROM|EMAIL_FROM.*RESEND_API_KEY/)
  })

  test('só com RESEND_API_KEY (falta EMAIL_FROM) lança', () => {
    process.env.EMAIL_PROVIDER = 'resend'
    process.env.RESEND_API_KEY = 're_teste_123'
    assert.throws(() => resolverEmailProvider(), /EMAIL_FROM/)
  })

  test('só com EMAIL_FROM (falta RESEND_API_KEY) lança', () => {
    process.env.EMAIL_PROVIDER = 'resend'
    process.env.EMAIL_FROM = 'UserPulse <naoresponda@userpulse.com.br>'
    assert.throws(() => resolverEmailProvider(), /RESEND_API_KEY/)
  })

  test('erro de configuração nunca menciona/vaza a API key', () => {
    process.env.EMAIL_PROVIDER = 'resend'
    process.env.RESEND_API_KEY = 're_segredo_nao_pode_vazar'
    process.env.EMAIL_FROM = ''
    try {
      resolverEmailProvider()
      assert.fail('deveria ter lançado')
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      assert.doesNotMatch(mensagem, /re_segredo_nao_pode_vazar/)
    }
  })

  test('com RESEND_API_KEY e EMAIL_FROM configurados, resolve um ResendEmailProvider', () => {
    process.env.EMAIL_PROVIDER = 'resend'
    process.env.RESEND_API_KEY = 're_teste_123'
    process.env.EMAIL_FROM = 'UserPulse <naoresponda@userpulse.com.br>'
    const provider = resolverEmailProvider()
    assert.ok(provider instanceof ResendEmailProvider)
  })
})
