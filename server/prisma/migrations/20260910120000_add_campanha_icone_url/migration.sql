-- AlterTable
-- Imagem opcional do ícone do cabeçalho da campanha. NULL = ícone padrão por
-- tipo (comportamento atual). Sem backfill: toda campanha existente fica NULL
-- e continua com o mesmo visual.
ALTER TABLE "campanhas" ADD COLUMN "icone_url" TEXT;
