import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  gerarTokenRedefinicaoSenha, hashTokenRedefinicaoSenha, calcularExpiracaoRedefinicaoSenha,
  condicaoTokenAtivo, REDEFINICAO_SENHA_VALIDADE_MINUTOS,
} from './passwordReset'

// Helper só de teste — interpreta o objeto devolvido por condicaoTokenAtivo
// como um WHERE aplicado a uma linha em memória, sem Prisma/banco nenhum.
// Mesma semântica que o Postgres aplica de verdade no UPDATE atômico de
// redefinirSenha (ver auth.ts): a linha "casa" com a condição só se
// used_at for exatamente null E expires_at for estritamente maior que
// `agora`.
function linhaAtivaSegundoCondicao(
  linha: { used_at: Date | null; expires_at: Date },
  condicao: ReturnType<typeof condicaoTokenAtivo>
): boolean {
  if (linha.used_at !== condicao.used_at) return false
  return linha.expires_at.getTime() > condicao.expires_at.gt.getTime()
}

describe('gerarTokenRedefinicaoSenha — token bruto', () => {
  test('gera uma string hexadecimal de alta entropia (32 bytes = 64 chars)', () => {
    const token = gerarTokenRedefinicaoSenha()
    assert.match(token, /^[0-9a-f]{64}$/)
  })
  test('duas chamadas geram tokens diferentes (aleatório, não determinístico)', () => {
    assert.notEqual(gerarTokenRedefinicaoSenha(), gerarTokenRedefinicaoSenha())
  })
})

// "Token puro nunca vai ao banco" — a garantia de verdade é estrutural
// (esqueciSenha/redefinirSenha em controllers/auth.ts só chamam
// prisma.passwordResetToken.create/findUnique com token_hash, nunca com o
// token bruto, ver leitura do código) — aqui testamos a propriedade que
// torna isso possível: o hash é determinístico (dá pra buscar por ele) e
// nunca é igual ao valor original.
describe('hashTokenRedefinicaoSenha — determinístico, nunca igual ao token bruto', () => {
  test('mesmo token sempre produz o mesmo hash (precisa ser buscável por where:{token_hash})', () => {
    const token = 'token-de-teste-fixo'
    assert.equal(hashTokenRedefinicaoSenha(token), hashTokenRedefinicaoSenha(token))
  })
  test('tokens diferentes produzem hashes diferentes', () => {
    assert.notEqual(hashTokenRedefinicaoSenha('token-a'), hashTokenRedefinicaoSenha('token-b'))
  })
  test('o hash nunca é igual ao token bruto', () => {
    const token = gerarTokenRedefinicaoSenha()
    assert.notEqual(hashTokenRedefinicaoSenha(token), token)
  })
  test('hash é hexadecimal de 64 chars (SHA-256)', () => {
    assert.match(hashTokenRedefinicaoSenha('qualquer-coisa'), /^[0-9a-f]{64}$/)
  })
})

describe('calcularExpiracaoRedefinicaoSenha — validade fixa a partir de `agora`', () => {
  test(`expira ${REDEFINICAO_SENHA_VALIDADE_MINUTOS} minutos após agora`, () => {
    const agora = new Date('2026-08-08T12:00:00Z')
    const expiracao = calcularExpiracaoRedefinicaoSenha(agora)
    assert.equal(expiracao.getTime() - agora.getTime(), REDEFINICAO_SENHA_VALIDADE_MINUTOS * 60 * 1000)
  })
})

describe('condicaoTokenAtivo — mesma regra usada como WHERE em esqueciSenha (invalidar) e redefinirSenha (consumir)', () => {
  const agora = new Date('2026-08-08T12:00:00Z')
  const futuro = (min: number) => new Date(agora.getTime() + min * 60 * 1000)
  const passado = (min: number) => new Date(agora.getTime() - min * 60 * 1000)

  test('devolve used_at:null e expires_at:{gt:agora}', () => {
    assert.deepEqual(condicaoTokenAtivo(agora), { used_at: null, expires_at: { gt: agora } })
  })

  test('token dentro da validade e nunca usado casa com a condição (ativo)', () => {
    assert.equal(linhaAtivaSegundoCondicao({ expires_at: futuro(10), used_at: null }, condicaoTokenAtivo(agora)), true)
  })
  test('token expirado não casa, mesmo nunca usado', () => {
    assert.equal(linhaAtivaSegundoCondicao({ expires_at: passado(1), used_at: null }, condicaoTokenAtivo(agora)), false)
  })
  test('token expirando exatamente agora não casa (gt estrito, não gte)', () => {
    assert.equal(linhaAtivaSegundoCondicao({ expires_at: agora, used_at: null }, condicaoTokenAtivo(agora)), false)
  })
  test('token já usado não casa, mesmo dentro da validade', () => {
    assert.equal(linhaAtivaSegundoCondicao({ expires_at: futuro(10), used_at: passado(1) }, condicaoTokenAtivo(agora)), false)
  })
  test('token usado E expirado não casa (qualquer um dos dois já basta)', () => {
    assert.equal(linhaAtivaSegundoCondicao({ expires_at: passado(1), used_at: passado(2) }, condicaoTokenAtivo(agora)), false)
  })
  test('used_at também cobre token invalidado por um pedido mais novo (mesmo campo, ver esqueciSenha)', () => {
    // used_at setado no momento em que um NOVO pedido de redefinição
    // invalida este (não necessariamente "usado" pra trocar a senha de
    // fato) — a condição não distingue os dois motivos, os dois tiram o
    // token da lista de "ativos".
    assert.equal(linhaAtivaSegundoCondicao({ expires_at: futuro(10), used_at: agora }, condicaoTokenAtivo(agora)), false)
  })

  // Nenhum caso pra "token inexistente" aqui — quando aplicada como UPDATE
  // atômico (WHERE token_hash: X, ...condicaoTokenAtivo()), um token_hash
  // que não existe simplesmente não casa nenhuma linha (count=0), mesmo
  // efeito prático de "inválido" que os outros casos, sem precisar de um
  // ramo especial (ver redefinirSenha em controllers/auth.ts).
})
