import { Request, Response, NextFunction } from 'express'
import { AdminRole } from '@prisma/client'
import prisma from '../lib/prisma'
import { ADMIN_SESSION_COOKIE, sessaoInvalidadaPorTrocaSenha, verifySessionToken } from '../lib/auth'
import type { TenantComPlano } from '../lib/tenantGuards'
import type { PermissaoModuloLinha } from '../lib/permissoesModulo'

// Substitui o antigo requireAdminToken (header Authorization: Bearer, opcional
// se ADMIN_TOKEN não definido — ver histórico em index.ts). Login real por
// usuário agora é obrigatório pra qualquer rota admin: sem cookie de sessão
// válido, sem acesso, nunca um "modo dev sem auth nenhuma" silencioso.
//
// Confere o usuário no banco a cada request (não só o token) — assim,
// desativar um AdminUser (ativo=false) derruba o acesso na hora, sem esperar
// o token expirar. Custo de 1 SELECT (com join do tenant+plano) por request
// admin, aceitável pro volume de um painel interno/poucos tenants.
//
// tenant_id fica exposto tanto solto (req.adminUser.tenant_id, atalho pros
// controllers filtrarem queries) quanto dentro de tenant (req.adminUser.tenant,
// com status/plano — usado pelas checagens de bloqueio em lib/tenantGuards.ts
// e devolvido em /auth/me pro frontend). SUPER_ADMIN não ganha bypass de
// tenant nesta fase (ver comentário no schema.prisma) — fica só o valor no
// enum, pronto pra uma Fase 2 de rotas globais.
export interface AdminAuthPayload {
  id: string
  nome: string
  email: string
  role: AdminRole
  ativo: boolean
  senha_temporaria: boolean
  criado_em: Date
  atualizado_em: Date
  tenant_id: string
  tenant: TenantComPlano
  // Fase 1 de permissões personalizadas (ver lib/permissoesModulo.ts) — as
  // linhas de AdminUserPermissao já vêm no mesmo SELECT abaixo, nunca uma
  // query separada por guard/módulo (requireAcessoModulo e
  // requireEscritaTenant.ts só leem daqui, nunca tocam Prisma).
  permissoes_personalizadas: boolean
  permissoes: PermissaoModuloLinha[]
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
    const usuario = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      // plano_downgrade (Fase 8B) entra no mesmo SELECT — custo marginal de
      // 1 join a mais, evita uma consulta extra em cada call site que
      // precisa da capacidade EFETIVA durante um downgrade agendado (ver
      // planoEfetivoParaLimite em lib/tenantGuards.ts). permissoes (Fase 1
      // de permissões personalizadas) entra pelo mesmo motivo: mais um join
      // marginal aqui, em vez de uma query própria em cada
      // requireAcessoModulo/requireEscritaConteudo/etc. — sempre um SELECT
      // só por request admin, sempre trazido mesmo com
      // permissoes_personalizadas=false (nesse caso vem vazio/ignorado).
      include: { tenant: { include: { plano: true, plano_downgrade: true } }, permissoes: true },
    })
    if (!usuario || !usuario.ativo) {
      res.status(401).json({ erro: 'Não autenticado.' })
      return
    }
    // "Esqueci minha senha"/troca de senha — invalida sessões (JWT
    // stateless, sem tabela própria) emitidas antes da última troca. Tanto
    // trocarSenha (fluxo autenticado) quanto redefinirSenha (fluxo público
    // via token) atualizam senha_alterada_em; trocarSenha também reemite um
    // cookie novo pra própria sessão continuar funcionando sem precisar
    // logar de novo, então só sessões DE OUTROS lugares (outro navegador,
    // aparelho, ou um invasor com uma sessão antiga) caem aqui.
    if (sessaoInvalidadaPorTrocaSenha(payload.iat, usuario.senha_alterada_em)) {
      res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' })
      return
    }
    req.adminUser = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      ativo: usuario.ativo,
      senha_temporaria: usuario.senha_temporaria,
      criado_em: usuario.criado_em,
      atualizado_em: usuario.atualizado_em,
      tenant_id: usuario.tenant_id,
      tenant: usuario.tenant,
      permissoes_personalizadas: usuario.permissoes_personalizadas,
      permissoes: usuario.permissoes,
    }
    next()
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Erro ao verificar sessão.' })
  }
}
