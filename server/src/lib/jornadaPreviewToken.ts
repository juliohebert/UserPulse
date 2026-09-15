import jwt from 'jsonwebtoken'
import { getSessionSecret } from './auth'

export const JORNADA_PREVIEW_AUDIENCE = 'userpulse:jornada-preview'
const PREVIEW_EXPIRACAO_SEGUNDOS = 10 * 60

export interface JornadaPreviewPayload {
  aud: typeof JORNADA_PREVIEW_AUDIENCE
  tenant_id: string
  jornada_id: string
  admin_user_id: string
  nonce: string
  iat?: number
  exp?: number
}

export function assinarTokenPreviewJornada(input: Omit<JornadaPreviewPayload, 'aud' | 'iat' | 'exp'>): string {
  return jwt.sign({ ...input, aud: JORNADA_PREVIEW_AUDIENCE }, getSessionSecret(), { expiresIn: PREVIEW_EXPIRACAO_SEGUNDOS })
}

export function verificarTokenPreviewJornada(token: string): JornadaPreviewPayload | null {
  try {
    const valor = jwt.verify(token, getSessionSecret(), { audience: JORNADA_PREVIEW_AUDIENCE })
    if (!valor || typeof valor !== 'object') return null
    const payload = valor as Record<string, unknown>
    if (payload.aud !== JORNADA_PREVIEW_AUDIENCE) return null
    if (typeof payload.tenant_id !== 'string' || typeof payload.jornada_id !== 'string' || typeof payload.admin_user_id !== 'string' || typeof payload.nonce !== 'string') return null
    return payload as unknown as JornadaPreviewPayload
  } catch {
    return null
  }
}

export const JORNADA_PREVIEW_TTL_SEGUNDOS = PREVIEW_EXPIRACAO_SEGUNDOS
