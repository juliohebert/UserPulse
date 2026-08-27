-- AlterTable
ALTER TABLE "eventos_campanha" ADD COLUMN     "conteudo_item_id" TEXT;

-- CreateIndex
CREATE INDEX "evt_campanha_conteudo_tipo_idx" ON "eventos_campanha"("campanha_id", "conteudo_item_id", "tipo_evento");

-- AddForeignKey
ALTER TABLE "eventos_campanha" ADD CONSTRAINT "eventos_campanha_conteudo_item_id_fkey" FOREIGN KEY ("conteudo_item_id") REFERENCES "campanha_conteudo_itens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
