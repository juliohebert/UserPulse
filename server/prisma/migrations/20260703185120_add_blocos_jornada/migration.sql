-- CreateTable
CREATE TABLE "blocos_jornada" (
    "id" TEXT NOT NULL,
    "jornada_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocos_jornada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocos_jornada_jornada_id_idx" ON "blocos_jornada"("jornada_id");

-- AddForeignKey
ALTER TABLE "blocos_jornada" ADD CONSTRAINT "blocos_jornada_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: bloco_id começa opcional em etapas_jornada porque a tabela já
-- tem linhas (backfill acontece antes de tornar a coluna obrigatória, abaixo).
ALTER TABLE "etapas_jornada" ADD COLUMN "bloco_id" TEXT;

-- AlterTable: bloco_id em eventos_jornada é sempre opcional (null nos eventos
-- de nível jornada), não precisa de backfill.
ALTER TABLE "eventos_jornada" ADD COLUMN "bloco_id" TEXT;

-- Migração de dados: cria um bloco padrão (Pacote) para cada Jornada já
-- existente, reaproveitando o título da jornada como título do bloco — não
-- perde nenhuma jornada/etapa já cadastrada localmente.
INSERT INTO "blocos_jornada" ("id", "jornada_id", "titulo", "ordem", "obrigatorio", "ativo", "criado_em", "atualizado_em")
SELECT gen_random_uuid()::text, "id", "titulo", 0, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "jornadas";

-- Migração de dados: associa cada etapa existente ao bloco padrão da sua
-- jornada original (via jornada_id, ainda presente nesta etapa da migration).
UPDATE "etapas_jornada" e
SET "bloco_id" = b."id"
FROM "blocos_jornada" b
WHERE b."jornada_id" = e."jornada_id";

-- AlterTable: agora que todo bloco_id foi preenchido, a coluna vira obrigatória.
ALTER TABLE "etapas_jornada" ALTER COLUMN "bloco_id" SET NOT NULL;

-- DropForeignKey: remove o vínculo antigo direto de etapa com jornada.
ALTER TABLE "etapas_jornada" DROP CONSTRAINT "etapas_jornada_jornada_id_fkey";

-- DropIndex
DROP INDEX "etapas_jornada_jornada_id_idx";

-- AlterTable: etapa não referencia mais jornada diretamente, só pelo bloco.
ALTER TABLE "etapas_jornada" DROP COLUMN "jornada_id";

-- CreateIndex
CREATE INDEX "etapas_jornada_bloco_id_idx" ON "etapas_jornada"("bloco_id");

-- AddForeignKey
ALTER TABLE "etapas_jornada" ADD CONSTRAINT "etapas_jornada_bloco_id_fkey" FOREIGN KEY ("bloco_id") REFERENCES "blocos_jornada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_jornada" ADD CONSTRAINT "eventos_jornada_bloco_id_fkey" FOREIGN KEY ("bloco_id") REFERENCES "blocos_jornada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
