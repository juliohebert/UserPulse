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
    /<p class="up-description">' \+ escapeHtml\(item\.descricao\) \+ '<\/p>/,
    'a descrição deve continuar escapando HTML fornecido pelo usuário'
  )
})
