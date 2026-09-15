ALTER TABLE "tours_guiados"
  ADD COLUMN "permite_autonomo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permite_jornada" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "publico_geral" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "gatilhos" JSONB,
  ADD COLUMN "frequencia" TEXT NOT NULL DEFAULT 'uma_vez_por_usuario',
  ADD COLUMN "frequencia_intervalo_dias" INTEGER;

ALTER TABLE "eventos_tour"
  ADD COLUMN "execucao_id" TEXT,
  ADD COLUMN "origem" TEXT,
  ADD COLUMN "gatilho" TEXT,
  ADD COLUMN "jornada_id" TEXT,
  ADD COLUMN "bloco_id" TEXT,
  ADD COLUMN "etapa_id" TEXT;

ALTER TABLE "eventos_jornada"
  ADD COLUMN "execucao_jornada_id" TEXT,
  ADD COLUMN "chave_idempotencia" TEXT;

UPDATE "tours_guiados"
SET "permite_autonomo" = "ativo",
    "permite_jornada" = true,
    "publico_geral" = ("segmentacao_regras" IS NULL OR "segmentacao_regras" = '[]'::jsonb),
    "frequencia" = 'uma_vez_por_usuario',
    "gatilhos" = (
      CASE
        WHEN "modo_identificacao" = 'data_cy' AND NULLIF(BTRIM("data_cy"), '') IS NOT NULL
          THEN jsonb_build_array(jsonb_build_object('tipo', 'elemento', 'seletor_tipo', 'data_cy', 'seletor', BTRIM("data_cy")))
        WHEN "modo_identificacao" = 'url_contem' AND NULLIF(BTRIM("url_contem"), '') IS NOT NULL
          THEN jsonb_build_array(jsonb_build_object('tipo', 'url', 'url_contem', BTRIM("url_contem")))
        WHEN NULLIF(BTRIM("tela"), '') IS NOT NULL
          THEN jsonb_build_array(jsonb_build_object('tipo', 'entrada_tela', 'tela', BTRIM("tela")))
        ELSE '[]'::jsonb
      END
      || CASE WHEN "ativo" THEN '[{"tipo":"manual"}]'::jsonb ELSE '[]'::jsonb END
    );

CREATE UNIQUE INDEX "eventos_jornada_jornada_id_chave_idempotencia_key"
  ON "eventos_jornada"("jornada_id", "chave_idempotencia");
CREATE INDEX "eventos_tour_tour_origem_data_idx"
  ON "eventos_tour"("tour_id", "origem", "criado_em");
CREATE INDEX "eventos_tour_execucao_idx"
  ON "eventos_tour"("execucao_id");
CREATE INDEX "eventos_tour_tour_usuario_origem_data_idx"
  ON "eventos_tour"("tour_id", "usuario_id", "origem", "criado_em");

ALTER TABLE "jornadas" ALTER COLUMN "ativo" SET DEFAULT false;
