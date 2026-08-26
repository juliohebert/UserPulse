import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  gerarTokenConvite, hashTokenConvite, calcularExpiracaoConvite, condicaoConvitePendente,
  CONVITE_VALIDADE_DIAS,
} from './convites'

// Mesmo helper de passwordReset.test.ts — interpreta o objeto devolvido por
// condicaoConvitePendente como um WHERE aplicado a uma linha em memória, sem
// Prisma/banco. Mesma semântica do UPDATE atômico em aceitarConvite
// (controllers/auth.ts): a linha "casa" só se aceito_em/cancelado_em forem
// exatamente null E expires_at for estritamente maior que `agora`.
function convitePendenteSegundoCondicao(
  linha: { aceito_em: Date | null; cancelado_em: Date | null; expires_at: Date },
  condicao: ReturnType<typeof condicaoConvitePendente>
): boolean {
  if (linha.aceito_em !== condicao.aceito_em) return false
  if (linha.cancelado_em !== condicao.cancelado_em) return false
  return linha.expires_at.getTime() > condicao.expires_at.gt.getTime()
}

describe('gerarTokenConvite — token bruto', () => {
  test('gera uma string hexadecimal de alta entropia (32 bytes = 64 chars)', () => {
    assert.match(gerarTokenConvite(), /^[0-9a-f]{64}$/)
  })
  test('duas chamadas geram tokens diferentes', () => {
    assert.notEqual(gerarTokenConvite(), gerarTokenConvite())
  })
})

describe('hashTokenConvite — determinístico, nunca igual ao token bruto', () => {
  test('mesmo token sempre produz o mesmo hash', () => {
    assert.equal(hashTokenConvite('token-fixo'), hashTokenConvite('token-fixo'))
  })
  test('tokens diferentes produzem hashes diferentes', () => {
    assert.notEqual(hashTokenConvite('token-a'), hashTokenConvite('token-b'))
  })
  test('hash é hexadecimal de 64 chars (SHA-256)', () => {
    assert.match(hashTokenConvite('qualquer-coisa'), /^[0-9a-f]{64}$/)
  })
})

describe('calcularExpiracaoConvite — validade fixa de 7 dias a partir de `agora`', () => {
  test(`expira ${CONVITE_VALIDADE_DIAS} dias após agora`, () => {
    const agora = new Date('2026-08-26T12:00:00Z')
    const expiracao = calcularExpiracaoConvite(agora)
    assert.equal(expiracao.getTime() - agora.getTime(), CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000)
  })
})

describe('condicaoConvitePendente — mesma regra usada como WHERE em listar/criarConvite/aceitarConvite', () => {
  const agora = new Date('2026-08-26T12:00:00Z')
  const futuro = (dias: number) => new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000)
  const passado = (dias: number) => new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000)

  test('devolve aceito_em:null, cancelado_em:null e expires_at:{gt:agora}', () => {
    assert.deepEqual(condicaoConvitePendente(agora), { aceito_em: null, cancelado_em: null, expires_at: { gt: agora } })
  })

  test('convite dentro da validade, nunca aceito nem cancelado casa com a condição (pendente)', () => {
    assert.equal(
      convitePendenteSegundoCondicao({ expires_at: futuro(1), aceito_em: null, cancelado_em: null }, condicaoConvitePendente(agora)),
      true
    )
  })
  test('convite expirado não casa, mesmo nunca aceito', () => {
    assert.equal(
      convitePendenteSegundoCondicao({ expires_at: passado(1), aceito_em: null, cancelado_em: null }, condicaoConvitePendente(agora)),
      false
    )
  })
  test('convite já aceito não casa, mesmo dentro da validade', () => {
    assert.equal(
      convitePendenteSegundoCondicao({ expires_at: futuro(1), aceito_em: passado(1), cancelado_em: null }, condicaoConvitePendente(agora)),
      false
    )
  })
  test('convite cancelado não casa, mesmo dentro da validade e nunca aceito', () => {
    assert.equal(
      convitePendenteSegundoCondicao({ expires_at: futuro(1), aceito_em: null, cancelado_em: passado(1) }, condicaoConvitePendente(agora)),
      false
    )
  })
})
