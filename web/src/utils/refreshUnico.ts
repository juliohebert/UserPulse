// Fase 6 de permissões personalizadas — dedup genérico (sem React/fetch
// aqui, só a lógica de "no máximo 1 em voo por vez"). Usado por
// hooks/useAuth.tsx pra garantir que vários 403 quase simultâneos (ver
// services/api.ts, setForbiddenHandler) disparem só um GET /auth/me, nunca
// um por 403. Enquanto uma chamada está em andamento, chamadas extras
// reaproveitam a MESMA promise (nunca disparam fn de novo); depois que ela
// resolve ou rejeita, a próxima chamada dispara fn outra vez normalmente —
// não é um cache permanente, só evita chamadas concorrentes duplicadas.
export function criarRefreshUnico<T>(fn: () => Promise<T>): () => Promise<T> {
  let emAndamento: Promise<T> | null = null
  return () => {
    if (emAndamento) return emAndamento
    emAndamento = fn().finally(() => {
      emAndamento = null
    })
    return emAndamento
  }
}
