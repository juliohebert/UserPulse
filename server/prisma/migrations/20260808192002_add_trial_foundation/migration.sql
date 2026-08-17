-- AlterTable
ALTER TABLE "planos" ADD COLUMN     "eh_plano_trial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limite_jornadas_ativas" INTEGER,
ADD COLUMN     "trial_dias" INTEGER;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "plano_pendente_id" TEXT;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plano_pendente_id_fkey" FOREIGN KEY ("plano_pendente_id") REFERENCES "planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
