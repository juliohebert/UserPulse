import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { criarRefreshUnico } from './refreshUnico'

// Fase 6 de permissões personalizadas — dedup genérico usado por
// hooks/useAuth.tsx pra garantir no máximo 1 GET /auth/me em voo por vez
// mesmo com vários 403 quase simultâneos (ver services/api.ts). Só lógica
// pura aqui, sem fetch/React — a integração real é validada manualmente.

describe('criarRefreshUnico — no máximo 1 chamada em andamento por vez', () => {
  test('chamadas concorrentes (antes da 1ª resolver) reaproveitam a mesma promise — fn chamada só 1 vez', async () => {
    let chamadas = 0
    let resolver: (v: number) => void = () => {}
    const fn = () => new Promise<number>(resolve => { chamadas++; resolver = resolve })
    const refresh = criarRefreshUnico(fn)

    const p1 = refresh()
    const p2 = refresh()
    const p3 = refresh()
    assert.equal(chamadas, 1, 'fn não deveria ter sido chamada mais de uma vez pelas 3 chamadas concorrentes')

    resolver(42)
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    assert.equal(r1, 42)
    assert.equal(r2, 42)
    assert.equal(r3, 42)
  })

  test('depois que a chamada em andamento resolve, a próxima chamada dispara fn de novo (não é cache permanente)', async () => {
    let chamadas = 0
    const fn = async () => { chamadas++; return chamadas }
    const refresh = criarRefreshUnico(fn)

    await refresh()
    await refresh()
    await refresh()
    assert.equal(chamadas, 3)
  })

  test('rejeição não trava chamadas futuras — próxima chamada tenta de novo normalmente', async () => {
    let chamadas = 0
    const fn = async () => {
      chamadas++
      if (chamadas === 1) throw new Error('falha simulada')
      return 'ok'
    }
    const refresh = criarRefreshUnico(fn)

    await assert.rejects(refresh(), /falha simulada/)
    const resultado = await refresh()
    assert.equal(resultado, 'ok')
    assert.equal(chamadas, 2)
  })

  test('chamadas concorrentes durante uma rejeição também compartilham a mesma promise (todas rejeitam juntas)', async () => {
    let chamadas = 0
    let rejeitar: (e: Error) => void = () => {}
    const fn = () => new Promise<void>((_resolve, reject) => { chamadas++; rejeitar = reject })
    const refresh = criarRefreshUnico(fn)

    const p1 = refresh().catch(e => e.message)
    const p2 = refresh().catch(e => e.message)
    assert.equal(chamadas, 1)

    rejeitar(new Error('erro de rede'))
    const [r1, r2] = await Promise.all([p1, p2])
    assert.equal(r1, 'erro de rede')
    assert.equal(r2, 'erro de rede')
  })

  test('nunca entra em loop — a própria fn nunca é re-chamada automaticamente sem uma nova invocação externa', async () => {
    let chamadas = 0
    const fn = async () => { chamadas++ }
    const refresh = criarRefreshUnico(fn)

    await refresh()
    // Espera um pouco (microtasks/timers) sem chamar refresh() de novo —
    // fn não deveria disparar sozinha.
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(chamadas, 1)
  })
})
