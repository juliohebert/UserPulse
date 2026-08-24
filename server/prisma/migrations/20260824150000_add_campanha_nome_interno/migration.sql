-- Add administrative campaign name while preserving existing public titles.
ALTER TABLE "Campanha" ADD COLUMN "nome_interno" TEXT;

UPDATE "Campanha"
SET "nome_interno" = "titulo"
WHERE "nome_interno" IS NULL;

ALTER TABLE "Campanha" ALTER COLUMN "nome_interno" SET NOT NULL;
