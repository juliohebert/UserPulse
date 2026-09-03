export type RichTextMark = { type: 'bold' | 'italic' | 'underline' }

export type RichTextNode =
  | { type: 'doc'; content?: RichTextNode[] }
  | { type: 'paragraph'; content?: RichTextNode[] }
  | { type: 'text'; text: string; marks?: RichTextMark[] }
  | { type: 'hardBreak' }
  | { type: 'bulletList'; content: RichTextNode[] }
  | { type: 'orderedList'; content: RichTextNode[] }
  | { type: 'listItem'; content: RichTextNode[] }

export type RichTextDocument = Extract<RichTextNode, { type: 'doc' }>

function objetoSimples(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

function apenasChaves(valor: Record<string, unknown>, permitidas: string[]): boolean {
  return Object.keys(valor).every(chave => permitidas.includes(chave))
}

export function documentoRichTextValido(valor: unknown): valor is RichTextDocument {
  const visitados = new WeakSet<object>()

  function marcaValida(marca: unknown): boolean {
    if (!objetoSimples(marca)) return false
    return (marca.type === 'bold' || marca.type === 'italic' || marca.type === 'underline')
      && apenasChaves(marca, ['type'])
  }

  function noValido(no: unknown, pai: RichTextNode['type'] | null): boolean {
    if (!objetoSimples(no) || visitados.has(no)) return false
    visitados.add(no)

    if (no.type === 'text') {
      return pai === 'paragraph'
        && apenasChaves(no, ['type', 'text', 'marks'])
        && typeof no.text === 'string'
        && (no.marks === undefined || (Array.isArray(no.marks) && no.marks.every(marcaValida)))
    }
    if (no.type === 'hardBreak') return pai === 'paragraph' && apenasChaves(no, ['type'])
    if (no.type !== 'doc' && no.type !== 'paragraph' && no.type !== 'bulletList' && no.type !== 'orderedList' && no.type !== 'listItem') return false
    if (!apenasChaves(no, ['type', 'content']) || (no.content !== undefined && !Array.isArray(no.content))) return false
    if (no.type === 'doc' && pai !== null) return false
    if (no.type === 'paragraph' && pai !== 'doc' && pai !== 'listItem') return false
    if ((no.type === 'bulletList' || no.type === 'orderedList') && pai !== 'doc' && pai !== 'listItem') return false
    if (no.type === 'listItem' && pai !== 'bulletList' && pai !== 'orderedList') return false

    const filhos = no.content ?? []
    if ((no.type === 'bulletList' || no.type === 'orderedList' || no.type === 'listItem') && filhos.length === 0) return false
    if ((no.type === 'bulletList' || no.type === 'orderedList') && filhos.some(filho => !objetoSimples(filho) || filho.type !== 'listItem')) return false
    if (no.type === 'listItem' && (!objetoSimples(filhos[0]) || filhos[0].type !== 'paragraph')) return false
    if (no.type === 'paragraph' && filhos.some(filho => !objetoSimples(filho) || (filho.type !== 'text' && filho.type !== 'hardBreak'))) return false
    if (no.type === 'doc' && filhos.some(filho => !objetoSimples(filho) || (filho.type !== 'paragraph' && filho.type !== 'bulletList' && filho.type !== 'orderedList'))) return false
    return filhos.every(filho => noValido(filho, no.type as RichTextNode['type']))
  }

  return noValido(valor, null)
}

export function textoParaRichText(texto: string): RichTextDocument {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: linhas.flatMap((linha, indice) => [
        ...(indice > 0 ? [{ type: 'hardBreak' as const }] : []),
        ...(linha ? [{ type: 'text' as const, text: linha }] : []),
      ]),
    }],
  }
}

export function normalizarRichTextTipTap(documento: Record<string, unknown>): RichTextDocument {
  function normalizarNo(no: Record<string, unknown>): RichTextNode {
    if (no.type === 'text') {
      const marks: RichTextMark[] | undefined = Array.isArray(no.marks)
        ? no.marks.flatMap<RichTextMark>(marca => {
            const mark = marca as Record<string, unknown>
            return mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline'
              ? [{ type: mark.type }]
              : []
          })
        : undefined
      return { type: 'text', text: String(no.text ?? ''), ...(marks?.length ? { marks } : {}) }
    }
    if (no.type === 'hardBreak') return { type: 'hardBreak' }
    const content = Array.isArray(no.content) ? no.content.map(filho => normalizarNo(filho as Record<string, unknown>)) : undefined
    if (no.type === 'paragraph') return { type: 'paragraph', ...(content?.length ? { content } : {}) }
    if (no.type === 'bulletList') return { type: 'bulletList', content: content ?? [] }
    if (no.type === 'orderedList') return { type: 'orderedList', content: content ?? [] }
    if (no.type === 'listItem') return { type: 'listItem', content: content ?? [] }
    return { type: 'doc', ...(content?.length ? { content } : {}) }
  }
  return normalizarNo(documento) as RichTextDocument
}
