import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const widgetSource = fs.readFileSync(
  path.resolve(__dirname, '../../web/public/widget.js'),
  'utf8'
)

test('descrição da campanha preserva quebras de linha sem renderizar HTML', () => {
  assert.match(
    widgetSource,
    /\.up-description\{[^}]*white-space:pre-wrap[^}]*\}/,
    'o CSS da descrição deve preservar as quebras de linha digitadas na campanha'
  )
  assert.match(
    widgetSource,
    /var itemDescricao = item\.descricao \? '<p class="up-description"'[\s\S]*escapeHtml\(item\.descricao\) \+ '<\/p>' : '';/,
    'o fallback da descrição deve continuar escapando HTML fornecido pelo usuário'
  )
  assert.match(widgetSource, /conteudoCriarRichText/, 'descrições formatadas devem usar o renderer seguro de nós')
})
