-- AlterTable
-- Fundação NPS/CSAT/utilidade_destaque (ver comentário do model Feedback em
-- schema.prisma). DEFAULT 'nps' no ADD COLUMN faz o backfill de todo
-- feedback já existente numa única instrução (todo feedback até hoje é
-- NPS, é o único formato que já existiu); o DROP DEFAULT logo depois é só
-- pra manter o schema.prisma (sem @default nesse campo) em sincronia com o
-- banco, evitando drift — a aplicação sempre envia tipo_avaliacao
-- explicitamente a partir de agora.
ALTER TABLE "feedbacks" ADD COLUMN     "destaque_item_id" TEXT,
ADD COLUMN     "tipo_avaliacao" TEXT NOT NULL DEFAULT 'nps',
ADD COLUMN     "util" BOOLEAN,
ALTER COLUMN "nota" DROP NOT NULL;

ALTER TABLE "feedbacks" ALTER COLUMN "tipo_avaliacao" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "feedbacks_campanha_id_tipo_avaliacao_idx" ON "feedbacks"("campanha_id", "tipo_avaliacao");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_destaque_item_id_fkey" FOREIGN KEY ("destaque_item_id") REFERENCES "campanha_destaque_itens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Campanha.tipo_avaliacao_feedback MANTÉM @default("nps") no schema.prisma
-- (diferente de Feedback.tipo_avaliacao) porque nenhum controller escreve
-- este campo ainda (não há UI de seleção nesta fase) — toda campanha nova
-- criada pelo admin precisa continuar resolvendo 'nps' automaticamente, sem
-- a aplicação precisar enviar o valor.
ALTER TABLE "campanhas" ADD COLUMN     "tipo_avaliacao_feedback" TEXT NOT NULL DEFAULT 'nps';
