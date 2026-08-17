-- Modulo central de configuracoes: sistemas por tenant, vinculando catalogo
-- de telas e aparencia sem remover os campos textuais usados pelo widget.

CREATE TABLE "sistemas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "identificador" TEXT NOT NULL,
    "url_base" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sistemas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sistemas_tenant_id_slug_key" ON "sistemas"("tenant_id", "slug");
CREATE UNIQUE INDEX "sistemas_tenant_id_identificador_key" ON "sistemas"("tenant_id", "identificador");
CREATE INDEX "sistemas_tenant_id_idx" ON "sistemas"("tenant_id");
ALTER TABLE "sistemas" ADD CONSTRAINT "sistemas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cria um Sistema para cada identificador tecnico ja usado em catalogo,
-- campanhas, tours ou aparencia. O slug e derivado do identificador e recebe
-- sufixo deterministico quando houver colisao dentro do mesmo tenant.
WITH valores AS (
    SELECT DISTINCT "tenant_id", trim("sistema") AS "identificador"
    FROM "telas_catalogo"
    WHERE trim(COALESCE("sistema", '')) <> ''
    UNION
    SELECT DISTINCT "tenant_id", trim("sistema") AS "identificador"
    FROM "campanhas"
    WHERE trim(COALESCE("sistema", '')) <> ''
    UNION
    SELECT DISTINCT "tenant_id", trim("sistema") AS "identificador"
    FROM "tours_guiados"
    WHERE trim(COALESCE("sistema", '')) <> ''
    UNION
    SELECT DISTINCT "tenant_id", trim("sistema") AS "identificador"
    FROM "aparencias_widget"
    WHERE trim(COALESCE("sistema", '')) <> ''
), normalizados AS (
    SELECT
        "tenant_id",
        "identificador",
        lower(regexp_replace(regexp_replace("identificador", '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) AS "slug_base"
    FROM valores
), numerados AS (
    SELECT
        "tenant_id",
        "identificador",
        COALESCE(NULLIF("slug_base", ''), 'sistema') AS "slug_base",
        row_number() OVER (PARTITION BY "tenant_id", COALESCE(NULLIF("slug_base", ''), 'sistema') ORDER BY "identificador") AS rn
    FROM normalizados
)
INSERT INTO "sistemas" ("id", "tenant_id", "nome", "slug", "identificador", "ativo", "criado_em", "atualizado_em")
SELECT
    gen_random_uuid()::text,
    "tenant_id",
    "identificador",
    CASE WHEN rn = 1 THEN "slug_base" ELSE "slug_base" || '-' || rn::text END,
    "identificador",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM numerados;

ALTER TABLE "telas_catalogo" ADD COLUMN "sistema_id" TEXT;
UPDATE "telas_catalogo" t
SET "sistema_id" = s."id"
FROM "sistemas" s
WHERE s."tenant_id" = t."tenant_id" AND s."identificador" = trim(t."sistema");
ALTER TABLE "telas_catalogo" ALTER COLUMN "sistema_id" SET NOT NULL;
CREATE INDEX "telas_catalogo_sistema_id_idx" ON "telas_catalogo"("sistema_id");
ALTER TABLE "telas_catalogo" ADD CONSTRAINT "telas_catalogo_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "aparencias_widget" ADD COLUMN "sistema_id" TEXT;
UPDATE "aparencias_widget" a
SET "sistema_id" = s."id"
FROM "sistemas" s
WHERE s."tenant_id" = a."tenant_id" AND s."identificador" = trim(a."sistema");
ALTER TABLE "aparencias_widget" ALTER COLUMN "sistema_id" SET NOT NULL;
CREATE UNIQUE INDEX "aparencias_widget_tenant_id_sistema_id_key" ON "aparencias_widget"("tenant_id", "sistema_id");
ALTER TABLE "aparencias_widget" ADD CONSTRAINT "aparencias_widget_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
