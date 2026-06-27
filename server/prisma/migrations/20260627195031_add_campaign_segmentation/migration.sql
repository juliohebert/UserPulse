-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "segmentar_cliente_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "segmentar_estados" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "segmentar_perfis" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "segmentar_unidade_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "segmentar_usuario_tipos" TEXT[] DEFAULT ARRAY[]::TEXT[];
