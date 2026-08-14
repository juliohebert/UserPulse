-- Marca um Sistema como padrão por tenant para pré-seleção em fluxos de criação.
ALTER TABLE "sistemas" ADD COLUMN "padrao" BOOLEAN NOT NULL DEFAULT false;

-- Data-fix: se o tenant já tem sistemas e nenhum padrão explícito, escolhe o
-- primeiro ativo por nome; se não houver ativo, usa o primeiro por nome.
WITH candidatos AS (
    SELECT
        "id",
        row_number() OVER (
            PARTITION BY "tenant_id"
            ORDER BY "ativo" DESC, "nome" ASC, "criado_em" ASC
        ) AS rn
    FROM "sistemas"
)
UPDATE "sistemas" s
SET "padrao" = true
FROM candidatos c
WHERE s."id" = c."id" AND c.rn = 1;

CREATE INDEX "sistemas_tenant_id_padrao_idx" ON "sistemas"("tenant_id", "padrao");
