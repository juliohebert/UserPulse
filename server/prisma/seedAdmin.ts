// Cria (ou confirma) o admin inicial a partir de variáveis de ambiente — ver
// server/.env.example. Separado de prisma/seed.ts (dados de demonstração)
// de propósito: este script mexe em credencial de acesso, então só roda
// quando alguém chama explicitamente `npm run db:seed:admin`, nunca
// encadeado no seed geral. Idempotente: se ADMIN_EMAIL já existir, só
// confirma (nunca sobrescreve nome/senha de um admin já criado).
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SALT_ROUNDS = 10

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const senha = process.env.ADMIN_PASSWORD
  const nome = process.env.ADMIN_NAME?.trim() || 'Administrador'

  if (!email || !senha) {
    console.log(
      'ADMIN_EMAIL/ADMIN_PASSWORD não definidos — nenhum admin criado. ' +
      'Defina os dois no .env (ver .env.example) e rode `npm run db:seed:admin` de novo.'
    )
    return
  }
  if (senha.length < 8) {
    console.error('ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.')
    process.exitCode = 1
    return
  }

  const existente = await prisma.adminUser.findUnique({ where: { email } })
  if (existente) {
    console.log(`✓ Admin já existe: ${existente.email} — nada foi alterado (senha/nome não são atualizados por este script).`)
    return
  }

  const password_hash = await bcrypt.hash(senha, SALT_ROUNDS)
  const criado = await prisma.adminUser.create({
    data: { nome, email, password_hash, role: 'admin', ativo: true },
  })
  console.log(`✓ Admin criado: ${criado.email} (${criado.nome})`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
