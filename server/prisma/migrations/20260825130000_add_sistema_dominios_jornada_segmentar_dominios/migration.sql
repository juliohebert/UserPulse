-- AlterTable
ALTER TABLE "sistemas" ADD COLUMN     "dominios" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "jornadas" ADD COLUMN     "segmentar_dominios" TEXT[] DEFAULT ARRAY[]::TEXT[];
