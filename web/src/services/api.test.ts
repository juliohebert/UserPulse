import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { get, setUnauthorizedHandler, setForbiddenHandler } from './api'

// Fase 6 de permissões personalizadas — cobre só o roteamento de status pra
// os handlers (401/403) e a exclusão explícita de /auth/me, sem precisar de
// servidor real: fetch é mockado por teste. A lógica de dedup/refresh em si
// vive em utils/refreshUnico.ts (testada lá); aqui só garante que api.ts
// aciona o gancho certo, no momento certo, sem alterar o tratamento de erro
// já existente da request original.

const fetchOriginal = globalThis.fetch

function mockFetch(status: number, body: unknown = {}) {
  globalThis.fetch = (async () => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
    json: async () => body,
  })) as typeof fetch
}

beforeEach(() => {
  setUnauthorizedHandler(null)
  setForbiddenHandler(null)
})

afterEach(() => {
  globalThis.fetch = fetchOriginal
  setUnauthorizedHandler(null)
  setForbiddenHandler(null)
})

describe('request — 403 aciona onForbidden, exceto pro próprio /auth/me', () => {
  test('403 numa rota qualquer aciona onForbidden exatamente uma vez', async () => {
    let chamadas = 0
    setForbiddenHandler(() => { chamadas++ })
    mockFetch(403, { erro: 'Seu papel não tem permissão para esta ação.' })

    await assert.rejects(get('/campanhas'))
    assert.equal(chamadas, 1)
  })

  test('403 em /auth/me NÃO aciona onForbidden (nunca encadeia a partir do próprio refresh)', async () => {
    let chamadas = 0
    setForbiddenHandler(() => { chamadas++ })
    mockFetch(403, { erro: 'não autorizado' })

    await assert.rejects(get('/auth/me'))
    assert.equal(chamadas, 0)
  })

  test('sem handler registrado, 403 não lança erro adicional (handler é opcional)', async () => {
    mockFetch(403, { erro: 'bloqueado' })
    await assert.rejects(get('/tours'), /bloqueado/)
  })

  test('a request original continua rejeitando com a mensagem de erro de sempre (tratamento de 403 preservado)', async () => {
    setForbiddenHandler(() => {})
    mockFetch(403, { erro: 'Apenas administradores podem alterar esta configuração.' })

    await assert.rejects(get('/sistemas'), /Apenas administradores podem alterar esta configuração\./)
  })
})

describe('request — 401 mantém o comportamento atual, isolado de 403', () => {
  test('401 aciona onUnauthorized, nunca onForbidden', async () => {
    let unauthorizedChamadas = 0
    let forbiddenChamadas = 0
    setUnauthorizedHandler(() => { unauthorizedChamadas++ })
    setForbiddenHandler(() => { forbiddenChamadas++ })
    mockFetch(401, { erro: 'Não autenticado.' })

    await assert.rejects(get('/campanhas'))
    assert.equal(unauthorizedChamadas, 1)
    assert.equal(forbiddenChamadas, 0)
  })

  test('403 aciona onForbidden, nunca onUnauthorized', async () => {
    let unauthorizedChamadas = 0
    let forbiddenChamadas = 0
    setUnauthorizedHandler(() => { unauthorizedChamadas++ })
    setForbiddenHandler(() => { forbiddenChamadas++ })
    mockFetch(403, { erro: 'Seu papel não tem permissão para esta ação.' })

    await assert.rejects(get('/campanhas'))
    assert.equal(unauthorizedChamadas, 0)
    assert.equal(forbiddenChamadas, 1)
  })

  test('401 em /auth/me continua acionando onUnauthorized normalmente (só 403 tem a exceção de path)', async () => {
    let unauthorizedChamadas = 0
    setUnauthorizedHandler(() => { unauthorizedChamadas++ })
    mockFetch(401, { erro: 'Não autenticado.' })

    await assert.rejects(get('/auth/me'))
    assert.equal(unauthorizedChamadas, 1)
  })
})

describe('request — sucesso não aciona nenhum handler', () => {
  test('200 não chama onUnauthorized nem onForbidden', async () => {
    let unauthorizedChamadas = 0
    let forbiddenChamadas = 0
    setUnauthorizedHandler(() => { unauthorizedChamadas++ })
    setForbiddenHandler(() => { forbiddenChamadas++ })
    mockFetch(200, { id: 'u1' })

    const resultado = await get<{ id: string }>('/auth/me')
    assert.equal(resultado.id, 'u1')
    assert.equal(unauthorizedChamadas, 0)
    assert.equal(forbiddenChamadas, 0)
  })

  test('get encaminha o AbortSignal para o fetch', async () => {
    const controller = new AbortController()
    let signalRecebido: AbortSignal | null | undefined
    globalThis.fetch = (async (_input, init) => {
      signalRecebido = init?.signal
      return {
        status: 200,
        ok: true,
        json: async () => ({}),
      }
    }) as typeof fetch

    await get('/campanhas', { signal: controller.signal })
    assert.equal(signalRecebido, controller.signal)
  })
})
