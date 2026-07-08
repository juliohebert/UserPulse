-- CreateTable
CREATE TABLE "configuracao_widget" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ajuda_fab_posicao" TEXT NOT NULL DEFAULT 'inferior_direita',
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_widget_pkey" PRIMARY KEY ("id")
);
