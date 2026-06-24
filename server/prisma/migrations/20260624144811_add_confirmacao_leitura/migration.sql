-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "exige_confirmacao_leitura" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "confirmacoes_leitura" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "usuario_nome" TEXT,
    "usuario_email" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmacoes_leitura_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "confirmacoes_leitura" ADD CONSTRAINT "confirmacoes_leitura_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
