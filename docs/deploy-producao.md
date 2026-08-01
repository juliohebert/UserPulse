# Deploy em Produção — UserPulse

Versão: RC1  
Data: 2026-06-24

---

## Variáveis de Ambiente

Copie `server/.env.example` para `server/.env` e preencha:

```env
# Banco de dados (use a URL do pooler para o app, DIRECT_URL para migrations)
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require&channel_binding=require"

# Necessário para rodar migrations diretamente (sem pooler)
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DB?sslmode=require"

# Porta do servidor (padrão: 3333)
PORT=3333

# Origens permitidas para /api/campanhas, /api/dashboard e /api/auth
# Separar por vírgula. Se ausente, aceita qualquer origem (INSEGURO em produção).
CORS_ORIGINS=https://userpulse.seudominio.com

# Segredo usado para assinar a sessão de login admin (JWT em cookie httpOnly).
# OBRIGATÓRIO: sem ele o servidor não sobe (falha rápido no boot).
# Gere com: openssl rand -hex 32
ADMIN_JWT_SECRET=
```

> `/api/widget/*` é sempre aberto — o widget precisa ser acessível a partir de qualquer domínio cliente.

`web/.env` não precisa de nenhuma variável para o login: a sessão é um cookie httpOnly enviado automaticamente pelo browser (front e back são a mesma origem em produção). Veja `web/.env.example`.

### Como gerar um segredo seguro

```bash
# Linux / macOS / WSL
openssl rand -hex 32

# PowerShell (Windows)
[System.Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

---

## Requisitos

- Node.js 20+
- PostgreSQL 15+ (Neon, Railway, Render, ou instância própria)
- Sem Docker em produção (o Docker Compose é apenas para desenvolvimento local)

---

## Sequência de Deploy

### 1. Instalar dependências

```bash
npm install --prefix server
npm install --prefix web
```

### 2. Build

```bash
# Na raiz do projeto
npm run build
# Equivalente a:
#   npm run build --prefix server  →  tsc  →  server/dist/
#   npm run build --prefix web     →  tsc + vite build  →  web/dist/
```

### 3. Migrations

```bash
# Aplica todas as migrations pendentes (não interativo, adequado para CI/CD)
npm run db:migrate
# Equivalente a: npx prisma migrate deploy (dentro de server/)
```

> Use `db:migrate:deploy` (não `db:migrate:dev`) em produção.  
> `migrate dev` é interativo e cria novas migrations — não é adequado para CI/CD.

### 4. Gerar Prisma Client (se necessário)

```bash
npm run db:generate --prefix server
# npx prisma generate
```

> Normalmente não é necessário em produção se o `dist/` foi gerado com o client correto.  
> É necessário apenas se o `node_modules/@prisma/client` estiver desatualizado.

### 5. Bootstrap do admin inicial (obrigatório num ambiente zerado)

```bash
ADMIN_EMAIL=admin@seudominio.com ADMIN_PASSWORD=defina-uma-senha-com-8-mais-caracteres ADMIN_NAME="Nome do Admin" \
  npm run db:seed:admin --prefix server
```

- `ADMIN_EMAIL` e `ADMIN_PASSWORD` são obrigatórios; sem eles o script não cria nada (só avisa e sai). `ADMIN_NAME` é opcional (padrão: "Administrador").
- Essas três variáveis são lidas **só por este script**, uma vez, para criar o primeiro admin — o servidor não as lê em runtime. Não é necessário mantê-las no `.env` depois de rodar o script.
- Idempotente: se `ADMIN_EMAIL` já existir no banco, o script apenas confirma e **não sobrescreve** nome/senha do admin já criado. Pode rodar de novo sem risco (ex.: reexecução de CI/CD).
- Um ambiente novo (banco zerado/migrado) deve rodar **apenas** este comando — não rode `npm run db:seed` (seed de dados de demonstração) num ambiente de cliente real.

### 6. Seed de demonstração (opcional, nunca em ambiente de cliente real)

```bash
npm run db:seed
# Cria/atualiza a campanha demo QuarkClinic/agenda
# Seguro de rodar repetidamente — usa upsert
```

> Não rode o seed em produção a menos que queira criar dados de demonstração. Um ambiente novo de cliente deve nascer só com o admin do passo 5, sem campanhas/tours/jornadas demo.

### 7. Start

```bash
# Na raiz do projeto
cd server && node dist/index.js
# ou, com variável PORT:
PORT=3333 node server/dist/index.js
```

O processo serve:
- `GET /widget.js` — widget embarcável (Content-Type: application/javascript)
- `/api/campanhas/*` — CRUD admin
- `/api/widget/*` — endpoints do widget
- `/api/dashboard/*` — métricas
- `/*` — SPA React (web/dist/index.html)

---

## Backup do Banco

### PostgreSQL — dump completo

```bash
pg_dump "$DATABASE_URL" -Fc -f userpulse_$(date +%Y%m%d_%H%M).dump
```

### PostgreSQL — restaurar

```bash
pg_restore -d "$DATABASE_URL" --no-owner --no-privileges userpulse_YYYYMMDD_HHMM.dump
```

### Tabelas críticas

| Tabela | Conteúdo |
|---|---|
| `campanhas` | Campanhas cadastradas |
| `feedbacks` | Respostas NPS dos usuários |
| `eventos_campanha` | Visualizações e cliques |
| `confirmacoes_leitura` | Confirmações "Li e entendi" |
| `_prisma_migrations` | Histórico de migrations |

---

## Checklist Pós-Deploy

### Aplicação

- [ ] `GET /health` retorna `{ "status": "ok", ... }`
- [ ] `GET /widget.js` retorna 200 com `Content-Type: application/javascript`
- [ ] Painel admin abre em `https://seudominio.com`
- [ ] Login com o admin criado no passo 5 funciona e dá acesso ao painel
- [ ] Listagem de campanhas carrega sem erros
- [ ] Criar campanha de teste — salva e aparece na listagem
- [ ] Dashboard da campanha carrega sem erros

### Widget

- [ ] `<script src="https://seudominio.com/widget.js">` funciona de um site externo
- [ ] `window.UserPulse.init({ sistema, tela })` não lança erros no console
- [ ] Modal abre após o atraso configurado
- [ ] Feedback é registrado e aparece no dashboard
- [ ] `GET /api/widget/campanha?sistema=X&tela=Y` retorna 200 ou 404

### Banco

- [ ] Todas as migrations aplicadas: `prisma migrate status` mostra nenhuma pendente
- [ ] Backup realizado antes do deploy

### Segurança

- [ ] `ADMIN_JWT_SECRET` definido no servidor (sem ele o processo não sobe)
- [ ] Admin inicial criado via `npm run db:seed:admin --prefix server` (passo 5) — não via seed geral
- [ ] `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` removidos do `.env` após o bootstrap (não são lidos em runtime)
- [ ] `CORS_ORIGINS` definido (sem ele, qualquer origem acessa as rotas admin, inclusive `/api/auth`)
- [ ] `server/.env` não commitado (`git status` não lista o arquivo)
- [ ] Servidor rodando com HTTPS (TLS no proxy reverso)
- [ ] `NODE_ENV=production` definido

---

## Variáveis por Plataforma

### Neon (serverless PostgreSQL)

```env
DATABASE_URL="postgresql://USER:PASS@ep-ENDPOINT-pooler.REGION.aws.neon.tech/DB?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://USER:PASS@ep-ENDPOINT.REGION.aws.neon.tech/DB?sslmode=require"
```

> O `DIRECT_URL` é necessário para `prisma migrate deploy` — o pooler não suporta migrations.  
> Adicione ao `schema.prisma` quando usar Neon:
> ```prisma
> datasource db {
>   provider  = "postgresql"
>   url       = env("DATABASE_URL")
>   directUrl = env("DIRECT_URL")
> }
> ```

### Railway / Render / Fly.io

```env
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB"
PORT=8080  # ajustar conforme a plataforma
```

---

## Rollback

Em caso de problema após deploy:

1. Reverter o código para a versão anterior (`git checkout <tag-anterior>`)
2. Re-buildar: `npm run build`
3. Restaurar backup do banco se houver migration problemática:
   ```bash
   pg_restore -d "$DATABASE_URL" --no-owner --clean userpulse_backup.dump
   ```
4. Reiniciar o processo

> As migrations do Prisma não têm rollback automático. Mantenha um dump de antes do deploy.
