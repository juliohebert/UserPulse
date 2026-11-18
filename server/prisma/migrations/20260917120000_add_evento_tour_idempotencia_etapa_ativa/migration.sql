-- EventoTour precisa de uma chave única no banco para impedir duplicatas
-- concorrentes da mesma execução. Valores nulos legados permanecem permitidos.
ALTER TABLE "eventos_tour"
  ADD COLUMN "chave_idempotencia" TEXT;

CREATE UNIQUE INDEX "eventos_tour_tour_id_chave_idempotencia_key"
  ON "eventos_tour"("tour_id", "chave_idempotencia");

-- Etapas inativas são mantidas no painel, mas não são publicadas nem contam
-- para o progresso público da Jornada.
ALTER TABLE "etapas_jornada"
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
