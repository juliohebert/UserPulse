-- CreateEnum
CREATE TYPE "CampanhaStatus" AS ENUM ('RASCUNHO', 'ATIVA', 'INATIVA');

-- AlterTable
-- DEFAULT 'RASCUNHO' só vale pra INSERT novo sem status explícito — toda
-- linha já existente é corrigida logo abaixo a partir de "ativo" (fonte de
-- verdade antiga), nunca fica com o default da coluna.
ALTER TABLE "campanhas" ADD COLUMN "status" "CampanhaStatus" NOT NULL DEFAULT 'RASCUNHO';

-- Backfill — Fase 1 dos 3 status: ativo=true vira ATIVA, ativo=false vira
-- INATIVA. Nenhuma campanha existente pode nascer RASCUNHO por esta
-- migration (RASCUNHO só passa a existir de verdade a partir daqui, pra
-- campanha nova/duplicada — ver criar()/duplicar() em controllers/campanhas.ts).
UPDATE "campanhas" SET "status" = CASE WHEN "ativo" THEN 'ATIVA' ELSE 'INATIVA' END::"CampanhaStatus";
