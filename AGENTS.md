# AGENTS.md

## Projeto

- UserPulse é SaaS multi-tenant de mensagens in-app: API Express + Prisma/PostgreSQL em `server/`, painel React + Vite em `web/`, widget vanilla JS em `web/public/widget.js`.
- Código, UI e comentários são em português; mensagens de commit e PRs são em inglês.
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
- Billing Asaas parcialmente automatizado via webhook (`tratarWebhookAsaas`, `asaasClient.ts`): `PAYMENT_CONFIRMED`/`RECEIVED` ativa/renova licença só com `asaas_status` local confiavelmente `ACTIVE` (allowlist); `PAYMENT_OVERDUE` não mexe em `status`/`licenca_fim` direto; `SUBSCRIPTION_DELETED`/`INACTIVATED` suspende. `asaas_status` é só status de assinatura (nunca de pagamento). `sincronizar()` é read-only quanto a licença/status. `SUSPENDED`/`CANCELED` nunca são alterados por webhook (`calcularAtualizacaoTenant` checa `Tenant.status` antes de `asaas_status`) — `PAYMENT_CONFIRMED` nunca reativa, `SUBSCRIPTION_DELETED/INACTIVATED` nunca rebaixa um `CANCELED`. Fora isso (editar `licenca_*`, `plano_id`, `CANCELED`), segue manual do SUPER_ADMIN.
- Billing self-service em `/api/billing/*` (`controllers/billing.ts`, `routes/billing.ts`, `web/src/pages/MinhaAssinatura.tsx`): só ADMIN do próprio tenant (`requireEscritaConfiguracao` em toda rota, inclusive leitura), tenant sempre de `req.adminUser`, nunca de parâmetro. Cliente contrata/regulariza cobrança vencida via página hospedada do Asaas (sem Asaas Checkout, sem dado de cartão passar pelo UserPulse). Cartão renova automático; Pix exige pagar manualmente cada cobrança do ciclo por ali (sem Pix Automático). `TRIAL`/`ACTIVE`/`EXPIRED` operam normalmente; `SUSPENDED`/`CANCELED` só leem a própria situação, toda ação financeira bloqueada (`bloqueioOperacaoFinanceiraSelfService`). Reativação self-service não existe — sem campo de origem confiável de `SUSPENDED`, fica fora de escopo.
- Conversão trial->pago: `GET /api/billing/planos-disponiveis` (mesmo guard, não pública) só lista plano comercial (`interno:false`, `eh_plano_trial:false`, `ativo:true`, `asaas_subscription_value` preenchido). `POST /api/billing/assinatura` recebe `plano_id` no body, recarrega o `Plano` do banco (preço nunca vem do cliente) e grava em `Tenant.plano_pendente_id` — nunca em `plano_id` direto. Só `calcularAtualizacaoTenant` no webhook `PAYMENT_CONFIRMED`/`RECEIVED` aplica de fato (`plano_id = plano_pendente_id`, depois limpa), com as mesmas proteções de `SUSPENDED`/`CANCELED`.

## Cadastro Público, Trial E Senha

- `POST /api/auth/cadastro` + `GET /api/auth/cadastro/config` (públicas, fora de `requireAdminAuth`, ver `routes/auth.ts`) criam `Tenant`+`AdminUser` numa `$transaction` só. `role` sempre `ADMIN`, `status` sempre `TRIAL`, plano/dias de trial sempre resolvidos no servidor (`resolverPlanoTrial`/`resolverDuracaoTrialDias` em `tenantGuards.ts`) — nunca lidos do body. Exige exatamente 1 `Plano` com `eh_plano_trial:true`; 0 ou mais de 1 falha fechado (503 genérico). `trial_dias` do plano tem prioridade; default 14 (`TRIAL_DIAS_PADRAO`) se null.
- Senha forte é centralizada em `motivoSenhaFraca`/`REGRAS_SENHA_FORTE` (`controllers/auth.ts`) e reusada por cadastro, `trocarSenha` e redefinição — nunca três regras divergentes. Reset administrativo do SUPER_ADMIN (`adminTenants.ts`, `resetarSenha`) continua só com 8 caracteres de propósito (senha temporária, força troca real em `trocarSenha` no primeiro login).
- "Esqueci minha senha" (`POST /api/auth/esqueci-senha` + `redefinir-senha`, públicas): resposta idêntica exista ou não o e-mail (nunca permite enumeração). Token bruto só existe em memória/e-mail; banco guarda só hash SHA-256 (`lib/passwordReset.ts`, model `PasswordResetToken`). Consumo é `UPDATE` condicional atômico (nunca SELECT+UPDATE separado); lock consultivo por `admin_user_id` protege pedidos concorrentes do mesmo usuário. Trocar/redefinir senha atualiza `senha_alterada_em`; `requireAdminAuth` invalida qualquer sessão JWT com `iat` anterior a isso (`sessaoInvalidadaPorTrocaSenha` em `lib/auth.ts`).
- E-mail transacional em `server/src/lib/email/`: `EmailService` só conhece a interface `EmailProvider`, nunca um SDK direto; `ResendEmailProvider.ts` é o único arquivo que importa o pacote `resend`. Sem `EMAIL_PROVIDER` configurado só loga e segue (nunca finge envio); `EMAIL_PROVIDER=resend` sem `RESEND_API_KEY`/`EMAIL_FROM` derruba o processo no boot. Envio é sempre best-effort (`.catch(...)` no controller) — nunca quebra cadastro/pedido de redefinição.

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
- `/cadastro`, `/esqueci-senha` e `/redefinir-senha` são rotas públicas de topo, fora de `RequireAuth`, igual `/login` — ainda não existe sessão nesses fluxos. `/minha-conta` fica dentro de `RequireAuth` sem nenhum guard extra (qualquer papel autenticado acessa; só edita a própria senha via `trocar-senha`).

## Planos E Migrations

- Planos oficiais têm slugs duplicados manualmente em `server/src/controllers/adminPlanos.ts` e `web/src/pages/admin/Planos.tsx`; mantenha em sincronia.
- `Plano.interno` marca o plano interno Quark: não oferecer em dropdown de cliente e não remover.
- Algumas migrations são escritas à mão; siga o estilo Prisma SQL com comentários e inclua data-fix no SQL quando o banco precisa ficar correto sem depender de seed posterior.
