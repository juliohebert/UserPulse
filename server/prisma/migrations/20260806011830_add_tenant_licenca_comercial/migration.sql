-- DropIndex
DROP INDEX "aparencias_widget_tenant_id_idx";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "licenca_fim" TIMESTAMP(3),
ADD COLUMN     "licenca_inicio" TIMESTAMP(3),
ADD COLUMN     "observacao_comercial" TEXT,
ADD COLUMN     "proxima_cobranca" TIMESTAMP(3),
ADD COLUMN     "ultimo_pagamento_em" TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "eventos_usuario_tenant_id_sistema_usuario_id_evento_criado_em_i" RENAME TO "eventos_usuario_tenant_id_sistema_usuario_id_evento_criado__idx";
