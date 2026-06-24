-- CreateTable
CREATE TABLE "eventos_campanha" (
    "id"          TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "tipo_evento" TEXT NOT NULL,
    "usuario_id"  TEXT,
    "sistema"     TEXT,
    "tela"        TEXT,
    "navegador"   TEXT,
    "dispositivo" TEXT,
    "criado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_campanha_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "eventos_campanha"
    ADD CONSTRAINT "eventos_campanha_campanha_id_fkey"
    FOREIGN KEY ("campanha_id")
    REFERENCES "campanhas"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
