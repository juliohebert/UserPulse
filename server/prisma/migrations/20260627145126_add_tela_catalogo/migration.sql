-- CreateTable
CREATE TABLE "telas_catalogo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sistema" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "modo_identificacao" TEXT NOT NULL DEFAULT 'url_contem',
    "tela" TEXT,
    "url_contem" TEXT,
    "data_cy" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telas_catalogo_pkey" PRIMARY KEY ("id")
);
