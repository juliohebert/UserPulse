-- AlterTable
ALTER TABLE "planos" ADD COLUMN     "asaas_billing_cycle" TEXT,
ADD COLUMN     "asaas_external_reference" TEXT,
ADD COLUMN     "asaas_subscription_value" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "asaas_customer_id" TEXT,
ADD COLUMN     "asaas_status" TEXT,
ADD COLUMN     "asaas_subscription_id" TEXT,
ADD COLUMN     "asaas_ultima_sincronizacao" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "asaas_webhook_events" (
    "id" TEXT NOT NULL,
    "asaas_event_id" TEXT,
    "evento" TEXT NOT NULL,
    "payment_id" TEXT,
    "subscription_id" TEXT,
    "customer_id" TEXT,
    "payload" JSONB NOT NULL,
    "processado" BOOLEAN NOT NULL DEFAULT false,
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMP(3),

    CONSTRAINT "asaas_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asaas_webhook_events_asaas_event_id_key" ON "asaas_webhook_events"("asaas_event_id");
