# Deploy no Render — UserPulse

---

## Tipo de serviço

**Web Service** (Node.js)

O Render serve a aplicação completa a partir de um único processo: Express serve a API, o painel React (web/dist/) e o widget.js no mesmo endereço.

---

## Banco de dados

Crie um **PostgreSQL** no Render (ou use Neon) antes de configurar o Web Service.

Copie a **Internal Database URL** (PostgreSQL no Render) ou a URL do pooler (Neon) — ela será usada em `DATABASE_URL`.

> Se usar Neon, você precisará também de `DIRECT_URL` apontando para o host sem `-pooler` para que `prisma migrate deploy` funcione.

---

## Configuração do Web Service

### Build Command

```
npm install && npm run install:all && npm run build && npm run db:migrate
```

O que cada etapa faz:

| Etapa | Comando | O que faz |
|---|---|---|
| 1 | `npm install` | Instala `concurrently` (devDep raiz) |
| 2 | `npm run install:all` | Instala deps de `server/` e `web/` |
| 3 | `npm run build` | `tsc` (server → dist/) + `tsc + vite` (web → dist/) |
| 4 | `npm run db:migrate` | `prisma migrate deploy` — aplica migrations pendentes |

> `prisma generate` é executado automaticamente como parte do `npm install --prefix server` (postinstall do `@prisma/client`).

### Start Command

```
npm start
```

Equivale a `node server/dist/index.js`. O processo Express serve:
- `GET /widget.js` — widget embarcável
- `/api/campanhas/*`, `/api/tours/*`, `/api/jornadas/*`, `/api/dashboard/*` — CRUD/métricas admin (protegidos por sessão de login, ver `ADMIN_JWT_SECRET` abaixo)
- `/api/auth/*` — login/logout/sessão admin
- `/api/widget/*` — endpoints do widget (abertos)
- `/*` — SPA React (web/dist/index.html)

### Root Directory

Deixe em branco (raiz do repositório).

### Runtime

**Node**

---

## Variáveis de Ambiente

Configure em **Environment → Environment Variables** no painel do Render:

| Variável | Obrigatória | Exemplo / Valor |
|---|---|---|
| `DATABASE_URL` | Sim | `postgresql://USER:PASS@HOST/DB?sslmode=require` |
| `DIRECT_URL` | Neon apenas | URL direta (sem pooler) para migrations |
| `NODE_ENV` | Sim | `production` |
| `PORT` | Não¹ | `3333` |
| `CORS_ORIGINS` | Sim | `https://userpulse.seudominio.com` |
| `ADMIN_JWT_SECRET` | Sim | segredo gerado com `openssl rand -hex 32` |

¹ O Render injeta `PORT` automaticamente. O Express já usa `process.env.PORT` como padrão.

`ADMIN_JWT_SECRET` assina a sessão de login (cookie httpOnly) — sem ele o servidor falha no boot. Não precisa de variável equivalente no `web/`: front e back são a mesma origem, o cookie é enviado automaticamente pelo browser.

### Como gerar o ADMIN_JWT_SECRET

```bash
# Linux / macOS / WSL
openssl rand -hex 32

# PowerShell
[System.Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

---

## Migrations

As migrations rodam automaticamente como parte do Build Command (`npm run db:migrate`).

Se precisar rodar migrations manualmente via **Render Shell**:

```bash
npm run db:migrate
```

> Nunca use `prisma migrate dev` em produção — ele é interativo e pode criar migrations não intencionais.

---

## Bootstrap do admin inicial

Depois que as migrations rodarem (banco zerado, sem tabela `admin_users` populada), crie o admin inicial via **Render Shell**:

```bash
ADMIN_EMAIL=admin@seudominio.com ADMIN_PASSWORD=defina-uma-senha-com-8-mais-caracteres ADMIN_NAME="Nome do Admin" \
  npm run db:seed:admin --prefix server
```

- `ADMIN_EMAIL`/`ADMIN_PASSWORD` obrigatórios (o script não cria nada sem os dois); `ADMIN_NAME` opcional.
- Essas variáveis são lidas só nesta execução do script — não é necessário deixá-las como Environment Variables permanentes no serviço.
- Idempotente: rodar de novo com o mesmo `ADMIN_EMAIL` não sobrescreve o admin já criado.
- Um ambiente novo (banco zerado) deve rodar **só** este comando — não rode `npm run db:seed` (dados de demonstração da QuarkClinic) num ambiente de cliente real.

---

## Ordem completa no primeiro deploy

1. Criar PostgreSQL no Render (ou provisionar banco externo)
2. Copiar `DATABASE_URL` do banco criado
3. Criar Web Service apontando para o repositório
4. Configurar todas as variáveis de ambiente, incluindo `ADMIN_JWT_SECRET`
5. Disparar o deploy — o Build Command roda migrate automaticamente
6. Após o deploy, acessar `https://seu-servico.onrender.com/health` e conferir `{ "status": "ok" }`
7. Rodar o bootstrap do admin inicial (seção acima) via Render Shell
8. Fazer login no painel com o admin criado

---

## Checklist pós-deploy

- [ ] `GET /health` → `{ "status": "ok" }`
- [ ] `GET /widget.js` → 200 com `Content-Type: application/javascript`
- [ ] Painel admin abre em `https://seu-servico.onrender.com`
- [ ] Admin inicial criado via `npm run db:seed:admin --prefix server` (não via seed geral)
- [ ] Login com o admin criado funciona e dá acesso ao painel
- [ ] `GET /api/campanhas` sem sessão → 401
- [ ] Dashboard carrega campanhas e métricas

---

## Observações

**Sleep no plano gratuito**  
No plano Free do Render, o serviço hiberna após 15 minutos de inatividade. A primeira requisição após o sleep leva ~30 segundos para responder. Para produção real, use o plano Starter ou superior.

**Logs**  
Acesse em **Logs** no painel do Render. O servidor emite `Server rodando em http://localhost:<PORT>` ao iniciar.

**Redeploy após mudança de variável**  
Variáveis do servidor (`ADMIN_JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`) são lidas em runtime e não exigem rebuild — basta reiniciar o serviço. Variáveis `VITE_*` (ex.: `VITE_USERPULSE_WIDGET_URL`) são injetadas no bundle durante o build e exigem um novo deploy para refletir no frontend.
