-- AlterTable
ALTER TABLE "planos" ADD COLUMN     "nivel" INTEGER;

-- Backfill só dos 5 planos comerciais oficiais, identificados por slug (nunca
-- por preço — é exatamente a premissa que este campo substitui). Planos
-- históricos/custom e o plano interno (interno-quark) ficam com nivel NULL,
-- sem tentar adivinhar hierarquia nenhuma pra eles.
UPDATE "planos" SET "nivel" = 0 WHERE "slug" = 'teste-gratis';
UPDATE "planos" SET "nivel" = 1 WHERE "slug" = 'starter';
UPDATE "planos" SET "nivel" = 2 WHERE "slug" = 'growth';
UPDATE "planos" SET "nivel" = 3 WHERE "slug" = 'scale';
UPDATE "planos" SET "nivel" = 4 WHERE "slug" = 'enterprise';
