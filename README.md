# UserPulse

UserPulse é uma plataforma de campanhas in-app para comunicar novidades, treinar usuários, divulgar melhorias e coletar feedback dentro dos sistemas da empresa.

---

## Visão do produto

Sistemas internos como ERPs, clínicas e portais corporativos raramente têm um canal nativo para comunicar atualizações aos usuários enquanto eles trabalham. O UserPulse resolve isso com um widget JavaScript leve que exibe campanhas em modal diretamente na interface do sistema hospedeiro — sem interromper o fluxo de trabalho.

O painel de administração permite criar campanhas, acompanhar visualizações, cliques e feedbacks NPS em tempo real.

---

## Funcionalidades — RC1

- **CRUD de campanhas** com suporte a título, subtítulo, descrição, imagem, vídeo, botão CTA
- **Tipos de campanha:** NPS, comunicado, novidade, treinamento, obrigatória
- **Templates** pré-configurados para acelerar a criação
- **Widget embarcável** (`widget.js`) — modal automática no sistema hospedeiro
- **Embed por slug** — campanha específica independente de tela
- **Embed por sistema/tela** — campanha dinâmica para qualquer tela elegível
- **Feedback NPS** (escala 0–10 + campo de observação)
- **Campanhas obrigatórias** com confirmação de leitura ("Li e entendi")
- **Reexibição periódica** configurável por dias
- **Controle de exibição única** por usuário (localStorage)
- **Dashboard** com métricas de visualizações, cliques CTA, taxa de clique e NPS médio
- **Filtros de listagem** por tipo, status, sistema e tela
- **Login admin** com sessão JWT em cookie httpOnly — protege as rotas de campanhas, tours, jornadas e dashboard
- **CORS configurável** por origens para rotas admin
- **7 migrations Prisma** com histórico completo

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + Express 4 + TypeScript |
| ORM | Prisma 6 + PostgreSQL 15+ |
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Widget | Vanilla JS (IIFE, sem dependências) |
| Banco (dev) | PostgreSQL via Docker Compose |

---

## Pré-requisitos

- Node.js 20+
- Docker Desktop (para o banco local via Docker Compose)

---

## Setup local

### 1. Banco de dados

```bash
docker compose up -d
```

Cria o PostgreSQL em `localhost:5432` com usuário e banco `userpulse`.

### 2. Variáveis de ambiente do servidor

Copie o exemplo e ajuste se necessário:

```bash
cp server/.env.example server/.env
```

O arquivo de exemplo já está configurado para o Docker local:

```env
DATABASE_URL="postgresql://userpulse:userpulse@localhost:5432/userpulse?schema=public"
PORT=3333
```

### 3. Instalar dependências

```bash
npm install
npm install --prefix server
npm install --prefix web
```

### 4. Migrations e Prisma Client

```bash
cd server
npm run db:migrate
npm run db:generate
```

### 5. Seed (campanha de demonstração)

```bash
cd server
npm run db:seed
```

Cria ou atualiza a campanha `quarkclinic-agenda-demo` para testes com o `test-embed.html`.

---

## Rodar em desenvolvimento

```bash
npm start
```

Na raiz, esse comando sobe servidor (porta 3333) e frontend (porta 5173) em paralelo.

Ou separadamente:

```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd web && npm run dev
```

Acesse o painel em `http://localhost:5173`.

---

## Testar o embed

1. `npm start` na raiz
2. Crie uma campanha ativa no painel (`http://localhost:5173`) ou rode `npm run db:seed`
3. Abra `test-embed.html` no navegador (clique duplo no arquivo)
4. A modal deve abrir automaticamente após ~800 ms

O `test-embed.html` usa o widget em modo slug por padrão. Para testar o modo por sistema/tela, descomente o bloco alternativo no final do arquivo.

---

## Scripts disponíveis

### Raiz

| Script | O que faz |
|---|---|
| `npm start` | Sobe server (tsx watch) + web (vite) em paralelo |
| `npm run build` | Build server (tsc) + web (tsc + vite) |
| `npm run db:migrate` | Aplica migrations pendentes (`prisma migrate deploy`) |
| `npm run db:seed` | Roda o seed de campanhas de demonstração |

### `server/`

| Script | O que faz |
|---|---|
| `npm run dev` | tsx watch (hot reload) |
| `npm run build` | tsc → `dist/` |
| `npm start` | `node dist/index.js` (produção) |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:migrate:dev` | `prisma migrate dev` (interativo, cria migrations) |
| `npm run db:generate` | `prisma generate` |
| `npm run db:seed` | `ts-node prisma/seed.ts` |

### `web/`

| Script | O que faz |
|---|---|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | tsc + vite build → `dist/` |
| `npm run preview` | Serve o build de produção localmente |

---

## Variáveis de ambiente

### `server/.env`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | URL de conexão PostgreSQL |
| `DIRECT_URL` | Neon apenas | URL direta (sem pooler) para migrations |
| `PORT` | Não | Porta do servidor (padrão: `3333`) |
| `NODE_ENV` | Não | `production` em produção |
| `CORS_ORIGINS` | Produção | Origens permitidas para rotas admin (separadas por vírgula) |
| `ADMIN_JWT_SECRET` | Sim | Assina a sessão de login admin (JWT em cookie httpOnly). Sem ele o servidor não sobe. Gere com `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Só bootstrap | Usada apenas por `npm run db:seed:admin` para criar o admin inicial |
| `ADMIN_PASSWORD` | Só bootstrap | Idem — 8+ caracteres |
| `ADMIN_NAME` | Não | Idem, opcional (padrão: "Administrador") |

### `web/.env`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_USERPULSE_WIDGET_URL` | Não | URL pública do `widget.js` (padrão: `window.location.origin/widget.js`) |

Login admin não precisa de variável no `web/.env` — a sessão é um cookie httpOnly enviado automaticamente pelo browser (front e back na mesma origem).

Copie os exemplos:
```bash
cp .env.example .env          # variáveis raiz (documentação)
cp server/.env.example server/.env
cp web/.env.example web/.env
```

### Bootstrap do admin inicial

Num ambiente novo (banco zerado/migrado), crie o primeiro admin:
```bash
ADMIN_EMAIL=admin@seudominio.com ADMIN_PASSWORD=defina-uma-senha-com-8-mais-caracteres ADMIN_NAME="Nome do Admin" \
  npm run db:seed:admin --prefix server
```
Idempotente — rodar de novo com o mesmo `ADMIN_EMAIL` não sobrescreve o admin já criado. Não rode `npm run db:seed` (dados de demonstração) num ambiente de cliente real; um ambiente zerado deve rodar só o seed admin.

---

## Estrutura do projeto

```
UserPulse/
├── server/                    # API Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma      # modelos: Campanha, Feedback, EventoCampanha, ConfirmacaoLeitura
│   │   ├── migrations/        # 7 migrations (histórico completo)
│   │   └── seed.ts            # campanha demo QuarkClinic/agenda
│   └── src/
│       ├── controllers/       # campanhas.ts, widget.ts, dashboard.ts
│       ├── routes/            # campanhas.ts, widget.ts, dashboard.ts
│       ├── lib/prisma.ts      # singleton PrismaClient
│       └── index.ts           # Express + middleware + rotas
│
├── web/                       # Painel admin React
│   ├── public/
│   │   └── widget.js          # widget embarcável (IIFE vanilla JS)
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   └── campanhas/     # Index, Form, Preview, CampanhaDashboard, QuickView
│       ├── components/        # layout/, ui/, widget/
│       ├── services/api.ts    # fetch wrapper com auth header
│       ├── utils/             # campanha.ts, templates.ts
│       └── types.ts
│
├── docs/
│   ├── deploy-producao.md     # guia completo de deploy
│   ├── integracao-embed.md    # referência do widget (parâmetros, modos, eventos)
│   └── integracao-quarkclinic.md  # exemplo prático para o QuarkClinic
│
├── test-embed.html            # página de teste do widget (simulação QuarkClinic)
├── docker-compose.yml         # PostgreSQL local
└── package.json               # scripts raiz (start, build, db:*)
```

---

## Como funciona o embed

O `widget.js` é um IIFE vanilla JS sem dependências. Ele é servido pelo mesmo Express que serve a API.

**Modo por slug** — campanha específica:

```html
<script src="https://userpulse.seudominio.com/widget.js"></script>
<script>
  window.UserPulse.init({
    slug: "pesquisa-satisfacao-q4",
    usuario_id: String(usuario.id),
    usuario_nome: usuario.nome,
    usuario_email: usuario.email
  });
</script>
```

**Modo por sistema/tela** — campanha automática/elegível:

```html
<script src="https://userpulse.seudominio.com/widget.js"></script>
<script>
  window.UserPulse.init({
    sistema: "QuarkClinic",
    tela: "agenda",
    usuario_id: String(usuario.id),
    usuario_nome: usuario.nome,
    usuario_email: usuario.email
  });
</script>
```

O widget faz `GET /api/widget/campanha?slug=...` ou `?sistema=...&tela=...`, aguarda `atraso_ms` e exibe o modal. Feedbacks e eventos são enviados automaticamente para `/api/widget/feedback` e `/api/widget/evento`.

---

## Documentação adicional

| Documento | Conteúdo |
|---|---|
| [docs/deploy-producao.md](docs/deploy-producao.md) | Sequência completa de deploy, variáveis por plataforma, checklist de segurança, rollback |
| [docs/integracao-embed.md](docs/integracao-embed.md) | Referência do widget: parâmetros, modos de embed, eventos, boas práticas |
| [docs/integracao-quarkclinic.md](docs/integracao-quarkclinic.md) | Guia prático de integração com o QuarkClinic (SPA React, mapeamento de telas) |

---

## Limitações conhecidas do RC1

- Widget não suporta múltiplas campanhas simultâneas na mesma tela — exibe a de maior prioridade
- Sem paginação na listagem de campanhas (carrega todas as campanhas)
- Sem suporte a internacionalização (i18n) — interface apenas em português
- `prisma generate` pode falhar no Windows se processos Node estiverem com o DLL em uso (solução: encerrar processos e repetir)

---

## Roadmap

- [ ] Login/autenticação no painel admin (email + senha ou SSO)
- [ ] Segmentação de usuários (exibir campanha apenas para usuário_ids específicos)
- [ ] Agendamento avançado (horário de início/fim com fuso)
- [ ] Paginação na listagem de campanhas
- [ ] Suporte a múltiplos idiomas no widget
- [ ] Webhooks para notificar sistemas externos ao receber feedback
- [ ] Exportação de feedbacks (CSV)
