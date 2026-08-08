# AGENTS.md

## Projeto

- UserPulse é SaaS multi-tenant de mensagens in-app: API Express + Prisma/PostgreSQL em `server/`, painel React + Vite em `web/`, widget vanilla JS em `web/public/widget.js`.
- Código, UI, comentários e mensagens de commit são em português; mantenha esse padrão ao editar.
- `server/` e `web/` são pacotes independentes, com `node_modules` e `tsconfig` próprios; não há pacote compartilhado.
- `web/src/types.ts` espelha manualmente as respostas da API. Ao mudar Prisma/controllers, atualize esses tipos.

## Comandos Verificados

- Setup: `npm run install:all`, `cp server/.env.example server/.env`, definir `ADMIN_JWT_SECRET`, depois `npm run db:up`, `npm run db:migrate`, `npm run db:generate`.
- Dev completo: `npm run dev` roda `db:up -> db:migrate -> db:seed` e inicia server `3333` + web `5173`.
- Build completo: `npm run build`.
- Server: `npm run dev --prefix server`, `npm test --prefix server`, `npx tsc --noEmit` em `server/`.
- Web: `npm run dev --prefix web`, `npm run build --prefix web`, `npx tsc --noEmit` em `web/`.
- Widget não passa por bundler/tsc: valide com `node --check web/public/widget.js` e `node --check web/public/widget-loader.js`.
- A raiz tem `npm start`, mas ele executa `node server/dist/index.js`; para desenvolvimento use `npm run dev`, não siga o `README.md` antigo nesse ponto.

## Banco E Ambiente

- `docker-compose.yml` fixa `container_name: userpulse-postgres` e porta `5432`; um container antigo com esse nome bloqueia `npm run db:up` mesmo parado.
- `server/.env.example` deixa `NODE_ENV=production`; em dev, ajuste se precisar da rota local `/test-embed.html`, pois o servidor retorna 404 para ela em produção.
- `ADMIN_JWT_SECRET` é obrigatório no boot; `server/src/index.ts` chama `getSessionSecret()` e encerra o processo se faltar.
- `npm run db:migrate` na raiz usa `prisma migrate deploy`; `npm run db:migrate --prefix server` usa `prisma migrate dev` e é interativo/cria migrations.
- `db:seed` cria dados demo; não rode contra ambiente real de cliente. `db:seed:admin` é o bootstrap idempotente do primeiro admin. `db:seed:planos` faz upsert dos planos oficiais.

## Testes

- `server/package.json` lista os testes explicitamente; adicionar arquivo `*.test.ts` sem incluir no script faz ele não rodar em `npm test`.
- Para um único teste, use `npx tsx --test path/to/file.test.ts`; não há runner dedicado por arquivo.
- Padrão do repo: testes com `node:test` + `node:assert/strict`, sem supertest, sem DB/HTTP vivo; extraia lógica pura de controllers/middlewares e teste funções exportadas.
- Testes de RBAC inspecionam estaticamente `Router.stack`; não disparam requests.

## Arquitetura Que Afeta Mudanças

- Todo modelo operacional com `tenant_id` deve ser sempre escopado pelo tenant nos controllers. Tabelas filhas sem `tenant_id` herdam isolamento do pai; valide o pai antes de tocar nelas.
- Admin resolve tenant via sessão em `requireAdminAuth`; widget público resolve via `public_key` em `resolverTenantPublico`. O fallback hardcoded para tenant `quark` é compatibilidade temporária, não padrão para novos tenants.
- `AparenciaWidget.sistema` é globalmente único de propósito porque a rota pública consulta por `sistema` sem tenant.
- Status/limites de plano bloqueiam escritas, não leituras. Use `tenantGuards.ts` antes de create/update/delete em controllers admin.
- Não há integração de billing/Asaas; status/licença/plano são gestão manual do SUPER_ADMIN.

## Permissões

- Há duas camadas independentes: `requireSuperAdmin` protege Gestão SaaS cross-tenant; `requireEscritaTenant.ts` protege escrita dentro do tenant.
- `SUPER_ADMIN` também pertence a um tenant e não tem bypass geral em recursos operacionais; dentro do tenant se comporta como ADMIN.
- Backend é a fonte de verdade de RBAC. Ao mudar permissões, atualize também o espelho de UX em `web/src/utils/permissions.ts` e guards React relacionados.
- `DELETE /api/campanhas/:id` só inativa (`ativo:false`) e usa `requireEscritaConteudo`; não trate como hard delete reservado a ADMIN.
- Tours/jornadas têm hard delete/importação protegidos por `requireExclusaoOuImportacaoConteudo`.

## Widget

- `web/public/widget.js` é IIFE sem imports/dependências e é copiado cru pelo Vite; edite direto e valide sintaxe com Node.
- `widget-loader.js` injeta versão/cache-busting; `widget.js` é servido com cache longo e deve ser carregado com `?v=` pelo loader.
- Rotas `/api/widget/*` usam CORS aberto; rotas admin usam CORS com credenciais e `CORS_ORIGINS` em produção.

## Frontend

- Use `DESIGN.md` como referência visual para UI; nesta app, substitua a fonte Meta/Optimistic pela stack Apple/system definida em `web/src/index.css` e `tailwind.config.js`.
- Vite proxia `/api` para `http://localhost:3333`; auth admin é cookie httpOnly, não token no frontend.
- Ordem dos guards em `web/src/App.tsx`: `RequireAuth` -> `RequireSenhaAtualizada` -> `Layout` -> guards específicos de escrita/config/super admin.
- `/trocar-senha` fica fora de `RequireSenhaAtualizada` para evitar loop de redirect.

## Planos E Migrations

- Planos oficiais têm slugs duplicados manualmente em `server/src/controllers/adminPlanos.ts` e `web/src/pages/admin/Planos.tsx`; mantenha em sincronia.
- `Plano.interno` marca o plano interno Quark: não oferecer em dropdown de cliente e não remover.
- Algumas migrations são escritas à mão; siga o estilo Prisma SQL com comentários e inclua data-fix no SQL quando o banco precisa ficar correto sem depender de seed posterior.
