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
- `/api/campanhas/*` — CRUD admin (protegido por `ADMIN_TOKEN`)
- `/api/widget/*` — endpoints do widget (abertos)
- `/api/dashboard/*` — métricas (protegido por `ADMIN_TOKEN`)
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
| `ADMIN_TOKEN` | Sim | token gerado com `openssl rand -hex 32` |
| `VITE_ADMIN_TOKEN` | — | ² |

¹ O Render injeta `PORT` automaticamente. O Express já usa `process.env.PORT` como padrão.

² `VITE_ADMIN_TOKEN` é uma variável de build do Vite — ela é injetada no bundle no momento em que `npm run build` executa. Configure-a **antes** do primeiro deploy para que o painel envie o token correto nos headers das requisições admin.

### Como gerar o ADMIN_TOKEN

```bash
# Linux / macOS / WSL
openssl rand -hex 32

# PowerShell
[System.Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

Use o mesmo valor em `ADMIN_TOKEN` (servidor) e `VITE_ADMIN_TOKEN` (frontend no build).

---

## Migrations

As migrations rodam automaticamente como parte do Build Command (`npm run db:migrate`).

Se precisar rodar migrations manualmente via **Render Shell**:

```bash
npm run db:migrate
```

> Nunca use `prisma migrate dev` em produção — ele é interativo e pode criar migrations não intencionais.

---

## Ordem completa no primeiro deploy

1. Criar PostgreSQL no Render (ou provisionar banco externo)
2. Copiar `DATABASE_URL` do banco criado
3. Criar Web Service apontando para o repositório
4. Configurar todas as variáveis de ambiente (incluindo `VITE_ADMIN_TOKEN` antes do build)
5. Disparar o deploy — o Build Command roda migrate automaticamente
6. Após o deploy, acessar `https://seu-servico.onrender.com/health`
7. Verificar que retorna `{ "status": "ok" }`

---

## Checklist pós-deploy

- [ ] `GET /health` → `{ "status": "ok" }`
- [ ] `GET /widget.js` → 200 com `Content-Type: application/javascript`
- [ ] Painel admin abre em `https://seu-servico.onrender.com`
- [ ] `GET /api/campanhas` sem token → 401 (se `ADMIN_TOKEN` definido)
- [ ] `GET /api/campanhas` com `Authorization: Bearer <token>` → 200
- [ ] Dashboard carrega campanhas e métricas

---

## Observações

**Sleep no plano gratuito**  
No plano Free do Render, o serviço hiberna após 15 minutos de inatividade. A primeira requisição após o sleep leva ~30 segundos para responder. Para produção real, use o plano Starter ou superior.

**Logs**  
Acesse em **Logs** no painel do Render. O servidor emite `Server rodando em http://localhost:<PORT>` ao iniciar.

**Redeploy após mudança de variável**  
Variáveis `VITE_*` são injetadas no bundle durante o build. Se mudar `VITE_ADMIN_TOKEN`, é necessário fazer um novo deploy para que o frontend reflita o valor atualizado. Variáveis do servidor (`ADMIN_TOKEN`, `DATABASE_URL`) são lidas em runtime e não exigem rebuild.
