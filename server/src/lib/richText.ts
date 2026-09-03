export const RICH_TEXT_MAX_BYTES = 50_000
export const RICH_TEXT_MAX_NODES = 500
export const RICH_TEXT_MAX_TEXT_LENGTH = 10_000

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

export interface ResultadoRichText {
  erro: string | null
  documento: RichTextDocument | null
  texto: string | null
}

function objetoSimples(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor)
}

function apenasChaves(objeto: Record<string, unknown>, permitidas: string[]): boolean {
  const conjunto = new Set(permitidas)
  return Object.keys(objeto).every(chave => conjunto.has(chave))
}

function validarMarca(valor: unknown): valor is RichTextMark {
  if (!objetoSimples(valor) || typeof valor.type !== 'string') return false
  return (valor.type === 'bold' || valor.type === 'italic' || valor.type === 'underline')
    && apenasChaves(valor, ['type'])
}

function separarBlocos(partes: string[]): string {
  return partes.filter(parte => parte !== '').join('\n')
}

export function validarRichText(valor: unknown): ResultadoRichText {
  if (valor === null) return { erro: null, documento: null, texto: null }

  let bytes: number
  try {
    bytes = Buffer.byteLength(JSON.stringify(valor), 'utf8')
  } catch {
    return { erro: 'Descrição formatada inválida.', documento: null, texto: null }
  }
  if (bytes > RICH_TEXT_MAX_BYTES) {
    return { erro: `Descrição formatada excede o limite de ${RICH_TEXT_MAX_BYTES} bytes.`, documento: null, texto: null }
  }

  let quantidadeNos = 0
  let tamanhoTexto = 0

  function visitar(noBruto: unknown, pai: RichTextNode['type'] | null): { erro: string | null; texto: string } {
    if (!objetoSimples(noBruto) || typeof noBruto.type !== 'string') {
      return { erro: 'Nó de descrição formatada inválido.', texto: '' }
    }
    quantidadeNos += 1
    if (quantidadeNos > RICH_TEXT_MAX_NODES) {
      return { erro: `Descrição formatada excede o limite de ${RICH_TEXT_MAX_NODES} nós.`, texto: '' }
    }

    const tipo = noBruto.type
    if (tipo === 'text') {
      if (pai !== 'paragraph' || !apenasChaves(noBruto, ['type', 'text', 'marks']) || typeof noBruto.text !== 'string') {
        return { erro: 'Nó de texto inválido.', texto: '' }
      }
      if (noBruto.marks !== undefined && (!Array.isArray(noBruto.marks) || !noBruto.marks.every(validarMarca))) {
        return { erro: 'Marca de descrição formatada inválida.', texto: '' }
      }
      tamanhoTexto += noBruto.text.length
      if (tamanhoTexto > RICH_TEXT_MAX_TEXT_LENGTH) {
        return { erro: `Descrição formatada excede o limite de ${RICH_TEXT_MAX_TEXT_LENGTH} caracteres.`, texto: '' }
      }
      return { erro: null, texto: noBruto.text }
    }

    if (tipo === 'hardBreak') {
      if (pai !== 'paragraph' || !apenasChaves(noBruto, ['type'])) return { erro: 'Quebra de linha inválida.', texto: '' }
      return { erro: null, texto: '\n' }
    }

    if (tipo !== 'doc' && tipo !== 'paragraph' && tipo !== 'bulletList' && tipo !== 'orderedList' && tipo !== 'listItem') {
      return { erro: `Tipo de nó não permitido: ${tipo}.`, texto: '' }
    }
    if (!apenasChaves(noBruto, ['type', 'content'])) return { erro: `Atributos não permitidos no nó ${tipo}.`, texto: '' }
    if (tipo === 'doc' && pai !== null) return { erro: 'O nó doc só pode existir na raiz.', texto: '' }
    if (tipo === 'paragraph' && pai !== 'doc' && pai !== 'listItem') return { erro: 'Parágrafo em posição inválida.', texto: '' }
    if ((tipo === 'bulletList' || tipo === 'orderedList') && pai !== 'doc' && pai !== 'listItem') return { erro: 'Lista em posição inválida.', texto: '' }
    if (tipo === 'listItem' && pai !== 'bulletList' && pai !== 'orderedList') return { erro: 'Item de lista em posição inválida.', texto: '' }

    const conteudo = noBruto.content
    if (conteudo !== undefined && !Array.isArray(conteudo)) return { erro: `Conteúdo do nó ${tipo} deve ser uma lista.`, texto: '' }
    const filhos = (conteudo ?? []) as unknown[]
    if ((tipo === 'bulletList' || tipo === 'orderedList' || tipo === 'listItem') && filhos.length === 0) return { erro: `${tipo} não pode ser vazio.`, texto: '' }
    if ((tipo === 'bulletList' || tipo === 'orderedList') && filhos.some(filho => !objetoSimples(filho) || filho.type !== 'listItem')) {
      return { erro: 'Lista com filho inválido.', texto: '' }
    }
    if (tipo === 'listItem' && (!objetoSimples(filhos[0]) || filhos[0].type !== 'paragraph')) {
      return { erro: 'Item de lista deve começar com um parágrafo.', texto: '' }
    }
    if (tipo === 'paragraph' && filhos.some(filho => !objetoSimples(filho) || (filho.type !== 'text' && filho.type !== 'hardBreak'))) {
      return { erro: 'Parágrafo com filho inválido.', texto: '' }
    }
    if (tipo === 'doc' && filhos.some(filho => !objetoSimples(filho) || (filho.type !== 'paragraph' && filho.type !== 'bulletList' && filho.type !== 'orderedList'))) {
      return { erro: 'Documento com filho inválido.', texto: '' }
    }

    const textos: string[] = []
    for (const filho of filhos) {
      const resultado = visitar(filho, tipo as RichTextNode['type'])
      if (resultado.erro) return resultado
      textos.push(resultado.texto)
    }
    if (tipo === 'doc' || tipo === 'bulletList' || tipo === 'orderedList' || tipo === 'listItem') return { erro: null, texto: separarBlocos(textos) }
    return { erro: null, texto: textos.join('') }
  }

  const resultado = visitar(valor, null)
  if (resultado.erro) return { erro: resultado.erro, documento: null, texto: null }
  return { erro: null, documento: valor as RichTextDocument, texto: resultado.texto.trim() }
}
