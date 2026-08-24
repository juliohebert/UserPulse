-- Add administrative campaign name while preserving existing public titles.
ALTER TABLE "campanhas" ADD COLUMN "nome_interno" TEXT;

UPDATE "campanhas"
SET "nome_interno" = "titulo"
WHERE "nome_interno" IS NULL;

ALTER TABLE "campanhas" ALTER COLUMN "nome_interno" SET NOT NULL;
