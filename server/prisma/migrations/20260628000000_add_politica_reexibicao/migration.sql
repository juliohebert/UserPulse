-- AddColumn: politica_reexibicao and reexibir_apos_dias to campanhas
ALTER TABLE "campanhas" ADD COLUMN "politica_reexibicao" TEXT NOT NULL DEFAULT 'uma_vez_apos_visualizacao';
ALTER TABLE "campanhas" ADD COLUMN "reexibir_apos_dias" INTEGER;

-- Campanhas obrigatórias (que não permitem fechar) devem reaparecer até responder/confirmar.
-- A política "uma_vez_apos_visualizacao" é incompatível com permitir_fechar_modal=false.
UPDATE "campanhas"
SET "politica_reexibicao" = 'ate_responder_ou_confirmar'
WHERE "permitir_fechar_modal" = false;
