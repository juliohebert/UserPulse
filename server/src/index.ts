import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import campanhasRouter from './routes/campanhas'
import widgetRouter from './routes/widget'
import dashboardRouter from './routes/dashboard'
import sistemasRouter from './routes/sistemas'
import catalogoTelasRouter from './routes/catalogoTelas'
import toursRouter from './routes/tours'
import jornadasRouter from './routes/jornadas'
import aparenciaWidgetRouter from './routes/aparenciaWidget'
import authRouter from './routes/auth'
import adminTenantsRouter from './routes/adminTenants'
import adminPlanosRouter from './routes/adminPlanos'
import webhooksAsaasRouter from './routes/webhooksAsaas'
import billingRouter from './routes/billing'
import usuariosRouter from './routes/usuarios'
import { requireAdminAuth } from './middleware/requireAdminAuth'
import { requireSuperAdmin } from './middleware/requireSuperAdmin'
import { requireAcessoOperacional } from './middleware/requireAcessoOperacional'
import { getSessionSecret } from './lib/auth'
import { resolverWidgetVersion, lerWidgetVersionDoArquivo, injetarVersaoNoLoader } from './lib/widgetVersion'
import { iniciarSchedulerAlertasTrial } from './services/trialAlertasScheduler'
import { iniciarSchedulerDowngrade } from './services/downgradeScheduler'

dotenv.config()

// Falha rápido e alto no boot se o segredo de sessão não estiver configurado
// — sem ele, login/me/logout responderiam 500 em runtime (getSessionSecret
// já lança nesse caso), o que é seguro mas silencioso. Preferível travar o
// deploy aqui a descobrir só quando alguém tentar logar em produção.
try {
  getSessionSecret()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT ?? 3333
const WEB_DIST = path.resolve(__dirname, '../../web/dist')

// Versão injetada no widget loader pra cache-busting (?v=<versao> em
// /widget.js) — ver server/src/lib/widgetVersion.ts pra ordem de resolução e
// o motivo do fallback em arquivo (bug do ambiente Quark: WIDGET_VERSION
// nunca setado no deploy e npm_package_version nunca presente, já que o
// Dockerfile do clinic roda `node` direto, sem passar por npm).
// WIDGET_VERSION_FILE aponta pro arquivo gravado em build-time pelo
// Dockerfile do clinic (hash de conteúdo do próprio widget.js servido) —
// ausente em dev local ou em deploys que não gerem esse arquivo, caso em
// que lerWidgetVersionDoArquivo retorna null e a resolução cai pros
// fallbacks seguintes normalmente.
const WIDGET_VERSION_FILE = path.resolve(__dirname, '../../.widget-version')
const WIDGET_VERSION = resolverWidgetVersion({
  env: process.env,
  lerArquivoVersion: () => lerWidgetVersionDoArquivo(WIDGET_VERSION_FILE),
})

const WIDGET_LOADER_TEMPLATE = path.join(WEB_DIST, 'widget-loader.js')
let widgetLoaderJs: string | null = null
function getWidgetLoader(): string {
  if (!widgetLoaderJs) {
    widgetLoaderJs = injetarVersaoNoLoader(fs.readFileSync(WIDGET_LOADER_TEMPLATE, 'utf8'), WIDGET_VERSION)
  }
  return widgetLoaderJs
}

// Origens permitidas para rotas de admin (campanhas, tours, jornadas,
// dashboard, aparência, auth). Em dev, CORS_ORIGINS não definido → aceita
// qualquer origem. Em produção, definir como lista separada por vírgula:
//   CORS_ORIGINS=https://userpulse.seudominio.com,https://admin.seudominio.com
// credentials:true é obrigatório aqui — é o que permite o cookie httpOnly de
// sessão (ver lib/auth.ts) ir/voltar em requisições de outra origem; sem
// isso, um CORS_ORIGINS configurado bloquearia login/me/logout de qualquer
// front que não seja a própria origem do servidor.
const adminOrigins: string[] | true = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : true

const corsAdmin = cors({ origin: adminOrigins, credentials: true })

// Widget é embarcado em sites de clientes (origem desconhecida) → sempre aberto.
const corsWidget = cors()

app.use(express.json())
app.use(cookieParser())

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
// "Abrir test-embed" do admin (preview de campanhas/tours). Ferramenta local
// de validação do widget/gravador: NUNCA deve ficar acessível em produção,
// então essa rota só responde fora de NODE_ENV=production — em produção
// sempre retorna 404, mesmo que o arquivo exista no filesystem do deploy.
const TEST_EMBED_PATH = path.resolve(__dirname, '../../test-embed.html')
app.get('/test-embed.html', (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  res.sendFile(TEST_EMBED_PATH, err => {
    if (err && !res.headersSent) res.status(404).end()
  })
})

// Rotas da API
// /api/auth fica antes das demais rotas admin — login precisa ser alcançável
// sem sessão (é o próprio jeito de criar uma); /me e /logout se protegem
// sozinhas dentro do router (ver routes/auth.ts).
app.use('/api/auth', corsAdmin, authRouter)
// requireAcessoOperacional (Fase 6C) bloqueia estes 6 routers inteiros
// (leitura incluída) quando o trial do tenant já venceu — ver comentário no
// próprio middleware. Nunca aplicado a /api/auth, /api/billing, /api/admin/*
// nem /api/webhooks/asaas (regra explícita da tarefa: login, Minha Conta,
// Minha Assinatura, planos/cobrança/pagamento, Gestão SaaS e o webhook do
// Asaas continuam acessíveis mesmo com o trial vencido).
app.use('/api/campanhas', corsAdmin, requireAdminAuth, requireAcessoOperacional, campanhasRouter)
app.use('/api/sistemas', corsAdmin, requireAdminAuth, requireAcessoOperacional, sistemasRouter)
app.use('/api/catalogo-telas', corsAdmin, requireAdminAuth, requireAcessoOperacional, catalogoTelasRouter)
app.use('/api/tours', corsAdmin, requireAdminAuth, requireAcessoOperacional, toursRouter)
app.use('/api/jornadas', corsAdmin, requireAdminAuth, requireAcessoOperacional, jornadasRouter)
app.use('/api/aparencia-widget', corsAdmin, requireAdminAuth, requireAcessoOperacional, aparenciaWidgetRouter)
app.use('/api/widget', corsWidget, widgetRouter)
app.use('/api/dashboard', corsAdmin, requireAdminAuth, requireAcessoOperacional, dashboardRouter)
// Fase 5 — "Minha assinatura" self-service. Guard de papel (ADMIN-only)
// fica dentro do router, em cada rota (ver routes/billing.ts) — igual ao
// padrão de /api/aparencia-widget acima.
app.use('/api/billing', corsAdmin, requireAdminAuth, billingRouter)
// Gestão de usuários self-service (ADMIN convida/edita/remove acesso do
// próprio tenant) — guard de papel (ADMIN-only) fica dentro do router (ver
// routes/usuarios.ts), mesmo padrão de /api/aparencia-widget/billing acima.
// requireAcessoOperacional aplicado (diferente de billing): gerenciar
// usuários não é o caminho de regularizar um trial vencido, então segue o
// bloqueio operacional padrão.
app.use('/api/usuarios', corsAdmin, requireAdminAuth, requireAcessoOperacional, usuariosRouter)
// Painel Super Admin (gerenciar Tenants/Planos/teste grátis) — cross-tenant
// de propósito, por isso vem depois de requireSuperAdmin, nunca só
// requireAdminAuth como as demais rotas admin acima.
app.use('/api/admin/tenants', corsAdmin, requireAdminAuth, requireSuperAdmin, adminTenantsRouter)
app.use('/api/admin/planos', corsAdmin, requireAdminAuth, requireSuperAdmin, adminPlanosRouter)
// Webhook do Asaas — chamado server-to-server pelo próprio Asaas (nunca por
// um navegador), então sem CORS/sessão admin: a única proteção é o token no
// header (ver requireAsaasWebhookToken).
app.use('/api/webhooks/asaas', webhooksAsaasRouter)

// Assets estáticos do frontend (CSS, JS bundles, favicons…)
app.use(express.static(WEB_DIST))

// SPA catch-all — todas as rotas não-API retornam index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'))
})

// Fase 6D — alertas automáticos de trial por e-mail (7/3/1 dias restantes e
// vencido). Scheduler interno (setInterval, sem serviço externo pago) — ver
// services/trialAlertasScheduler.ts pra idempotência/retry.
iniciarSchedulerAlertasTrial()

// Fase 8B — efetivação de downgrade agendado (POST /billing/downgrade já
// sincronizou o Asaas; este scheduler só espelha localmente na data
// certa). Mesmo padrão de scheduler interno (setInterval, sem serviço
// externo) — ver services/downgradeScheduler.ts.
iniciarSchedulerDowngrade()

app.listen(PORT, () => {
  console.log(`Server rodando em http://localhost:${PORT}`)
})
