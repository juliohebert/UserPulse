import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { AdminRole, Prisma, TenantStatus } from '@prisma/client'
import prisma from '../lib/prisma'
import { checarLimiteUsuariosAdmin, planoEfetivoParaLimite } from '../lib/tenantGuards'

// Mesmo custo de hash usado em prisma/seedAdmin.ts — sem lib compartilhada de
// bcrypt no projeto ainda, duplicar essa constante é o padrão já existente.
const SALT_ROUNDS = 10

const STATUS_VALIDOS = new Set<TenantStatus>(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED'])

// Papéis que o Super Admin pode atribuir a um usuário DO CLIENTE — SUPER_ADMIN
// nunca é aceito por essas rotas (criar/editar acesso), mesmo que alguém
// force o valor no body: só existe fora desse fluxo (seedAdmin.ts/login).
// Exportada — controllers/usuarios.ts (fluxo self-service) reusa a mesma
// constante, nunca uma segunda declaração divergente.
export const ROLES_ACESSO_CLIENTE = new Set<AdminRole>(['ADMIN', 'EDITOR', 'VIEWER'])

interface TenantBody {
  nome?: string
  slug?: string
  plano_id?: string | null
  status?: string
  trial_inicio?: string | null
  trial_fim?: string | null
  licenca_inicio?: string | null
  licenca_fim?: string | null
  proxima_cobranca?: string | null
  ultimo_pagamento_em?: string | null
  observacao_comercial?: string | null
  // Só lidos por criar() (ver validarAdminInicial) — atualizar() nunca toca
  // neles, mesmo que venham no body.
  admin_nome?: string
  admin_email?: string
  admin_password?: string
}

interface TenantCampos {
  nome: string
  slug: string
  plano_id: string | null
  status: TenantStatus
  trial_inicio: Date | null
  trial_fim: Date | null
  licenca_inicio: Date | null
  licenca_fim: Date | null
  proxima_cobranca: Date | null
  ultimo_pagamento_em: Date | null
  observacao_comercial: string | null
}

const parseData = (valor: string | null | undefined): { ok: true; data: Date | null } | { ok: false } => {
  if (!valor) return { ok: true, data: null }
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return { ok: false }
  return { ok: true, data: d }
}

// Nunca lê codigo/id/public_key do body — mesmo que o cliente envie esses
// campos, eles não entram no retorno desta função, então nunca alcançam o
// `data` de um create/update do Prisma (codigo/public_key só existem via
// @default do schema).
function validarCamposTenant(body: TenantBody): { ok: true; data: TenantCampos } | { ok: false; erro: string } {
  const nome = body.nome?.trim()
  const slug = body.slug?.trim().toLowerCase()
  if (!nome || !slug) return { ok: false, erro: 'nome e slug são obrigatórios.' }

  const status = (body.status?.trim().toUpperCase() || 'TRIAL') as TenantStatus
  if (!STATUS_VALIDOS.has(status)) {
    return { ok: false, erro: `status inválido. Valores aceitos: ${[...STATUS_VALIDOS].join(', ')}.` }
  }

  const planoId = body.plano_id?.trim() || null

  const trialInicio = parseData(body.trial_inicio)
  if (!trialInicio.ok) return { ok: false, erro: 'trial_inicio inválido.' }
  const trialFim = parseData(body.trial_fim)
  if (!trialFim.ok) return { ok: false, erro: 'trial_fim inválido.' }

  // Controle de licença paga (ver comentário no schema.prisma) — datas
  // ajustadas manualmente pelo super admin, sem cobrança automática nenhuma.
  const licencaInicio = parseData(body.licenca_inicio)
  if (!licencaInicio.ok) return { ok: false, erro: 'licenca_inicio inválido.' }
  const licencaFim = parseData(body.licenca_fim)
  if (!licencaFim.ok) return { ok: false, erro: 'licenca_fim inválido.' }
  const proximaCobranca = parseData(body.proxima_cobranca)
  if (!proximaCobranca.ok) return { ok: false, erro: 'proxima_cobranca inválido.' }
  const ultimoPagamento = parseData(body.ultimo_pagamento_em)
  if (!ultimoPagamento.ok) return { ok: false, erro: 'ultimo_pagamento_em inválido.' }

  return {
    ok: true,
    data: {
      nome,
      slug,
      plano_id: planoId,
      status,
      trial_inicio: trialInicio.data,
      trial_fim: trialFim.data,
      licenca_inicio: licencaInicio.data,
      licenca_fim: licencaFim.data,
      proxima_cobranca: proximaCobranca.data,
      ultimo_pagamento_em: ultimoPagamento.data,
      observacao_comercial: body.observacao_comercial?.trim() || null,
    },
  }
}

// Admin inicial é opcional no POST /admin/tenants — usado pelo fluxo
// comercial de "vender e já liberar acesso" (ver Tenants.tsx, seção
// "Administrador do cliente" no modal de criação). Se nada vier preenchido,
// o cliente é criado sem admin (fluxo antigo, ainda válido — criarAdmin()
// abaixo continua disponível pra criar depois).
async function validarAdminInicial(body: TenantBody): Promise<
  | { ok: true; data: null }
  | { ok: true; data: { nome: string; email: string; password_hash: string } }
  | { ok: false; erro: string }
> {
  const { admin_nome, admin_email, admin_password } = body
  const algumPreenchido = admin_nome?.trim() || admin_email?.trim() || admin_password
  if (!algumPreenchido) return { ok: true, data: null }

  if (!admin_nome?.trim() || !admin_email?.trim() || !admin_password) {
    return { ok: false, erro: 'admin_nome, admin_email e admin_password são obrigatórios juntos.' }
  }
  if (admin_password.length < 8) {
    return { ok: false, erro: 'admin_password precisa ter pelo menos 8 caracteres.' }
  }

  const password_hash = await bcrypt.hash(admin_password, SALT_ROUNDS)
  return { ok: true, data: { nome: admin_nome.trim(), email: admin_email.trim().toLowerCase(), password_hash } }
}

// Recorte devolvido pro admin de usuários já criados num tenant — nunca
// password_hash. permissoes_personalizadas (Fase 3 de permissões
// personalizadas) entra aqui pra listarAdmins alimentar o indicador
// "PERSONALIZADO" na tela de Acessos (ver Tenants.tsx) sem precisar de uma
// chamada extra por usuário.
const SELECAO_ADMIN = { id: true, nome: true, email: true, role: true, ativo: true, permissoes_personalizadas: true, criado_em: true, atualizado_em: true } as const

export async function listar(req: Request, res: Response) {
  try {
    const busca = (req.query.busca as string | undefined)?.trim()
    const status = (req.query.status as string | undefined)?.trim().toUpperCase()

    const where: Prisma.TenantWhereInput = {}
    if (status && STATUS_VALIDOS.has(status as TenantStatus)) where.status = status as TenantStatus
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { slug: { contains: busca, mode: 'insensitive' } },
      ]
    }

    const tenants = await prisma.tenant.findMany({
      where,
      include: { plano: true, _count: { select: { admins: true } } },
      orderBy: { criado_em: 'desc' },
    })
    res.json(tenants)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar tenants.' })
  }
}

export async function obter(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        plano: true,
        admins: { select: SELECAO_ADMIN, orderBy: { criado_em: 'asc' } },
      },
    })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }
    res.json(tenant)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao buscar tenant.' })
  }
}

// Cria o tenant e, se dados de admin vierem no body, o primeiro AdminUser
// dele na mesma transaction — fluxo comercial de "vender e já liberar
// acesso" numa única chamada (ver Tenants.tsx). Se a criação do admin falhar
// (ex.: e-mail duplicado), a transaction inteira reverte: nunca fica tenant
// órfão sem admin por causa de um erro nessa segunda etapa.
export async function criar(req: Request, res: Response) {
  try {
    const validado = validarCamposTenant(req.body as TenantBody)
    if (!validado.ok) { res.status(400).json({ erro: validado.erro }); return }

    if (validado.data.plano_id) {
      const plano = await prisma.plano.findUnique({ where: { id: validado.data.plano_id } })
      if (!plano) { res.status(400).json({ erro: 'Plano informado não existe.' }); return }
    }

    const adminValidado = await validarAdminInicial(req.body as TenantBody)
    if (!adminValidado.ok) { res.status(400).json({ erro: adminValidado.erro }); return }

    const criado = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({ data: validado.data })
      if (adminValidado.data) {
        await tx.adminUser.create({
          data: {
            nome: adminValidado.data.nome,
            email: adminValidado.data.email,
            password_hash: adminValidado.data.password_hash,
            role: 'ADMIN',
            tenant_id: tenant.id,
            ativo: true,
            // Senha definida pelo super admin, não pelo próprio usuário —
            // troca obrigatória no primeiro login (ver POST /auth/trocar-senha).
            senha_temporaria: true,
          },
        })
      }
      return tx.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
        include: { plano: true, _count: { select: { admins: true } } },
      })
    })
    res.status(201).json(criado)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]) : []
      if (target.includes('email')) {
        res.status(400).json({ erro: 'E-mail do administrador já cadastrado.' })
        return
      }
      res.status(400).json({ erro: 'Slug já em uso.' })
      return
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar tenant.' })
  }
}

export async function atualizar(req: Request, res: Response) {
  try {
    const id = req.params.id as string
    const validado = validarCamposTenant(req.body as TenantBody)
    if (!validado.ok) { res.status(400).json({ erro: validado.erro }); return }

    const existente = await prisma.tenant.findUnique({ where: { id } })
    if (!existente) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    if (validado.data.plano_id) {
      const plano = await prisma.plano.findUnique({ where: { id: validado.data.plano_id } })
      if (!plano) { res.status(400).json({ erro: 'Plano informado não existe.' }); return }
    }

    const atualizado = await prisma.tenant.update({
      where: { id },
      data: validado.data,
      include: { plano: true, _count: { select: { admins: true } } },
    })
    res.json(atualizado)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ erro: 'Slug já em uso.' })
      return
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar tenant.' })
  }
}

// ─── Gestão de acessos (usuários ADMIN/EDITOR/VIEWER de um cliente) ────────
// Painel Gestão SaaS é exclusivo do SUPER_ADMIN interno — estas rotas
// gerenciam os usuários DO CLIENTE (nunca o próprio super admin, nunca
// promovem alguém a SUPER_ADMIN). Sem checagem de motivoBloqueioEscrita/
// motivoBloqueioAtivacao de propósito: são ações administrativas do super
// admin sobre o cliente, sempre permitidas independente do status do
// tenant — suspender um tenant bloqueia o CLIENTE de escrever no próprio
// painel, não o super admin de geri-lo.

export async function listarAdmins(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const admins = await prisma.adminUser.findMany({
      where: { tenant_id: tenantId },
      select: SELECAO_ADMIN,
      orderBy: { criado_em: 'asc' },
    })
    res.json(admins)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao listar acessos do tenant.' })
  }
}

// Cria um novo acesso pro cliente — role escolhida pelo super admin (ADMIN,
// EDITOR ou VIEWER); substitui o antigo criar-admin (que só criava ADMIN).
export async function criarAcesso(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    // plano_downgrade entra no include (Fase 8B) só pra planoEfetivoParaLimite
    // decidir a capacidade EFETIVA de admins — mesmo raciocínio do include
    // ampliado em requireAdminAuth.ts, mas aqui local: esta rota (Gestão
    // SaaS, criação de acesso por SUPER_ADMIN num tenant arbitrário) nunca
    // passa por req.adminUser.tenant.
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plano: true, plano_downgrade: true } })
    if (!tenant) { res.status(404).json({ erro: 'Tenant não encontrado.' }); return }

    const { nome, email, senha, role } = req.body as { nome?: string; email?: string; senha?: string; role?: string }
    if (!nome?.trim() || !email?.trim() || !senha) {
      res.status(400).json({ erro: 'nome, email e senha são obrigatórios.' })
      return
    }
    if (senha.length < 8) {
      res.status(400).json({ erro: 'senha precisa ter pelo menos 8 caracteres.' })
      return
    }
    const roleNormalizada = (role?.trim().toUpperCase() || '') as AdminRole
    if (!ROLES_ACESSO_CLIENTE.has(roleNormalizada)) {
      res.status(400).json({ erro: `role inválida. Valores aceitos: ${[...ROLES_ACESSO_CLIENTE].join(', ')}.` })
      return
    }

    const limiteErro = await checarLimiteUsuariosAdmin(tenantId, planoEfetivoParaLimite(tenant))
    if (limiteErro) { res.status(400).json({ erro: limiteErro }); return }

    const password_hash = await bcrypt.hash(senha, SALT_ROUNDS)
    const criado = await prisma.adminUser.create({
      data: {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        password_hash,
        role: roleNormalizada,
        tenant_id: tenantId,
        ativo: true,
        // Senha definida pelo super admin, não pelo próprio usuário —
        // troca obrigatória no primeiro login (ver POST /auth/trocar-senha).
        senha_temporaria: true,
      },
      select: SELECAO_ADMIN,
    })
    res.status(201).json(criado)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ erro: 'E-mail já cadastrado.' })
      return
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro ao criar acesso.' })
  }
}

// Edita nome/role/ativo de um acesso já existente — nunca email nem
// tenant_id (não fazem parte do body lido/aceito aqui).
export async function atualizarAcesso(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    const adminId = req.params.adminId as string
    // findFirst com os dois filtros juntos — nunca revela se o adminId existe
    // em OUTRO tenant, sempre um 404 genérico de "não encontrado".
    const existente = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId } })
    if (!existente) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }

    const { nome, role, ativo } = req.body as { nome?: string; role?: string; ativo?: boolean }
    if (!nome?.trim()) { res.status(400).json({ erro: 'nome é obrigatório.' }); return }
    const roleNormalizada = (role?.trim().toUpperCase() || '') as AdminRole
    if (!ROLES_ACESSO_CLIENTE.has(roleNormalizada)) {
      res.status(400).json({ erro: `role inválida. Valores aceitos: ${[...ROLES_ACESSO_CLIENTE].join(', ')}.` })
      return
    }

    const atualizado = await prisma.adminUser.update({
      where: { id: adminId },
      data: { nome: nome.trim(), role: roleNormalizada, ativo: Boolean(ativo) },
      select: SELECAO_ADMIN,
    })
    res.json(atualizado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao atualizar acesso.' })
  }
}

// Dados de update do reset administrativo de senha — extraído só pra poder
// testar a invariante sem Prisma (ver adminTenants.test.ts): senha_temporaria
// sempre volta a true e senha_alterada_em SEMPRE é atualizada junto com o
// hash novo (correção de segurança pós-revisão — antes este campo não
// mudava aqui, deixando sessões JWT antigas do usuário resetado válidas
// mesmo depois do reset, ver comentário em requireAdminAuth.ts).
export function montarDadosResetSenhaAdministrativo(
  passwordHash: string,
  agora: Date = new Date()
): { password_hash: string; senha_temporaria: true; senha_alterada_em: Date } {
  return { password_hash: passwordHash, senha_temporaria: true, senha_alterada_em: agora }
}

// Senha temporária definida pelo super admin — nunca envia e-mail (fora de
// escopo), o aviso de "repassar manualmente" é só texto fixo no frontend.
export async function resetarSenha(req: Request, res: Response) {
  try {
    const tenantId = req.params.id as string
    const adminId = req.params.adminId as string
    const existente = await prisma.adminUser.findFirst({ where: { id: adminId, tenant_id: tenantId } })
    if (!existente) { res.status(404).json({ erro: 'Acesso não encontrado.' }); return }

    const { nova_senha } = req.body as { nova_senha?: string }
    if (!nova_senha || nova_senha.length < 8) {
      res.status(400).json({ erro: 'nova_senha precisa ter pelo menos 8 caracteres.' })
      return
    }

    const password_hash = await bcrypt.hash(nova_senha, SALT_ROUNDS)
    // Não exige senha forte pra nova_senha (só 8 caracteres) de propósito —
    // é temporária, o próprio usuário troca de novo no primeiro login e SÓ
    // ENTÃO passa pela regra forte (ver motivoSenhaFraca em auth.ts).
    const atualizado = await prisma.adminUser.update({
      where: { id: adminId },
      data: montarDadosResetSenhaAdministrativo(password_hash),
      select: SELECAO_ADMIN,
    })
    res.json(atualizado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao redefinir senha.' })
  }
}
