-- CreateTable
CREATE TABLE "campanha_destaque_itens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "data_cy" TEXT NOT NULL,
    "texto_badge" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "texto_botao" TEXT,
    "url_botao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanha_destaque_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanha_destaque_itens_campanha_id_ordem_idx" ON "campanha_destaque_itens"("campanha_id", "ordem");

-- CreateIndex
CREATE INDEX "campanha_destaque_itens_tenant_id_idx" ON "campanha_destaque_itens"("tenant_id");

-- AddForeignKey
ALTER TABLE "campanha_destaque_itens" ADD CONSTRAINT "campanha_destaque_itens_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 1 item por campanha "destaque_elemento" já existente, a partir
-- dos campos legados (titulo/descricao/subtitulo/texto_botao/url_botao/
-- data_cy continuam na própria "campanhas" — nunca removidos, servem de
-- fallback de leitura pra quem ainda não tem nenhuma linha aqui). Idempotente
-- via NOT EXISTS: rodar esta migration mais de uma vez (ou contra um banco
-- que já tenha itens) nunca duplica.
INSERT INTO "campanha_destaque_itens" ("id", "tenant_id", "campanha_id", "ordem", "data_cy", "texto_badge", "titulo", "descricao", "texto_botao", "url_botao", "ativo", "criado_em", "atualizado_em")
SELECT
  gen_random_uuid()::text,
  c."tenant_id",
  c."id",
  1,
  c."data_cy",
  c."subtitulo",
  c."titulo",
  c."descricao",
  c."texto_botao",
  c."url_botao",
  c."ativo",
  c."criado_em",
  c."atualizado_em"
FROM "campanhas" c
WHERE c."modo_exibicao" = 'destaque_elemento'
  AND c."data_cy" IS NOT NULL
  AND c."data_cy" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "campanha_destaque_itens" i WHERE i."campanha_id" = c."id"
  );
