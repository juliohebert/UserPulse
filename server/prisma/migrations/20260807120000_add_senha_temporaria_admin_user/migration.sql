-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "senha_temporaria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senha_alterada_em" TIMESTAMP(3),
ADD COLUMN     "ultimo_login_em" TIMESTAMP(3);
