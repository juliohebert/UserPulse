// Gera `.widget-version` na raiz do repositório: hash SHA-256 (12 chars)
// determinístico do artefato final `web/dist/widget.js`.
//
// Roda ao final de `npm run build` do web — que é o MESMO build usado:
//   - pelo Render (Build Command: `... && npm run build && ...`, cujo
//     `npm run build` raiz delega para `npm run build --prefix web`);
//   - por um build web-only local (`npm run build` dentro de web/).
//
// Só Node/`node:crypto` — sem depender de `sha256sum` do sistema, portátil
// em Linux/Render.
//
// server/src/lib/widgetVersion.ts lê este arquivo como fallback nº2 na
// resolução de versão do widget (depois de `WIDGET_VERSION`, antes de
// `npm_package_version`). Não altera cache headers nem o comportamento do
// widget — só o valor de `?v=` que o widget-loader.js injeta em
// `/widget.js?v=<versao>` para cache-busting.
//
// Caminhos resolvidos a partir do próprio arquivo (import.meta.url), nunca
// do CWD — funciona igual chamado de web/ ou da raiz.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const aqui = path.dirname(fileURLToPath(import.meta.url)) // .../web/scripts
const widgetJs = path.resolve(aqui, '../dist/widget.js') // .../web/dist/widget.js
const destino = path.resolve(aqui, '../../.widget-version') // .../.widget-version (raiz)

let conteudo
try {
  conteudo = readFileSync(widgetJs)
} catch (err) {
  console.error(
    `[widget-version] ${widgetJs} não encontrado — rode o build do web antes ` +
      `(vite copia web/public/widget.js -> web/dist/widget.js).`,
  )
  process.exit(1)
}

const hash = createHash('sha256').update(conteudo).digest('hex').slice(0, 12)
writeFileSync(destino, hash + '\n')
console.log(`[widget-version] ${hash}  ->  ${destino}`)
