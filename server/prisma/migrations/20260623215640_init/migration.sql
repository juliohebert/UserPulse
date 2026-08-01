-- CreateTable
CREATE TABLE "campanhas" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sistema" TEXT NOT NULL,
    "tela" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "data_inicio" TIMESTAMP(3),
    "data_fim" TIMESTAMP(3),
    "pergunta_feedback" TEXT,
    "observacao_obrigatoria" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "observacao" TEXT,
    "usuario_id" TEXT,
    "usuario_nome" TEXT,
    "usuario_email" TEXT,
    "sistema" TEXT,
    "tela" TEXT,
    "navegador" TEXT,
    "dispositivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campanhas_slug_key" ON "campanhas"("slug");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
