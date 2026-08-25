# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

UserPulse is a multi-tenant SaaS in-app messaging platform: an embeddable vanilla-JS widget (`widget.js`) shows campaigns/tours/journeys inside a host system's UI, and a React admin panel manages content, tenants, plans and results. Backend is Express + Prisma/PostgreSQL, frontend is React + Vite, widget is a dependency-free IIFE. All in Portuguese (code comments, UI strings, commit messages) — match that when editing.

## Commands

Run from repo root unless noted.

```bash
# First-time setup
docker compose up -d --wait          # Postgres in a container (localhost:5433, override with POSTGRES_PORT)
npm run install:all                  # installs root + server + web
cp server/.env.example server/.env   # set ADMIN_JWT_SECRET (openssl rand -hex 32) — server won't boot without it
cd server && npm run db:migrate && npm run db:generate

# Everyday dev
npm run dev                          # db:up + migrate + seed, then server (3333) + web (5173) via concurrently
npm run build                        # tsc (server) && tsc + vite build (web)

# Server only (from server/)
npm run dev                          # tsx watch, hot reload
npm test                             # node:test — runs an explicit file list, see below
npx tsc --noEmit                     # type-check only

# Web only (from web/)
npm run dev
npx tsc --noEmit

# Widget files aren't bundled — validate syntax directly
node --check web/public/widget.js
node --check web/public/widget-loader.js
```

### Database / seeding

- `npm run db:migrate` (server) = `prisma migrate deploy`; `db:migrate:dev` = `prisma migrate dev` (interactive, creates migrations). On Windows, `prisma generate` can fail with `EPERM` if a `tsx watch` process still holds the query engine DLL — stop the dev server first, then regenerate.
- `db:seed` — demo campaign + screen catalog (`prisma/seed.ts`). Never run against a real customer environment.
- `db:seed:admin` — idempotent bootstrap of the first `AdminUser` (env vars `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`/`ADMIN_ROLE`/`ADMIN_TENANT_SLUG`). Never overwrites an existing admin for the same email.
- `db:seed:planos` — idempotent upsert (by `slug`) of the 5 official commercial plans (`teste-gratis`, `starter`, `growth`, `scale`, `enterprise`) plus a data-fix that keeps the internal `interno-quark` plan flagged correctly. Safe to re-run.

### Tests

`server/package.json`'s `test` script is an **explicit file list**, not a glob — adding a new `*.test.ts` file means adding it to that list or it silently never runs. All tests use `node:test` + `node:assert/strict`, no test framework, no supertest, no live DB/HTTP in tests. The established convention (see `tours.test.ts`, `widget.test.ts`, `rbac.test.ts`) is to test **pure exported functions** only — pull business logic (validation, aggregation, permission checks) out of controllers/middleware into standalone functions and unit-test those directly; integration paths that need a real DB (Prisma `groupBy`, full CRUD flows) are validated manually against a local server and documented as such in a comment, not automated. RBAC middleware tests additionally do static introspection of `Router.stack` to assert the right guard is wired to the right route, without ever dispatching a request.

No single-test-file runner is configured; use `npx tsx --test path/to/file.test.ts` directly to run one file.

## Architecture

### Monorepo layout, no shared package

`server/` and `web/` are independent npm packages with their own `node_modules`/`tsconfig`; there's no shared types package. `web/src/types.ts` hand-mirrors the shapes the API returns — when you change a Prisma model or a controller's response shape, update `types.ts` yourself.

### Multi-tenancy is foundational, not bolted on

Every operational model (`Campanha`, `TourGuiado`, `Jornada`, `AparenciaWidget`, `TelaCatalogo`, `EventoUsuario`) carries a `tenant_id` and is scoped by it in every controller query. Child tables (`Feedback`, `EventoCampanha`, `EventoTour`, `TourPasso`, `BlocoJornada`, `EtapaJornada`, `ConfirmacaoLeitura`) have no `tenant_id` of their own — their isolation comes from the parent's `tenant_id`, which controllers must validate before touching them.

Two separate resolution paths:
- **Admin routes**: `requireAdminAuth` (`server/src/middleware/requireAdminAuth.ts`) reads the session cookie, loads the `AdminUser` + `Tenant` + `Plano` from the DB on every request (so deactivating a user or suspending a tenant takes effect immediately, not just at next login), and attaches `req.adminUser`.
- **Public widget routes**: `resolverTenantPublico` (`server/src/lib/tenantGuards.ts`) resolves a tenant from the `public_key` the widget sends. A hardcoded fallback to the `quark` tenant exists for embeds that predate `public_key` — never copy that pattern for new tenants.

`AparenciaWidget.sistema` is the one intentional exception: it's globally unique (not `tenant_id + sistema`) because the public widget route looks it up by `sistema` alone with no tenant concept there.

### Tenant lifecycle and plan limits gate writes, not reads

`TenantStatus` = `TRIAL | ACTIVE | EXPIRED | SUSPENDED | CANCELED`. `tenantGuards.ts` has the enforcement logic, called by every admin controller before create/update/delete:
- `motivoBloqueioEscrita` — `SUSPENDED`/`CANCELED` block *all* writes.
- `motivoBloqueioAtivacao` — additionally blocks *creating or activating* content when `EXPIRED` (editing/deactivating existing content is still allowed).
- `checarLimiteCampanhasAtivas` / `checarLimiteToursAtivos` / `checarLimiteUsuariosAdmin` — enforce the tenant's `Plano` limits (`null` limit = unlimited).
- `motivoRecursoNaoPermitido` — gates `permite_tours`/`permite_jornadas` per plan.

Licensing/status is *not* purely manual anymore: `tratarWebhookAsaas` (`server/src/services/asaasClient.ts`) auto-activates/renews (`status: ACTIVE`, `licenca_fim` advanced) on `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`, but only when the tenant's `asaas_status` is already trustworthily `ACTIVE` (allowlist via `interpretarAsaasStatusAssinatura` — unknown/legacy/null never auto-activates). `PAYMENT_OVERDUE` never touches `status`/`licenca_fim` directly; expiry is left to `licenca_fim` passing + `motivoBloqueioEscrita`. `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` auto-suspend (`status: SUSPENDED`, never `CANCELED`). `asaas_status` itself means *only* Asaas subscription status (`ACTIVE`/`EXPIRED`/`INACTIVE`) — payment events never write it. `sincronizar()` (manual "refresh" button) stays read-only re: licensing — it only refreshes `asaas_status`/`asaas_ultima_sincronizacao` from a live Asaas lookup, never `status`/`licenca_fim`. Everything else (editing `licenca_inicio`/`licenca_fim` by hand, `plano_id`, `CANCELED`) is still 100% manual by SUPER_ADMIN.

Self-service billing lives at `/api/billing/*` (`controllers/billing.ts`, `routes/billing.ts`, `web/src/pages/MinhaAssinatura.tsx`) — the tenant's own ADMIN (never EDITOR/VIEWER; `requireEscritaConfiguracao` gates every route, including reads) can view billing status, edit billing data, contract a subscription, and pay overdue invoices via Asaas's own hosted payment page — no Asaas Checkout, no card data ever touches UserPulse. Tenant is always resolved from `req.adminUser`, never a request parameter. Card renews automatically each cycle; Pix means manually paying each new cycle's invoice through this same page (no Pix Automático support). `TRIAL`/`ACTIVE`/`EXPIRED` tenants can use self-service (regularizing an `EXPIRED` license is the intended use case); `SUSPENDED`/`CANCELED` are blocked from every financial action (`bloqueioOperacaoFinanceiraSelfService`) but can still read their own status. Self-service reactivation of an `INACTIVE` Asaas subscription doesn't exist — there's no reliable field yet distinguishing a manually-set `SUSPENDED` from one caused by billing, so it's deliberately out of scope until that exists. The webhook remains the only thing that actually confirms payment; `calcularAtualizacaoTenant` also never lets `PAYMENT_CONFIRMED` reactivate, or `SUBSCRIPTION_DELETED`/`INACTIVATED` downgrade, a `SUSPENDED`/`CANCELED` tenant (checks `Tenant.status` before `asaas_status`).

Converting from trial to a paid plan stays two-step, never immediate: `GET /api/billing/planos-disponiveis` (also `requireEscritaConfiguracao`, not public) lists only commercial plans (`interno: false`, `eh_plano_trial: false`, `ativo: true`, `asaas_subscription_value` set — never the internal or trial plan). `POST /api/billing/assinatura` takes `plano_id` in the body, reloads that `Plano` from the DB (price is never trusted from the client) and writes it to `Tenant.plano_pendente_id` — never to `plano_id` directly. Only `calcularAtualizacaoTenant` on `PAYMENT_CONFIRMED`/`RECEIVED` actually applies it (`plano_id = plano_pendente_id`, then clears `plano_pendente_id`), inheriting the same `SUSPENDED`/`CANCELED` checks as every other webhook path.

### Two independent permission layers — don't conflate them

1. **SUPER_ADMIN vs everyone else** (`server/src/middleware/requireSuperAdmin.ts`) — gates the cross-tenant "Gestão SaaS" routes (`/api/admin/tenants`, `/api/admin/planos`): managing tenants, plans, licensing. A SUPER_ADMIN also belongs to a tenant (Quark) and behaves like a regular ADMIN inside it — no bypass.
2. **ADMIN/EDITOR/VIEWER within one's own tenant** (`server/src/middleware/requireEscritaTenant.ts`) — three granular guards: `requireEscritaConteudo` (create/edit/activate campaigns/tours/journeys — ADMIN+EDITOR), `requireExclusaoOuImportacaoConteudo` (hard-delete tours/journeys, import tours — ADMIN only, EDITOR excluded), `requireEscritaConfiguracao` (widget appearance, screen catalog — ADMIN only). Note `DELETE /campanhas/:id` is *not* a real delete (the controller just sets `ativo:false`), so it uses `requireEscritaConteudo`, not the exclusion guard — read the comment in `routes/campanhas.ts` before assuming DELETE always means hard-delete.

Both layers are backend-enforced (source of truth); the frontend (`web/src/utils/permissions.ts`, `RequireEscritaConteudo.tsx`, `RequireEscritaConfiguracao.tsx`, `RequireSuperAdmin.tsx`) only mirrors the rules to hide/disable UI — never trust the frontend copy when changing a permission, update the backend Set first and keep the frontend mirror in sync (each has a comment pointing at its counterpart).

### Plans: official vs internal vs custom

`Plano.interno` marks the one non-commercial plan ("Interno (Quark)") — never offered in a customer's plan dropdown, never deletable. A hardcoded slug set (`teste-gratis`/`starter`/`growth`/`scale`/`enterprise`, duplicated with a sync comment in both `adminPlanos.ts` and `Planos.tsx`) marks the official commercial plans — editable/deactivatable but never deletable, even unlinked. Only a plan that is neither internal, nor official, nor linked to any `Tenant` can be hard-deleted (`DELETE /api/admin/planos/:id`).

### Auth

Session is a JWT in an httpOnly cookie (`server/src/lib/auth.ts`), not a DB-backed session table — stateless, but `requireAdminAuth` re-checks the user/tenant against the DB on every request anyway. `ADMIN_JWT_SECRET` is required at boot (`index.ts` calls `getSessionSecret()` and `process.exit(1)`s if unset — no silent no-auth fallback). Forced password change (`senha_temporaria` flag, set whenever SUPER_ADMIN creates or resets a user's password) is enforced by a frontend route guard (`RequireSenhaAtualizada.tsx`) redirecting to `/trocar-senha`; the backend does *not* block other API calls based on this flag, only the dedicated `/api/auth/trocar-senha` endpoint validates the change itself.

Public self-service signup (`POST /api/auth/cadastro`, plus `GET /api/auth/cadastro/config` for the public config the signup UI needs) is the only way to create a `Tenant`+`AdminUser` pair without going through SUPER_ADMIN — both sit outside `requireAdminAuth` (see `routes/auth.ts`), but `cadastro()` (`controllers/auth.ts`) hardcodes `role: ADMIN` and `status: TRIAL` server-side and creates both rows in one `$transaction`; the trial `Plano` (`eh_plano_trial: true`, exactly one must exist — `resolverPlanoTrial` in `tenantGuards.ts` fails closed with a generic 503 otherwise) and its `trial_dias` (default 14, `TRIAL_DIAS_PADRAO`) drive plan/limits/trial dates, never the request body. Password strength is centralized in `motivoSenhaFraca`/`REGRAS_SENHA_FORTE` (`controllers/auth.ts`) and reused identically by signup, `trocarSenha`, and password reset — the one exception is the SUPER_ADMIN-issued temporary password in `adminTenants.ts` (`resetarSenha`), which stays at 8 characters on purpose since it forces a real password through `trocarSenha` on first login anyway. Password reset (`POST /api/auth/esqueci-senha` / `redefinir-senha`, also public) never reveals whether an email exists, stores only a SHA-256 hash of the reset token (`lib/passwordReset.ts`, `PasswordResetToken` model — the raw token only ever leaves via email), and consumes it with an atomic conditional `UPDATE` (not a read-then-write) to close a concurrent-reuse race. Changing a password (`trocarSenha` or `redefinirSenha`) bumps `senha_alterada_em`, and `requireAdminAuth` rejects any JWT whose `iat` predates it (`sessaoInvalidadaPorTrocaSenha` in `lib/auth.ts`) — the session that performed the change gets a fresh cookie in the same response so it isn't logged out by its own fix.

### Transactional email

`server/src/lib/email/` isolates the only Resend dependency in the codebase: `EmailService` (used by `controllers/auth.ts` for boas-vindas/redefinição de senha) depends only on the `EmailProvider` interface, never a concrete SDK; `ResendEmailProvider.ts` is the sole file importing the `resend` package, resolved by `resolverEmailProvider()` (`lib/email/provider.ts`) from `EMAIL_PROVIDER`/`RESEND_API_KEY`/`EMAIL_FROM`. No `EMAIL_PROVIDER` set = dev-friendly no-op (logs and returns, never fakes success); `EMAIL_PROVIDER=resend` with a missing key/from throws at module load and kills the process — same fail-fast pattern as `getSessionSecret()`. Every send from a controller is fire-and-forget (`.catch(...)`) — signup and password-reset requests never wait on or fail because of email delivery.

### Widget

`web/public/widget.js` is a dependency-free IIFE — no build step, no imports, edited directly. `web/public/widget-loader.js` is a tiny fixed-URL bootstrapper that injects a cache-busting version (`WIDGET_VERSION` env var, or `npm_package_version`, or a timestamp) and is served with `no-cache`; `widget.js` itself is served immutable/long-cache since the loader's `?v=` query busts it. Both are static files copied as-is into `web/dist` by Vite (`publicDir`), never processed by the TS/React build — that's why `node --check` is the validation tool for them, not `tsc`. Public widget endpoints live under `/api/widget/*`, mounted with an open CORS policy (`corsWidget`) since the widget runs on arbitrary customer domains — distinct from `corsAdmin`, which is origin-restricted via `CORS_ORIGINS` in production.

### Backend request flow

`index.ts` wires each router with its own middleware stack, e.g. `app.use('/api/campanhas', corsAdmin, requireAdminAuth, campanhasRouter)`, then the router itself adds per-route guards (`requireEscritaConteudo` etc. on specific verbs). Controllers follow a consistent shape: validate/parse body → check tenant status/limits via `tenantGuards.ts` → scoped Prisma query → typed JSON response. Never return `password_hash`; `usuarioPublico()`/`tenantPublico()` in `controllers/auth.ts` are the canonical "safe to send to the client" projections and are reused across login/`/me`/password-change responses.

### Frontend routing/guards nest in a specific order

In `web/src/App.tsx`: `RequireAuth` → `RequireSenhaAtualizada` (forced password change) wraps `Layout`, and inside that, `RequireEscritaConteudo`/`RequireEscritaConfiguracao`/`RequireSuperAdmin` wrap specific route subtrees. When adding an admin page, decide which (if any) of these it needs and nest it at the right level — most content pages need none beyond the outer two (they self-gate individual buttons via `permissions.ts` instead of blocking the whole route).

`/cadastro`, `/esqueci-senha` and `/redefinir-senha` are public top-level routes outside `RequireAuth`, same as `/login` — they're the account-creation/recovery flows themselves, so there's no session yet to require. `/minha-conta` sits inside `RequireAuth` with none of the inner guards (any authenticated role reaches it — it only ever edits the signed-in user's own password, via `trocar-senha`, never another user's data).

### Prisma migrations are sometimes hand-written

Several migrations in `server/prisma/migrations/` were authored by hand (not `prisma migrate dev`) when a local DB wasn't reachable — they follow Prisma's exact SQL conventions (`-- AlterTable` comments, etc.) and often include a data-fix `UPDATE` alongside the `ALTER TABLE` (e.g. backfilling a new boolean flag on existing rows) so the DB is correct immediately after applying, not dependent on a seed script running afterward. Match that style when a migration needs to run before Docker/Postgres is available.
