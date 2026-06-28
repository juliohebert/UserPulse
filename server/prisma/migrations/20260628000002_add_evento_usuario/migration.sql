-- CreateTable EventoUsuario
-- Global user event history for retroactive campaign blocking
CREATE TABLE "eventos_usuario" (
    "id"           TEXT NOT NULL,
    "sistema"      TEXT NOT NULL,
    "usuario_id"   TEXT NOT NULL,
    "evento"       TEXT NOT NULL,
    "cliente_id"   TEXT,
    "unidade_id"   TEXT,
    "perfil"       TEXT,
    "usuario_tipo" TEXT,
    "estado"       TEXT,
    "contexto"     JSONB,
    "criado_em"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for eligibility lookups
CREATE INDEX "eventos_usuario_sistema_usuario_id_evento_idx"
    ON "eventos_usuario"("sistema", "usuario_id", "evento");

-- CreateIndex for time-range queries
CREATE INDEX "eventos_usuario_sistema_usuario_id_evento_criado_em_idx"
    ON "eventos_usuario"("sistema", "usuario_id", "evento", "criado_em");
