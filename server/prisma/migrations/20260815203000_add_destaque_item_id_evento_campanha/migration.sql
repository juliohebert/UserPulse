-- AlterTable
ALTER TABLE "eventos_campanha" ADD COLUMN     "destaque_item_id" TEXT;

-- CreateIndex
CREATE INDEX "evt_campanha_tipo_criado_idx" ON "eventos_campanha"("campanha_id", "tipo_evento", "criado_em");

-- CreateIndex
CREATE INDEX "evt_campanha_item_tipo_idx" ON "eventos_campanha"("campanha_id", "destaque_item_id", "tipo_evento");

-- AddForeignKey
ALTER TABLE "eventos_campanha" ADD CONSTRAINT "eventos_campanha_destaque_item_id_fkey" FOREIGN KEY ("destaque_item_id") REFERENCES "campanha_destaque_itens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
