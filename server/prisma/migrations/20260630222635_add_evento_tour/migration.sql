-- CreateTable
CREATE TABLE "eventos_tour" (
    "id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "tipo_evento" TEXT NOT NULL,
    "passo_ordem" INTEGER,
    "usuario_id" TEXT,
    "sistema" TEXT,
    "tela" TEXT,
    "navegador" TEXT,
    "dispositivo" TEXT,
    "contexto" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_tour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_tour_tour_id_idx" ON "eventos_tour"("tour_id");

-- AddForeignKey
ALTER TABLE "eventos_tour" ADD CONSTRAINT "eventos_tour_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours_guiados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
