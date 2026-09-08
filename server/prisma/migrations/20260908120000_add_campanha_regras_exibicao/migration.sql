-- CreateTable
CREATE TABLE "campanha_regras_exibicao" (
    "id" TEXT NOT NULL,
    "campanha_id" TEXT NOT NULL,
    "modo_identificacao" TEXT NOT NULL DEFAULT 'sistema_tela',
    "tela" TEXT,
    "url_contem" TEXT,
    "data_cy" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "campanha_regras_exibicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanha_regras_exibicao_campanha_id_ordem_idx" ON "campanha_regras_exibicao"("campanha_id", "ordem");

-- AddForeignKey
ALTER TABLE "campanha_regras_exibicao" ADD CONSTRAINT "campanha_regras_exibicao_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "campanhas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 1 regra por campanha existente, a partir das colunas legadas.
-- Cada campanha passa a ter ao menos uma regra `ordem = 0` idêntica ao que
-- as colunas Campanha.modo_identificacao/tela/url_contem/data_cy já diziam,
-- para que o novo caminho de elegibilidade (OR sobre `regras`) produza
-- exatamente o mesmo resultado de antes. As colunas legadas continuam
-- preenchidas e são mantidas em sincronia com a regra `ordem = 0`.
INSERT INTO "campanha_regras_exibicao" ("id", "campanha_id", "modo_identificacao", "tela", "url_contem", "data_cy", "ordem")
SELECT
    gen_random_uuid()::text,
    "id",
    COALESCE(NULLIF("modo_identificacao", ''), 'sistema_tela'),
    CASE WHEN COALESCE(NULLIF("modo_identificacao", ''), 'sistema_tela') = 'sistema_tela' THEN "tela" ELSE NULL END,
    CASE WHEN "modo_identificacao" = 'url_contem' THEN "url_contem" ELSE NULL END,
    CASE WHEN "modo_identificacao" = 'data_cy' THEN "data_cy" ELSE NULL END,
    0
FROM "campanhas";
