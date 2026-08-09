import { Request, Response, NextFunction } from 'express'
import { motivoBloqueioOperacionalTrial } from '../lib/tenantGuards'

// Código estável devolvido no corpo do 403 — o frontend pode usar isto pra
// distinguir "trial venceu" de qualquer outro 403 (RBAC, etc.), embora hoje
// a UI já decida o que mostrar a partir de tenant.situacao_comercial (ver
// AvisoComercial.tsx), sem precisar inspecionar esta resposta.
export const CODIGO_TRIAL_EXPIRADO = 'TRIAL_EXPIRADO'

// Bloqueia USO OPERACIONAL inteiro (leitura incluída, não só escrita) dos
// routers de campanhas/tours/jornadas/catálogo de telas/aparência do
// widget/dashboard quando o trial do tenant já venceu — mais amplo que
// motivoBloqueioEscrita (que só barra escrita, e cobre também licença paga
// vencida/suspenso/cancelado; esses três continuam só com bloqueio de
// escrita, sem mudança). Sempre atrás de requireAdminAuth (req.adminUser já
// populado) — wireado a nível de router em index.ts, mesmo padrão de
// requireSuperAdmin (ver CLAUDE.md, "Backend request flow").
//
// SUPER_ADMIN nunca é bloqueado aqui, independente do status do próprio
// tenant — precisa manter acesso irrestrito pra administrar o SaaS (regra
// explícita da tarefa). Nunca desativa/exclui conteúdo existente: os dados
// continuam intactos no banco, só inacessíveis via API enquanto durar o
// trial vencido.
export function requireAcessoOperacional(req: Request, res: Response, next: NextFunction): void {
  if (req.adminUser!.role === 'SUPER_ADMIN') {
    next()
    return
  }
  const motivo = motivoBloqueioOperacionalTrial(req.adminUser!.tenant)
  if (motivo) {
    res.status(403).json({ erro: motivo, codigo: CODIGO_TRIAL_EXPIRADO })
    return
  }
  next()
}
