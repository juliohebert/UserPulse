-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "segmentar_dominios" TEXT[] DEFAULT ARRAY[]::TEXT[];
