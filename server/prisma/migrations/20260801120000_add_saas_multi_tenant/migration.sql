-- SaaS multi-tenant foundation: tenants, planos, tenant_id nas tabelas
-- operacionais, e AdminUser.role virando enum. Cria o tenant "Quark" e um
-- plano interno, e migra todos os dados já existentes (admin_users,
-- campanhas, tours_guiados, jornadas, aparencias_widget, telas_catalogo)
-- para esse tenant, preservando 100% do que já existia.

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "planos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "preco_mensal" DECIMAL(10,2),
    "limite_campanhas_ativas" INTEGER,
    "limite_tours_ativos" INTEGER,
    "limite_eventos_mes" INTEGER,
    "limite_usuarios_admin" INTEGER,
    "permite_tours" BOOLEAN NOT NULL DEFAULT true,
    "permite_jornadas" BOOLEAN NOT NULL DEFAULT true,
    "permite_white_label" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "planos_slug_key" ON "planos"("slug");

-- CreateTable
-- codigo: sequencial comercial simples (1, 2, 3...) — só para suporte/vendas,
-- nunca usado como chave técnica (id/tenant_id continuam UUID em todo FK) nem
-- como public_key (esse segue reservado pra Fase 2 do widget multi-tenant).
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "codigo" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_inicio" TIMESTAMP(3),
    "trial_fim" TIMESTAMP(3),
    "plano_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_public_key_key" ON "tenants"("public_key");
CREATE UNIQUE INDEX "tenants_codigo_key" ON "tenants"("codigo");
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: plano interno (sem limites) + tenant Quark (ACTIVE, sem trial —
-- conta interna, não um cliente em teste). IDs fixos, mesmo padrão já usado
-- pelo seed do catálogo de telas (ver prisma/seed.ts).
INSERT INTO "planos" (
    "id", "nome", "slug", "descricao",
    "preco_mensal", "limite_campanhas_ativas", "limite_tours_ativos", "limite_eventos_mes", "limite_usuarios_admin",
    "permite_tours", "permite_jornadas", "permite_white_label", "ativo",
    "criado_em", "atualizado_em"
) VALUES (
    '00000000-0000-0000-0000-000000000101',
    'Interno (Quark)',
    'interno-quark',
    'Plano interno sem limites de uso, para a própria Quark.',
    NULL, NULL, NULL, NULL, NULL,
    true, true, true, true,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- codigo=1 explícito (não deixado pro DEFAULT) pra garantir que o primeiro
-- tenant comercial (Quark) sempre nasce com o código 1, independente de
-- qualquer ordem de execução. setval() logo abaixo realinha a sequence do
-- SERIAL pra que o PRÓXIMO tenant criado (via seedAdmin.ts ou pela aplicação)
-- receba 2, e assim por diante — sem isso, a sequence ficaria travada em 1
-- (seu valor inicial) e colidiria com este INSERT explícito.
INSERT INTO "tenants" (
    "id", "codigo", "nome", "slug", "public_key", "status", "trial_inicio", "trial_fim", "plano_id",
    "criado_em", "atualizado_em"
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    1,
    'Quark',
    'quark',
    '00000000-0000-0000-0000-100000000001',
    'ACTIVE',
    NULL, NULL,
    '00000000-0000-0000-0000-000000000101',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SELECT setval('tenants_codigo_seq', 1, true);

-- AdminUser: tenant_id (todo admin já existente vai para o tenant Quark)
ALTER TABLE "admin_users" ADD COLUMN "tenant_id" TEXT;
UPDATE "admin_users" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "admin_users" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "admin_users_tenant_id_idx" ON "admin_users"("tenant_id");

-- AdminUser.role: TEXT livre -> enum AdminRole, preservando o valor atual
-- ('admin' -> ADMIN; qualquer outro valor desconhecido também cai em ADMIN,
-- nunca falha a migration por um valor inesperado).
ALTER TABLE "admin_users" ADD COLUMN "role_new" "AdminRole";
UPDATE "admin_users" SET "role_new" = CASE
    WHEN upper("role") = 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"AdminRole"
    WHEN upper("role") = 'EDITOR' THEN 'EDITOR'::"AdminRole"
    WHEN upper("role") = 'VIEWER' THEN 'VIEWER'::"AdminRole"
    ELSE 'ADMIN'::"AdminRole"
END;
ALTER TABLE "admin_users" ALTER COLUMN "role_new" SET NOT NULL;
ALTER TABLE "admin_users" ALTER COLUMN "role_new" SET DEFAULT 'ADMIN';
ALTER TABLE "admin_users" DROP COLUMN "role";
ALTER TABLE "admin_users" RENAME COLUMN "role_new" TO "role";

-- Campanha: tenant_id + slug único por tenant (era único globalmente)
ALTER TABLE "campanhas" ADD COLUMN "tenant_id" TEXT;
UPDATE "campanhas" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "campanhas" ALTER COLUMN "tenant_id" SET NOT NULL;
DROP INDEX "campanhas_slug_key";
CREATE UNIQUE INDEX "campanhas_tenant_id_slug_key" ON "campanhas"("tenant_id", "slug");
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- TourGuiado: tenant_id + slug único por tenant
ALTER TABLE "tours_guiados" ADD COLUMN "tenant_id" TEXT;
UPDATE "tours_guiados" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "tours_guiados" ALTER COLUMN "tenant_id" SET NOT NULL;
DROP INDEX "tours_guiados_slug_key";
CREATE UNIQUE INDEX "tours_guiados_tenant_id_slug_key" ON "tours_guiados"("tenant_id", "slug");
ALTER TABLE "tours_guiados" ADD CONSTRAINT "tours_guiados_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Jornada: tenant_id + slug único por tenant
ALTER TABLE "jornadas" ADD COLUMN "tenant_id" TEXT;
UPDATE "jornadas" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "jornadas" ALTER COLUMN "tenant_id" SET NOT NULL;
DROP INDEX "jornadas_slug_key";
CREATE UNIQUE INDEX "jornadas_tenant_id_slug_key" ON "jornadas"("tenant_id", "slug");
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AparenciaWidget: tenant_id só para escopo do lado admin. "sistema" continua
-- @unique GLOBAL de propósito (não vira composto com tenant_id) — a rota
-- pública buscarAparencia (widget.ts) faz findUnique só por "sistema", sem
-- nenhum conceito de tenant; ver comentário no schema.prisma.
ALTER TABLE "aparencias_widget" ADD COLUMN "tenant_id" TEXT;
UPDATE "aparencias_widget" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "aparencias_widget" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "aparencias_widget" ADD CONSTRAINT "aparencias_widget_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "aparencias_widget_tenant_id_idx" ON "aparencias_widget"("tenant_id");

-- TelaCatalogo: tenant_id (sem constraint de unicidade prévia pra ajustar)
ALTER TABLE "telas_catalogo" ADD COLUMN "tenant_id" TEXT;
UPDATE "telas_catalogo" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "telas_catalogo" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "telas_catalogo" ADD CONSTRAINT "telas_catalogo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "telas_catalogo_tenant_id_idx" ON "telas_catalogo"("tenant_id");
