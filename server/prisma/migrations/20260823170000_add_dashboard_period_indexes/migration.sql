-- Índices compostos para filtros históricos do dashboard por campanha e data.
CREATE INDEX "feedbacks_campanha_tipo_criado_idx"
  ON "feedbacks" ("campanha_id", "tipo_avaliacao", "criado_em");

CREATE INDEX "confirmacoes_leitura_campanha_criado_idx"
  ON "confirmacoes_leitura" ("campanha_id", "criado_em");
