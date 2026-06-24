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

# Origens permitidas para /api/campanhas e /api/dashboard
# Separar por vírgula. Se ausente, aceita qualquer origem (INSEGURO em produção).
CORS_ORIGINS=https://userpulse.seudominio.com

# Token de autenticação para rotas admin (/api/campanhas e /api/dashboard)
# Gere com: openssl rand -hex 32
# Se ausente, a verificação é ignorada (apenas para desenvolvimento local).
ADMIN_TOKEN=seu-token-secreto-aqui
```

> `/api/widget/*` é sempre aberto — o widget precisa ser acessível a partir de qualquer domínio cliente.

Além disso, copie `web/.env.example` para `web/.env` e defina:

```env
# Mesmo valor que ADMIN_TOKEN no servidor
VITE_ADMIN_TOKEN=seu-token-secreto-aqui
```

Rode o build web após configurar `web/.env`.

### Como gerar um token seguro

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

### 5. Seed (opcional)

```bash
npm run db:seed
# Cria/atualiza a campanha demo QuarkClinic/agenda
# Seguro de rodar repetidamente — usa upsert
```

> Não rode o seed em produção a menos que queira criar dados de demonstração.

### 6. Start

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

- [ ] `ADMIN_TOKEN` definido no servidor (sem ele, `/api/campanhas` e `/api/dashboard` ficam abertos)
- [ ] `VITE_ADMIN_TOKEN` definido em `web/.env` com o mesmo valor, build web refeito
- [ ] `CORS_ORIGINS` definido (sem ele, qualquer origem acessa as rotas admin)
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
