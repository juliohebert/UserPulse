// Cria (ou confirma) o admin inicial a partir de variáveis de ambiente — ver
// server/.env.example. Separado de prisma/seed.ts (dados de demonstração)
// de propósito: este script mexe em credencial de acesso, então só roda
// quando alguém chama explicitamente `npm run db:seed:admin`, nunca
// encadeado no seed geral. Idempotente: se ADMIN_EMAIL já existir, só
// confirma (nunca sobrescreve nome/senha de um admin já criado).
//
// Desde a fundação SaaS multi-tenant, todo AdminUser precisa de um tenant.
// ADMIN_TENANT_SLUG (default "quark") resolve o tenant: se já existir (ex.:
// o tenant Quark criado pela migration), reaproveita sem alterar seu
// status/plano; se não existir, cria um novo tenant em TRIAL de 14 dias —
// esse é o caminho de "teste grátis" pra um cliente novo (ex.:
// ADMIN_TENANT_SLUG=acme ADMIN_TENANT_NOME="Acme Ltda" ADMIN_EMAIL=...).
import { AdminRole, PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SALT_ROUNDS = 10
const DIAS_TRIAL_PADRAO = 14

const ROLES_VALIDAS = new Set<AdminRole>(['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'])

function resolverRole(): AdminRole {
  const bruta = process.env.ADMIN_ROLE?.trim().toUpperCase()
  if (!bruta) return 'ADMIN'
  if (ROLES_VALIDAS.has(bruta as AdminRole)) return bruta as AdminRole
  console.log(`ADMIN_ROLE="${bruta}" inválido — usando "ADMIN". Valores aceitos: ${[...ROLES_VALIDAS].join(', ')}.`)
  return 'ADMIN'
}

async function resolverTenant() {
  const slug = process.env.ADMIN_TENANT_SLUG?.trim().toLowerCase() || 'quark'
  const nome = process.env.ADMIN_TENANT_NOME?.trim() || 'Quark'

  const existente = await prisma.tenant.findUnique({ where: { slug } })
  if (existente) {
    console.log(`✓ Tenant já existe: ${existente.nome} (${existente.slug}, código ${existente.codigo}) — status ${existente.status}, nada foi alterado.`)
    return existente
  }

  const agora = new Date()
  const trialFim = new Date(agora.getTime() + DIAS_TRIAL_PADRAO * 24 * 60 * 60 * 1000)
  // codigo nunca é definido aqui — vem do @default(autoincrement()) do banco
  // (ver schema.prisma), garantindo sequência sem risco de colisão.
  const criado = await prisma.tenant.create({
    data: { nome, slug, status: 'TRIAL', trial_inicio: agora, trial_fim: trialFim },
  })
  console.log(`✓ Tenant criado: ${criado.nome} (${criado.slug}, código ${criado.codigo}) — TRIAL até ${trialFim.toISOString().slice(0, 10)}.`)
  return criado
}

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
    console.log(`✓ Admin já existe: ${existente.email} — nada foi alterado (senha/nome/tenant/role não são atualizados por este script).`)
    return
  }

  const tenant = await resolverTenant()
  const role = resolverRole()

  const password_hash = await bcrypt.hash(senha, SALT_ROUNDS)
  const criado = await prisma.adminUser.create({
    data: { nome, email, password_hash, role, tenant_id: tenant.id, ativo: true },
  })
  console.log(`✓ Admin criado: ${criado.email} (${criado.nome}) — tenant "${tenant.nome}", role ${criado.role}.`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
