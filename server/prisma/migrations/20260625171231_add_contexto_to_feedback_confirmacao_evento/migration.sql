-- AlterTable
ALTER TABLE "confirmacoes_leitura" ADD COLUMN     "contexto" JSONB;

-- AlterTable
ALTER TABLE "eventos_campanha" ADD COLUMN     "contexto" JSONB;

-- AlterTable
ALTER TABLE "feedbacks" ADD COLUMN     "contexto" JSONB;
