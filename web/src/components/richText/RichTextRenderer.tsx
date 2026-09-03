import { Fragment, type ReactNode } from 'react'
import type { RichTextDocument, RichTextMark, RichTextNode } from './types'
import { documentoRichTextValido } from './types'

function aplicarMarca(conteudo: ReactNode, marca: RichTextMark, key: string): ReactNode {
  if (marca.type === 'bold') return <strong key={key}>{conteudo}</strong>
  if (marca.type === 'italic') return <em key={key}>{conteudo}</em>
  return <u key={key}>{conteudo}</u>
}

function renderizarNo(no: RichTextNode, key: string): ReactNode {
  if (no.type === 'text') {
    return (no.marks ?? []).reduce<ReactNode>((conteudo, marca, indice) => aplicarMarca(conteudo, marca, `${key}-m${indice}`), no.text)
  }
  if (no.type === 'hardBreak') return <br key={key} />
  const filhos = (no.content ?? []).map((filho, indice) => renderizarNo(filho, `${key}-${indice}`))
  if (no.type === 'paragraph') return <p key={key}>{filhos}</p>
  if (no.type === 'bulletList') return <ul key={key}>{filhos}</ul>
  if (no.type === 'orderedList') return <ol key={key}>{filhos}</ol>
  if (no.type === 'listItem') return <li key={key}>{filhos}</li>
  return <Fragment key={key}>{filhos}</Fragment>
}

export function RichTextRenderer({ documento, fallback, className = '' }: {
  documento: RichTextDocument | null | undefined
  fallback: string
  className?: string
}) {
  if (!documentoRichTextValido(documento)) return <p className={`whitespace-pre-wrap ${className}`}>{fallback}</p>
  return <div className={`up-rich-text ${className}`}>{renderizarNo(documento, 'doc')}</div>
}
