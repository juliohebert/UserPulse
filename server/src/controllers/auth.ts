import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { ADMIN_SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions, signSessionToken } from '../lib/auth'

// Nunca devolve password_hash — nem aqui, nem em /me. Sempre a mesma forma
// reduzida do usuário em qualquer resposta de sucesso (login/me).
function usuarioPublico(u: { id: string; nome: string; email: string; role: string; ativo: boolean; criado_em: Date; atualizado_em: Date }) {
  return { id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo, criado_em: u.criado_em, atualizado_em: u.atualizado_em }
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

    const usuario = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } })
    // Mesma mensagem genérica pra "usuário não existe", "inativo" e "senha
    // errada" — nunca revelar qual dessas três é o motivo real (evita um
    // atacante descobrir e-mails válidos por tentativa e erro).
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
export async function me(req: Request, res: Response) {
  res.json(req.adminUser)
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(ADMIN_SESSION_COOKIE, sessionCookieOptions())
  res.status(204).send()
}
