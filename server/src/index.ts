import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import campanhasRouter from './routes/campanhas'
import widgetRouter from './routes/widget'
import dashboardRouter from './routes/dashboard'

dotenv.config()

const app = express()
const PORT = process.env.PORT ?? 3333
const WEB_DIST = path.resolve(__dirname, '../../web/dist')

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

// Widget embarcável — rota explícita com Content-Type correto
app.get('/widget.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.sendFile(path.join(WEB_DIST, 'widget.js'))
})

// Rotas da API
app.use('/api/campanhas', corsAdmin, requireAdminToken, campanhasRouter)
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
