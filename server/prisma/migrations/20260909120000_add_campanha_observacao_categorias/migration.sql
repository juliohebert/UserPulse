-- AlterTable
-- NPS: config do campo de observação por categoria da nota (promotor/neutro/
-- detrator). NULL = comportamento atual (campo sempre visível). Sem backfill:
-- toda campanha existente fica NULL e mantém o comportamento de sempre.
ALTER TABLE "campanhas" ADD COLUMN "observacao_categorias" JSONB;
