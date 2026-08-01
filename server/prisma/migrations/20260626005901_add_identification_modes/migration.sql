-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "data_cy" TEXT,
ADD COLUMN     "modo_identificacao" TEXT NOT NULL DEFAULT 'sistema_tela',
ADD COLUMN     "url_contem" TEXT;
