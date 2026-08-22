export interface EstadoUtilidadeSimulada {
  itemId: string
  utilidade: boolean | null
  observacao: string
  enviado: boolean
}

export function criarResolvedorIdDestaque() {
  const idsLocais = new WeakMap<object, string>()
  let proximoId = 1

  return (item: { id?: string; chave_local?: string } & object): string => {
    if (item.id) return item.id
    if (item.chave_local) return item.chave_local
    const idExistente = idsLocais.get(item)
    if (idExistente) return idExistente
    const id = `destaque-local-${proximoId++}`
    idsLocais.set(item, id)
    item.chave_local = id
    return id
  }
}

export function criarEstadoUtilidadeSimulada(itemId: string): EstadoUtilidadeSimulada {
  return { itemId, utilidade: null, observacao: '', enviado: false }
}

export function deveRenderizarCtaSimulado(texto: string | null, url: string | null): boolean {
  if (!texto?.trim() || !url?.trim()) return false

  try {
    const protocolo = new URL(url.trim()).protocol
    return protocolo === 'http:' || protocolo === 'https:'
  } catch {
    return false
  }
}