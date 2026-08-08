-- AlterTable
ALTER TABLE "planos" ADD COLUMN     "interno" BOOLEAN NOT NULL DEFAULT false;

-- Data fix: o plano "Interno (Quark)" (seed via migration
-- 20260801120000_add_saas_multi_tenant) já existe antes desta coluna
-- existir — marca ele como interno=true imediatamente, sem depender de
-- alguém rodar `npm run db:seed:planos` depois de aplicar esta migration
-- (o script também garante isso de forma idempotente, ver prisma/seedPlanos.ts).
UPDATE "planos" SET "interno" = true WHERE "slug" = 'interno-quark';
