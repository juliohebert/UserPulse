-- CreateEnum
CREATE TYPE "ModuloPainel" AS ENUM ('CAMPANHAS', 'TOURS', 'JORNADAS', 'CONFIGURACOES');

-- CreateEnum
CREATE TYPE "NivelAcessoModulo" AS ENUM ('NENHUM', 'VISUALIZAR', 'GERENCIAR');

-- AlterTable
-- DEFAULT false preserva 100% do comportamento atual pra todo AdminUser já
-- existente: autorização continua vindo só da role até que alguém ligue a
-- flag explicitamente pra um usuário (ver lib/permissoesModulo.ts).
ALTER TABLE "admin_users" ADD COLUMN "permissoes_personalizadas" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_user_permissoes" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "modulo" "ModuloPainel" NOT NULL,
    "nivel" "NivelAcessoModulo" NOT NULL DEFAULT 'NENHUM',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_user_permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_permissoes_admin_user_id_modulo_key" ON "admin_user_permissoes"("admin_user_id", "modulo");

-- AddForeignKey
ALTER TABLE "admin_user_permissoes" ADD CONSTRAINT "admin_user_permissoes_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
