-- DropForeignKey
ALTER TABLE "aparencias_widget" DROP CONSTRAINT "aparencias_widget_sistema_id_fkey";

-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "modo_navegacao" TEXT NOT NULL DEFAULT 'SCROLL';

-- CreateTable
CREATE TABLE "campanha_conteudo_itens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "imagem_url" TEXT,
    "video_url" TEXT,
    "texto_botao" TEXT,
    "url_botao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanha_conteudo_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanha_conteudo_itens_campanha_id_ordem_idx" ON "campanha_conteudo_itens"("campanha_id", "ordem");

-- CreateIndex
CREATE INDEX "campanha_conteudo_itens_tenant_id_idx" ON "campanha_conteudo_itens"("tenant_id");

-- AddForeignKey
ALTER TABLE "campanha_conteudo_itens" ADD CONSTRAINT "campanha_conteudo_itens_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aparencias_widget" ADD CONSTRAINT "aparencias_widget_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistemas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
