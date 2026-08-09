import jwt from 'jsonwebtoken'

// Sessão admin — JWT assinado guardado num cookie httpOnly (ver requireAdminAuth
// e controllers/auth.ts). Sem tabela de sessão no banco de propósito: o token
// já carrega tudo que a sessão precisa (sub/email/role) e é stateless — mais
// simples pra um painel single-tenant de uso interno, sem multi-tenancy nesta
// fase (ver contexto da tarefa). requireAdminAuth ainda confere `ativo` no
// banco a cada request, então desativar um admin revoga o acesso na hora,
// mesmo com o token ainda válido.
export const ADMIN_SESSION_COOKIE = 'up_admin_session'

// 7 dias — sessão "razoável" pra uso interno (não é banco, é logout manual +
// expiração; sem refresh token nem "lembrar de mim" nesta fase).
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Sem fallback silencioso de propósito: ao contrário do antigo ADMIN_TOKEN
// (que virava no-op sem env definido), um segredo de assinatura de sessão
// fraco/ausente é um risco real — falha rápido e claro no boot em vez de
// aceitar sessões forjáveis. Ver server/.env.example.
export function getSessionSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET?.trim()
  if (!secret) {
    throw new Error(
      'ADMIN_JWT_SECRET não definido. Gere um valor com `openssl rand -hex 32` e defina no .env antes de subir o servidor.'
    )
  }
  return secret
}

export interface SessionPayload {
  sub: string
  email: string
  role: string
  // Só presente no retorno de verifySessionToken (o jsonwebtoken preenche
  // sozinho ao assinar, nunca é passado em signSessionToken) — segundos
  // desde epoch de quando o token foi emitido. Usado só pra decidir se a
  // sessão é anterior à última troca de senha (ver
  // sessaoInvalidadaPorTrocaSenha abaixo).
  iat?: number
}

export function signSessionToken(payload: Pick<SessionPayload, 'sub' | 'email' | 'role'>): string {
  return jwt.sign(payload, getSessionSecret(), { expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000) })
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSessionSecret())
    if (typeof decoded !== 'object' || decoded === null || typeof decoded.sub !== 'string') return null
    return {
      sub: decoded.sub,
      email: String(decoded.email ?? ''),
      role: String(decoded.role ?? ''),
      iat: typeof decoded.iat === 'number' ? decoded.iat : undefined,
    }
  } catch {
    return null
  }
}

// "Esqueci minha senha"/troca de senha — invalida sessões emitidas ANTES da
// última troca (ver requireAdminAuth.ts), sem precisar de uma tabela de
// sessões: sessões JWT continuam stateless, só comparamos o `iat` do token
// com AdminUser.senha_alterada_em a cada request. Margem de 1s absorve o
// arredondamento de `iat` (segundos inteiros) vs a precisão em milissegundos
// de senha_alterada_em — sem ela, o token NOVO emitido pela própria
// trocarSenha (que também atualiza senha_alterada_em, na mesma requisição)
// podia, na pior janela de 1s, ser invalidado por engano assim que emitido.
export function sessaoInvalidadaPorTrocaSenha(iat: number | undefined, senhaAlteradaEm: Date | null): boolean {
  if (!iat || !senhaAlteradaEm) return false
  return senhaAlteradaEm.getTime() > iat * 1000 + 1000
}

// options comuns entre "setar" (login) e "limpar" (logout) o cookie — precisam
// bater exatamente, senão o browser não substitui/remove o cookie certo.
export function sessionCookieOptions(): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: string
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Front e back são a mesma origem tanto em produção (Express serve o
    // build do web/dist, ver index.ts) quanto em dev (proxy do Vite pra
    // /api) — "lax" já cobre isso sem precisar de "none". secure=true exige
    // HTTPS, então só liga em produção (dev local é http://localhost).
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

export const SESSION_MAX_AGE = SESSION_MAX_AGE_MS
