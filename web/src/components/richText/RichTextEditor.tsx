import { useEffect, useRef, useState } from 'react'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import type { RichTextDocument } from './types'
import { normalizarRichTextTipTap, textoParaRichText } from './types'

const OrderedListRestrita = OrderedList.extend({
  addAttributes() { return {} },
  addInputRules() { return [] },
})

export function RichTextEditor({ documento, texto, onChange, placeholder, compact = false, ariaLabelledBy }: {
  documento: RichTextDocument | null
  texto: string
  onChange: (documento: RichTextDocument, texto: string) => void
  placeholder: string
  compact?: boolean
  ariaLabelledBy?: string
}) {
  const elementoRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [, setVersao] = useState(0)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!elementoRef.current) return
    const instancia = new Editor({
      element: elementoRef.current,
      extensions: [
        Document,
        Paragraph,
        Text,
        HardBreak,
        BulletList,
        OrderedListRestrita,
        ListItem,
        Bold,
        Italic,
        Underline,
        Placeholder.configure({ placeholder }),
      ],
      content: documento ?? textoParaRichText(texto),
      editorProps: {
        attributes: {
          class: `ProseMirror ${compact ? 'min-h-[28px]' : 'min-h-[76px]'} outline-none`,
          ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : { 'aria-label': 'Descrição da campanha' }),
        },
      },
      onTransaction: () => setVersao(versao => versao + 1),
      onUpdate: ({ editor: editorAtual }) => {
        onChangeRef.current(normalizarRichTextTipTap(editorAtual.getJSON() as Record<string, unknown>), editorAtual.getText({ blockSeparator: '\n' }).trim())
      },
    })
    setEditor(instancia)
    return () => {
      instancia.destroy()
      setEditor(null)
    }
    // O conteúdo controlado é sincronizado no efeito abaixo; recriar a
    // instância a cada tecla faria o cursor perder a posição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!editor) return
    const esperado = documento ?? textoParaRichText(texto)
    if (JSON.stringify(normalizarRichTextTipTap(editor.getJSON() as Record<string, unknown>)) !== JSON.stringify(esperado)) {
      editor.commands.setContent(esperado, false)
    }
  }, [documento, editor, texto])

  useEffect(() => {
    if (!editor) return
    if (ariaLabelledBy) {
      editor.view.dom.setAttribute('aria-labelledby', ariaLabelledBy)
      editor.view.dom.removeAttribute('aria-label')
    } else {
      editor.view.dom.setAttribute('aria-label', 'Descrição da campanha')
      editor.view.dom.removeAttribute('aria-labelledby')
    }
  }, [ariaLabelledBy, editor])

  const botoes = [
    { nome: 'Negrito', icone: 'format_bold', ativo: editor?.isActive('bold') ?? false, acao: () => editor?.chain().focus().toggleBold().run() },
    { nome: 'Itálico', icone: 'format_italic', ativo: editor?.isActive('italic') ?? false, acao: () => editor?.chain().focus().toggleItalic().run() },
    { nome: 'Sublinhado', icone: 'format_underlined', ativo: editor?.isActive('underline') ?? false, acao: () => editor?.chain().focus().toggleUnderline().run() },
    { nome: 'Lista com marcadores', icone: 'format_list_bulleted', ativo: editor?.isActive('bulletList') ?? false, acao: () => editor?.chain().focus().toggleBulletList().run() },
    { nome: 'Lista numerada', icone: 'format_list_numbered', ativo: editor?.isActive('orderedList') ?? false, acao: () => editor?.chain().focus().toggleOrderedList().run() },
  ]

  return (
    <div className={`rich-text-editor overflow-hidden rounded-lg border border-[#ced0d4] bg-white transition focus-within:border-[#0064e0] focus-within:ring-1 focus-within:ring-[#0064e0] ${compact ? 'border-0 focus-within:ring-0' : ''}`}>
      <div className={`flex items-center gap-0.5 border-b border-[#dee3e9] bg-[#f8f9fb] p-1 ${compact ? 'rounded-lg border' : ''}`}>
        {botoes.map(botao => (
          <button
            key={botao.nome}
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={botao.acao}
            title={botao.nome}
            aria-label={botao.nome}
            aria-pressed={botao.ativo}
            className={`flex h-11 w-11 items-center justify-center rounded-md transition sm:h-10 sm:w-10 ${botao.ativo ? 'bg-[#0064e0] text-white' : 'text-[#444950]'}`}
          >
            <span className="material-symbols-outlined text-[17px]">{botao.icone}</span>
          </button>
        ))}
      </div>
      <div ref={elementoRef} className={`${compact ? 'px-0 py-2' : 'px-3 py-2'} text-[14px] leading-5 text-[#1c1e21]`} />
    </div>
  )
}
