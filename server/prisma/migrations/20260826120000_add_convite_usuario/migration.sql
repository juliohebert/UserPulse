-- CreateTable
CREATE TABLE "convites_usuario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "convidado_por_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "aceito_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "permissoes_pendentes" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convites_usuario_token_hash_key" ON "convites_usuario"("token_hash");

-- CreateIndex
CREATE INDEX "convites_usuario_tenant_id_idx" ON "convites_usuario"("tenant_id");

-- AddForeignKey
ALTER TABLE "convites_usuario" ADD CONSTRAINT "convites_usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_usuario" ADD CONSTRAINT "convites_usuario_convidado_por_id_fkey" FOREIGN KEY ("convidado_por_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
