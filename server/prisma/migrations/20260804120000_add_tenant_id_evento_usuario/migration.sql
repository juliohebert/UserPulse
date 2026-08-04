-- Fase 2 do widget multi-tenant: fecha a última lacuna de isolamento.
-- EventoUsuario (histórico genérico de evento, escrito por UserPulse.track()
-- e lido por verificarConclusaoGlobal em widget.ts pra encerrar campanha após
-- evento) ainda não tinha tenant_id — dois tenants usando o mesmo nome de
-- "sistema" + mesmo usuario_id + mesmo evento_conclusao podiam encerrar
-- campanha um do outro. Mesmo padrão da fundação SaaS
-- (20260801120000_add_saas_multi_tenant): registros existentes migram pro
-- tenant Quark, preservando 100% do que já existia.
ALTER TABLE "eventos_usuario" ADD COLUMN "tenant_id" TEXT;
UPDATE "eventos_usuario" SET "tenant_id" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "eventos_usuario" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "eventos_usuario" ADD CONSTRAINT "eventos_usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices antigos (sem tenant_id) não servem mais às consultas de
-- dedup/conclusão, que agora sempre filtram por tenant_id primeiro.
DROP INDEX "eventos_usuario_sistema_usuario_id_evento_idx";
DROP INDEX "eventos_usuario_sistema_usuario_id_evento_criado_em_idx";
CREATE INDEX "eventos_usuario_tenant_id_sistema_usuario_id_evento_idx" ON "eventos_usuario"("tenant_id", "sistema", "usuario_id", "evento");
CREATE INDEX "eventos_usuario_tenant_id_sistema_usuario_id_evento_criado_em_idx" ON "eventos_usuario"("tenant_id", "sistema", "usuario_id", "evento", "criado_em");
