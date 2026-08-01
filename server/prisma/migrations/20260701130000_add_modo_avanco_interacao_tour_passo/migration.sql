-- AlterTable
ALTER TABLE "tour_passos" ADD COLUMN "modo_avanco_interacao" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "tour_passos" ADD COLUMN "seletor_confirmacao" TEXT;
