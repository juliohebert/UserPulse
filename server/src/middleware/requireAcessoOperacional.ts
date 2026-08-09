import { Request, Response, NextFunction } from 'express'
import { motivoBloqueioOperacionalTrial, motivoBloqueioOperacionalInadimplencia } from '../lib/tenantGuards'

// Código estável devolvido no corpo do 403 — o frontend pode usar isto pra
// distinguir "trial venceu" de qualquer outro 403 (RBAC, etc.), embora hoje
// a UI já decida o que mostrar a partir de tenant.situacao_comercial (ver
// AvisoComercial.tsx), sem precisar inspecionar esta resposta.
export const CODIGO_TRIAL_EXPIRADO = 'TRIAL_EXPIRADO'
// Fase 7 — mesmo raciocínio, agora pra assinatura paga com tolerância de
// inadimplência (TOLERANCIA_INADIMPLENCIA_DIAS, ver tenantGuards.ts) já
// expirada.
export const CODIGO_INADIMPLENCIA = 'INADIMPLENCIA'

// Bloqueia USO OPERACIONAL inteiro (leitura incluída, não só escrita) dos
// routers de campanhas/tours/jornadas/catálogo de telas/aparência do
// widget/dashboard quando o trial do tenant já venceu OU (Fase 7) quando a
// licença paga está vencida além da tolerância — mais amplo que
// motivoBloqueioEscrita (que só barra escrita; cobre licença paga vencida
// DENTRO da tolerância, suspenso e cancelado continuam só com bloqueio de
// escrita, sem mudança). Sempre atrás de requireAdminAuth (req.adminUser já
// populado) — wireado a nível de router em index.ts, mesmo padrão de
// requireSuperAdmin (ver CLAUDE.md, "Backend request flow").
//
// SUPER_ADMIN nunca é bloqueado aqui, independente do status do próprio
// tenant — precisa manter acesso irrestrito pra administrar o SaaS (regra
// explícita da tarefa). Nunca desativa/exclui conteúdo existente: os dados
// continuam intactos no banco, só inacessíveis via API enquanto durar o
// bloqueio (trial vencido, ou inadimplência além da tolerância).
export function requireAcessoOperacional(req: Request, res: Response, next: NextFunction): void {
  if (req.adminUser!.role === 'SUPER_ADMIN') {
    next()
    return
  }
  const tenant = req.adminUser!.tenant
  const motivoTrial = motivoBloqueioOperacionalTrial(tenant)
  if (motivoTrial) {
    res.status(403).json({ erro: motivoTrial, codigo: CODIGO_TRIAL_EXPIRADO })
    return
  }
  const motivoInadimplencia = motivoBloqueioOperacionalInadimplencia(tenant)
  if (motivoInadimplencia) {
    res.status(403).json({ erro: motivoInadimplencia, codigo: CODIGO_INADIMPLENCIA })
    return
  }
  next()
}
