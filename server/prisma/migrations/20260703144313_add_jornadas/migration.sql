-- CreateTable
CREATE TABLE "jornadas" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "segmentar_cliente_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segmentar_unidade_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segmentar_perfis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segmentar_usuario_tipos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segmentar_estados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jornadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_jornada" (
    "id" TEXT NOT NULL,
    "jornada_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" TEXT NOT NULL,
    "tour_id" TEXT,
    "campanha_id" TEXT,
    "url" TEXT,
    "texto_cta" TEXT DEFAULT 'Abrir',
    "abrir_nova_aba" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etapas_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_jornada" (
    "id" TEXT NOT NULL,
    "jornada_id" TEXT NOT NULL,
    "etapa_id" TEXT,
    "tipo_evento" TEXT NOT NULL,
    "usuario_id" TEXT,
    "sistema" TEXT,
    "tela" TEXT,
    "navegador" TEXT,
    "dispositivo" TEXT,
    "contexto" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jornadas_slug_key" ON "jornadas"("slug");

-- CreateIndex
CREATE INDEX "etapas_jornada_jornada_id_idx" ON "etapas_jornada"("jornada_id");

-- CreateIndex
CREATE INDEX "eventos_jornada_jornada_id_idx" ON "eventos_jornada"("jornada_id");

-- AddForeignKey
ALTER TABLE "etapas_jornada" ADD CONSTRAINT "etapas_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_jornada" ADD CONSTRAINT "etapas_jornada_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours_guiados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_jornada" ADD CONSTRAINT "etapas_jornada_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_jornada" ADD CONSTRAINT "eventos_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_jornada" ADD CONSTRAINT "eventos_jornada_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas_jornada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
