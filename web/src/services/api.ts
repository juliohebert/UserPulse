const BASE = '/api'

const ADMIN_TOKEN: string = import.meta.env.VITE_ADMIN_TOKEN ?? ''

function authHeader(): Record<string, string> {
  return ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const merged: RequestInit = {
    ...init,
    headers: { ...authHeader(), ...(init?.headers as Record<string, string> | undefined) },
  }
  const res = await fetch(`${BASE}${path}`, merged)
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
  fetch(`${BASE}${path}`, { headers: authHeader() }).then(res => {
    if (!res.ok) throw new Error('Erro ao baixar arquivo')
    return res.blob()
  })
