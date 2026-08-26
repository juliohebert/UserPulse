import crypto from 'crypto'

// Convite de acesso self-service (ConviteUsuario) — mesmo padrão de token de
// lib/passwordReset.ts: token bruto (32 bytes) vai só por e-mail, nunca
// persistido; o banco guarda só o hash SHA-256 (determinístico, permite
// buscar por where:{token_hash} — bcrypt não permitiria isso). Ver comentário
// completo em passwordReset.ts, mesmo raciocínio vale aqui.
const TOKEN_BYTES = 32

export const CONVITE_VALIDADE_DIAS = 7

export function gerarTokenConvite(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex')
}

export function hashTokenConvite(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function calcularExpiracaoConvite(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000)
}

// "Pendente" = ainda não aceito, ainda não cancelado, ainda não expirado —
// os três juntos decidem se o convite consome uma vaga de acesso do plano
// (ver contarUsoAcessos em tenantGuards.ts) e se ele ainda é resolvível pelo
// destinatário (ver GET/POST /auth/convite/:token em controllers/auth.ts).
// Reaproveitada como WHERE clause nos dois lugares — nunca divergir entre si.
export function condicaoConvitePendente(agora: Date = new Date()): {
  aceito_em: null
  cancelado_em: null
  expires_at: { gt: Date }
} {
  return { aceito_em: null, cancelado_em: null, expires_at: { gt: agora } }
}

// "Reenviável" = ainda não aceito, ainda não cancelado — DIFERENTE de
// condicaoConvitePendente acima por não exigir expires_at no futuro: o
// caso de uso do reenvio (POST /usuarios/convites/:id/reenviar) é
// justamente gerar um novo token/prazo pra um convite que já expirou (ou
// renovar um ainda válido), então "já expirado" não pode excluir o convite
// daqui — só aceito/cancelado excluem.
export function condicaoConviteReenviavel(): { aceito_em: null; cancelado_em: null } {
  return { aceito_em: null, cancelado_em: null }
}
