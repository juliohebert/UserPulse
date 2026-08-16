-- CreateIndex
-- "Uma resposta atual" por usuário+item+tipo (utilidade_destaque) — Postgres
-- nunca considera dois NULLs iguais num índice único, então esta constraint
-- não afeta feedback nps/csat existente (destaque_item_id sempre NULL ali).
-- registrarUtilidadeDestaque (widget.ts) usa upsert() contra esta chave
-- composta, que o Postgres resolve como INSERT ... ON CONFLICT DO UPDATE
-- atômico (sem race entre 2 envios concorrentes do mesmo usuário/item).
CREATE UNIQUE INDEX "feedbacks_avaliacao_unica_key" ON "feedbacks"("campanha_id", "destaque_item_id", "usuario_id", "tipo_avaliacao");
