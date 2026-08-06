import { Request, Response, NextFunction } from 'express'

// Sempre atrás de requireAdminAuth (ver index.ts) — reaproveita req.adminUser
// já validado contra o banco. Rotas de administração cross-tenant (gerenciar
// Tenant/Plano) nunca ficam abertas pra ADMIN comum: 403 explícito, nunca um
// 404 que esconderia a existência da rota, já que quem chega aqui já provou
// ter uma sessão válida.
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.adminUser?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ erro: 'Acesso restrito a super administradores.' })
    return
  }
  next()
}
