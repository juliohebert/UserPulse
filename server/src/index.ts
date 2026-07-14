import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import campanhasRouter from './routes/campanhas'
import widgetRouter from './routes/widget'
import dashboardRouter from './routes/dashboard'
import catalogoTelasRouter from './routes/catalogoTelas'
import toursRouter from './routes/tours'
import jornadasRouter from './routes/jornadas'
import aparenciaWidgetRouter from './routes/aparenciaWidget'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3333
const WEB_DIST = path.resolve(__dirname, '../../web/dist')

// Version injected into the widget loader for cache-busting.
// Set WIDGET_VERSION on the deploy platform (e.g., git rev-parse --short HEAD).
const WIDGET_VERSION =
  process.env.WIDGET_VERSION ||
  process.env.npm_package_version ||
  String(Date.now())

const WIDGET_LOADER_TEMPLATE = path.join(WEB_DIST, 'widget-loader.js')
let widgetLoaderJs: string | null = null
function getWidgetLoader(): string {
  if (!widgetLoaderJs) {
    widgetLoaderJs = fs.readFileSync(WIDGET_LOADER_TEMPLATE, 'utf8').replace('__UP_VERSION__', WIDGET_VERSION)
  }
  return widgetLoaderJs
}

// Origens permitidas para rotas de admin (campanhas + dashboard).
// Em dev, CORS_ORIGINS não definido → aceita qualquer origem.
// Em produção, definir como lista separada por vírgula:
//   CORS_ORIGINS=https://userpulse.seudominio.com,https://admin.seudominio.com
const adminOrigins: string[] | true = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : true

const corsAdmin = cors({ origin: adminOrigins })

// Widget é embarcado em sites de clientes (origem desconhecida) → sempre aberto.
const corsWidget = cors()

// Proteção por token para rotas admin.
// Se ADMIN_TOKEN não estiver definido (dev local), a verificação é ignorada.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || ''

function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_TOKEN) { next(); return }
  const auth = req.headers['authorization']
  if (auth === `Bearer ${ADMIN_TOKEN}`) { next(); return }
  res.status(401).json({ erro: 'Não autorizado.' })
}

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Widget loader — URL fixa, sem cache, injeta versão atual
app.get('/widget-loader.js', corsWidget, (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.send(getWidgetLoader())
})

// Widget embarcável — cacheável por versão (chamado com ?v=<versao> pelo loader)
app.get('/widget.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.sendFile(path.join(WEB_DIST, 'widget.js'))
})

// Conveniência de dev — serve o test-embed.html da raiz do repo para os botões
// "Abrir test-embed" do admin (preview de campanhas/tours). Não existe no
// build de produção (web/dist), então em produção isso só resulta em 404.
const TEST_EMBED_PATH = path.resolve(__dirname, '../../test-embed.html')
app.get('/test-embed.html', (_req, res) => {
  res.sendFile(TEST_EMBED_PATH, err => {
    if (err && !res.headersSent) res.status(404).end()
  })
})

// Rotas da API
app.use('/api/campanhas', corsAdmin, requireAdminToken, campanhasRouter)
app.use('/api/catalogo-telas', corsAdmin, requireAdminToken, catalogoTelasRouter)
app.use('/api/tours', corsAdmin, requireAdminToken, toursRouter)
app.use('/api/jornadas', corsAdmin, requireAdminToken, jornadasRouter)
app.use('/api/aparencia-widget', corsAdmin, requireAdminToken, aparenciaWidgetRouter)
app.use('/api/widget', corsWidget, widgetRouter)
app.use('/api/dashboard', corsAdmin, requireAdminToken, dashboardRouter)

// Assets estáticos do frontend (CSS, JS bundles, favicons…)
app.use(express.static(WEB_DIST))

// SPA catch-all — todas as rotas não-API retornam index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server rodando em http://localhost:${PORT}`)
})
