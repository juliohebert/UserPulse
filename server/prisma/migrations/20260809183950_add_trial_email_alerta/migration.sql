-- CreateEnum
CREATE TYPE "MarcoAlertaTrial" AS ENUM ('D7', 'D3', 'D1', 'VENCIDO');

-- CreateEnum
CREATE TYPE "StatusAlertaTrial" AS ENUM ('ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "trial_email_alertas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "marco" "MarcoAlertaTrial" NOT NULL,
    "destinatario_email" TEXT NOT NULL,
    "status" "StatusAlertaTrial" NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_erro" TEXT,
    "enviado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_email_alertas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trial_email_alertas_tenant_id_marco_destinatario_email_key" ON "trial_email_alertas"("tenant_id", "marco", "destinatario_email");

-- AddForeignKey
ALTER TABLE "trial_email_alertas" ADD CONSTRAINT "trial_email_alertas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
