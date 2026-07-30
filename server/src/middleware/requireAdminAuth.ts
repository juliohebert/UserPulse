import { Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '../lib/auth'

// Substitui o antigo requireAdminToken (header Authorization: Bearer, opcional
// se ADMIN_TOKEN não definido — ver histórico em index.ts). Login real por
// usuário agora é obrigatório pra qualquer rota admin: sem cookie de sessão
// válido, sem acesso, nunca um "modo dev sem auth nenhuma" silencioso.
//
// Confere o usuário no banco a cada request (não só o token) — assim,
// desativar um AdminUser (ativo=false) derruba o acesso na hora, sem esperar
// o token expirar. Custo de 1 SELECT por request admin, aceitável pro volume
// de um painel interno.
export interface AdminAuthPayload {
  id: string
  nome: string
  email: string
  role: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminAuthPayload
    }
  }
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE] as string | undefined
    if (!token) {
      res.status(401).json({ erro: 'Não autenticado.' })
      return
    }
    const payload = verifySessionToken(token)
    if (!payload) {
      res.status(401).json({ erro: 'Não autenticado.' })
      return
    }
    const usuario = await prisma.adminUser.findUnique({ where: { id: payload.sub } })
    if (!usuario || !usuario.ativo) {
      res.status(401).json({ erro: 'Não autenticado.' })
      return
    }
    req.adminUser = { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role }
    next()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao verificar sessão.' })
  }
}
