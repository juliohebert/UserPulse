-- CreateTable
CREATE TABLE "tours_guiados" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "sistema" TEXT NOT NULL,
    "modo_identificacao" TEXT NOT NULL DEFAULT 'sistema_tela',
    "tela" TEXT,
    "data_cy" TEXT,
    "url_contem" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tours_guiados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_passos" (
    "id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "seletor_tipo" TEXT NOT NULL DEFAULT 'data_cy',
    "seletor" TEXT NOT NULL,
    "tooltip_posicao" TEXT NOT NULL DEFAULT 'auto',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_passos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tours_guiados_slug_key" ON "tours_guiados"("slug");

-- CreateIndex
CREATE INDEX "tour_passos_tour_id_idx" ON "tour_passos"("tour_id");

-- AddForeignKey
ALTER TABLE "tour_passos" ADD CONSTRAINT "tour_passos_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours_guiados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
