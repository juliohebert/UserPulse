import crypto from 'crypto'

// "Esqueci minha senha" — token bruto (alta entropia, 256 bits) vai por
// e-mail e nunca é persistido; só o hash SHA-256 dele vai pro banco (ver
// PasswordResetToken em schema.prisma). SHA-256 aqui é intencional, não um
// descuido: diferente de senha de usuário (bcrypt, lenta de propósito pra
// dificultar força bruta contra um valor de baixa entropia escolhido por
// humano), o token já tem entropia suficiente pra dispensar hash lento, e
// precisa ser determinístico pra permitir buscar por
// `where: { token_hash }` — bcrypt gera um salt novo a cada chamada, então
// nunca dá pra recalcular o mesmo hash pra buscar por ele.
const TOKEN_BYTES = 32

export const REDEFINICAO_SENHA_VALIDADE_MINUTOS = 30

export function gerarTokenRedefinicaoSenha(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex')
}

export function hashTokenRedefinicaoSenha(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function calcularExpiracaoRedefinicaoSenha(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + REDEFINICAO_SENHA_VALIDADE_MINUTOS * 60 * 1000)
}

// Condição de "token ainda ativo" — reaproveitada como WHERE clause em DOIS
// lugares que precisam da MESMA regra (existente, não expirado, não usado)
// nunca divergir entre si:
//   - esqueciSenha: invalida (used_at = agora) qualquer token ativo do
//     usuário antes de criar um novo;
//   - redefinirSenha: consome (used_at = agora) o token só se ele ainda
//     estiver ativo — o UPDATE em si É a validação (ver comentário em
//     auth.ts sobre por que isso precisa ser atômico, não um SELECT seguido
//     de UPDATE separado).
// used_at não-nulo cobre tanto "já usado de verdade" quanto "invalidado por
// um pedido mais novo" (mesmo campo, ver comentário no schema.prisma) — os
// dois tornam o token igualmente não-ativo.
export function condicaoTokenAtivo(agora: Date = new Date()): { used_at: null; expires_at: { gt: Date } } {
  return { used_at: null, expires_at: { gt: agora } }
}
