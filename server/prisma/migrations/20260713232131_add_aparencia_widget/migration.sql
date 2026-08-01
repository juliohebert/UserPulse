-- CreateTable
CREATE TABLE "aparencias_widget" (
    "id" TEXT NOT NULL,
    "sistema" TEXT NOT NULL,
    "cor_principal" TEXT,
    "logo_url" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aparencias_widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aparencias_widget_sistema_key" ON "aparencias_widget"("sistema");
