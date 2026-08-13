-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "valor_assinatura_atual" DECIMAL(10,2),
ADD COLUMN     "plano_downgrade_id" TEXT,
ADD COLUMN     "downgrade_efetivar_em" TIMESTAMP(3),
ADD COLUMN     "downgrade_valor_origem" DECIMAL(10,2),
ADD COLUMN     "downgrade_valor_destino" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plano_downgrade_id_fkey" FOREIGN KEY ("plano_downgrade_id") REFERENCES "planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fase 8B (fundação) — sem backfill de valor_assinatura_atual: Plano.
-- asaas_subscription_value é preço de CATÁLOGO atual, pode já ter divergido
-- do valor real contratado por tenants existentes (é exatamente o problema
-- que este campo existe pra resolver dali em diante). Um backfill ingênuo
-- a partir do catálogo reintroduziria o mesmo erro que o campo corrige.
-- Fica null pra tenants já existentes até a próxima confirmação financeira
-- (upgrade) — GET /billing/situacao já cai em fallback pro catálogo nesse
-- caso (ver obterSituacao em controllers/billing.ts).
