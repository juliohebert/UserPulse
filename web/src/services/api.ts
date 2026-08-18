const BASE = '/api'

// Chamado a cada resposta 401 de qualquer rota admin — quem registra é
// AuthProvider (ver hooks/useAuth.tsx), que reage limpando o usuário local
// (o guard de rota cuida do redirect pra /login a partir disso). Mantém este
// módulo sem depender de React/react-router: só um callback opcional.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}

// Chamado a cada resposta 403 de qualquer rota admin, EXCETO a do próprio
// /auth/me — quem registra é AuthProvider (ver hooks/useAuth.tsx), que
// reage buscando /auth/me de novo pra atualizar permissoes_efetivas em
// memória (backend já aplica mudança de permissão na hora; o front só
// ficava desatualizado até reload/login). Nunca dispara pra /auth/me em si:
// evita a própria chamada de refresh reentrar aqui e encadear outra
// (looping), e evita reagir caso /auth/me alguma vez responda 403. Trata só
// como um sinal ("algo mudou, revalide") — nunca repete a request original
// nem mexe na mensagem de erro que ela já lança pra quem chamou (ver
// tratamento de !res.ok abaixo, inalterado).
let onForbidden: (() => void) | null = null
export function setForbiddenHandler(fn: (() => void) | null): void {
  onForbidden = fn
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const merged: RequestInit = {
    ...init,
    // Sessão admin é um cookie httpOnly (ver server/src/lib/auth.ts) — sem
    // isso o browser não anexa o cookie em requisições fetch, mesmo same-origin.
    credentials: 'include',
    headers: { ...(init?.headers as Record<string, string> | undefined) },
  }
  const res = await fetch(`${BASE}${path}`, merged)
  if (res.status === 401) onUnauthorized?.()
  if (res.status === 403 && path !== '/auth/me') onForbidden?.()
  if (!res.ok) {
    const text = await res.text()
    let message = text
    try { message = JSON.parse(text).erro ?? text } catch { /* use raw text */ }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const get = <T>(path: string) => request<T>(path)

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const put = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const del = (path: string) => request<void>(path, { method: 'DELETE' })

export const getBlob = (path: string): Promise<Blob> =>
  fetch(`${BASE}${path}`, { credentials: 'include' }).then(res => {
    if (res.status === 401) onUnauthorized?.()
    if (res.status === 403 && path !== '/auth/me') onForbidden?.()
    if (!res.ok) throw new Error('Erro ao baixar arquivo')
    return res.blob()
  })
