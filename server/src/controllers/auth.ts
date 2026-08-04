import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { AdminRole, Plano, Tenant } from '@prisma/client'
import prisma from '../lib/prisma'
import { ADMIN_SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions, signSessionToken } from '../lib/auth'

// Recorte público do tenant devolvido em login/me — plano/status é o mínimo
// que o frontend precisa pra mostrar "conta em teste/expirada/suspensa" (ver
// Topbar.tsx) sem expor nada de billing ainda (sem checkout nesta fase).
function tenantPublico(t: Tenant & { plano: Plano | null }) {
  return {
    id: t.id,
    codigo: t.codigo,
    nome: t.nome,
    slug: t.slug,
    // public_key é o identificador PÚBLICO do tenant (Fase 2 do widget
    // multi-tenant) — mostrado no painel (tela de Integração) pro admin
    // colar no window.UserPulse.init(). Não é segredo (nunca autentica
    // nada sozinho, só resolve qual tenant o widget está falando), então
    // expor em /auth/me é seguro; tenant_id (UUID técnico) nunca é exposto.
    public_key: t.public_key,
    status: t.status,
    trial_fim: t.trial_fim,
    plano: t.plano && {
      id: t.plano.id,
      nome: t.plano.nome,
      slug: t.plano.slug,
      permite_tours: t.plano.permite_tours,
      permite_jornadas: t.plano.permite_jornadas,
      permite_white_label: t.plano.permite_white_label,
      limite_campanhas_ativas: t.plano.limite_campanhas_ativas,
      limite_tours_ativos: t.plano.limite_tours_ativos,
      limite_eventos_mes: t.plano.limite_eventos_mes,
      limite_usuarios_admin: t.plano.limite_usuarios_admin,
    },
  }
}

// Nunca devolve password_hash — nem aqui, nem em /me. Sempre a mesma forma
// reduzida do usuário em qualquer resposta de sucesso (login/me) — exportada
// pra me() (abaixo) reaproveitar em cima de req.adminUser, sem duplicar o
// formato do tenant/plano devolvido.
export function usuarioPublico(u: {
  id: string
  nome: string
  email: string
  role: AdminRole
  ativo: boolean
  criado_em: Date
  atualizado_em: Date
  tenant: Tenant & { plano: Plano | null }
}) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    criado_em: u.criado_em,
    atualizado_em: u.atualizado_em,
    tenant: tenantPublico(u.tenant),
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string }
    if (!email?.trim() || !senha) {
      // Mensagem genérica mesmo aqui (campo ausente) — não dar pista nenhuma
      // sobre o que especificamente está errado na tentativa de login.
      res.status(400).json({ erro: 'E-mail ou senha inválidos.' })
      return
    }

    const usuario = await prisma.adminUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { tenant: { include: { plano: true } } },
    })
    // Mesma mensagem genérica pra "usuário não existe", "inativo" e "senha
    // errada" — nunca revelar qual dessas três é o motivo real (evita um
    // atacante descobrir e-mails válidos por tentativa e erro). Conta
    // suspensa/cancelada/expirada ainda pode logar (ver contexto da tarefa
    // SaaS: login sempre permitido, só a escrita é bloqueada) — não checado aqui.
    if (!usuario || !usuario.ativo) {
      res.status(401).json({ erro: 'E-mail ou senha inválidos.' })
      return
    }
    const senhaOk = await bcrypt.compare(senha, usuario.password_hash)
    if (!senhaOk) {
      res.status(401).json({ erro: 'E-mail ou senha inválidos.' })
      return
    }

    const token = signSessionToken({ sub: usuario.id, email: usuario.email, role: usuario.role })
    res.cookie(ADMIN_SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE })
    res.json(usuarioPublico(usuario))
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao efetuar login.' })
  }
}

// Sempre atrás de requireAdminAuth (ver routes/auth.ts) — se chegou aqui,
// req.adminUser já foi validado contra o banco (usuário existe e está ativo).
// Mesmo formato de login (usuarioPublico) — front não precisa tratar /me e
// /login como respostas diferentes.
export async function me(req: Request, res: Response) {
  res.json(usuarioPublico(req.adminUser!))
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(ADMIN_SESSION_COOKIE, sessionCookieOptions())
  res.status(204).send()
}
