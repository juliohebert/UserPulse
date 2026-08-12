-- Aparencia padrao por tenant: sistema_id/sistema nulos representam a
-- configuracao default usada quando um sistema especifico nao possui override.

ALTER TABLE "aparencias_widget" ALTER COLUMN "sistema_id" DROP NOT NULL;
ALTER TABLE "aparencias_widget" ALTER COLUMN "sistema" DROP NOT NULL;

-- Garante no banco que exista no maximo uma aparencia default por tenant.
-- Indice parcial nao e representavel no schema Prisma, por isso fica escrito
-- manualmente na migration.
CREATE UNIQUE INDEX "aparencias_widget_tenant_default_key"
ON "aparencias_widget"("tenant_id")
WHERE "sistema_id" IS NULL;
