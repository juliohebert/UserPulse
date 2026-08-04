-- Fase 2 do widget multi-tenant: a rota pública buscarAparencia (widget.ts)
-- passa a resolver o tenant via Tenant.public_key antes de consultar
-- aparências, então "sistema" não precisa mais ser único globalmente — vira
-- único por tenant, permitindo que dois tenants tenham, cada um, sua própria
-- aparência configurada para o mesmo nome de "sistema".
DROP INDEX "aparencias_widget_sistema_key";
CREATE UNIQUE INDEX "aparencias_widget_tenant_id_sistema_key" ON "aparencias_widget"("tenant_id", "sistema");
