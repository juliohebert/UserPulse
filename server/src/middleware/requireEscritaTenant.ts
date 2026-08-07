import { Request, Response, NextFunction } from 'express'
import { AdminRole } from '@prisma/client'

// RBAC real dos usuários DE UM CLIENTE (ADMIN/EDITOR/VIEWER) sobre os
// próprios recursos do tenant — não confundir com requireSuperAdmin.ts
// (esse é sobre rotas cross-tenant de Gestão SaaS). Sempre atrás de
// requireAdminAuth (req.adminUser já populado). SUPER_ADMIN entra nos dois
// conjuntos: dentro do próprio tenant (Quark) se comporta como ADMIN, sem
// bypass nem perda de acesso (ver comentário em schema.prisma).
//
// "Conteúdo" = criar/editar/ativar/inativar/duplicar campanhas/tours/
// jornadas — ADMIN e EDITOR escrevem, VIEWER só lê. Note que
// DELETE /campanhas/:id NÃO entra na exclusão abaixo: o controller
// (campanhas.ts, remover()) só marca ativo:false — é a mesma ação de
// "inativar" do PUT, só que exposta como DELETE por histórico da API.
const PODE_ESCREVER_CONTEUDO = new Set<AdminRole>(['SUPER_ADMIN', 'ADMIN', 'EDITOR'])

// Ações mais sensíveis sobre conteúdo — exclusão de verdade (DELETE
// /tours/:id e /jornadas/:id fazem hard delete, ver os controllers) e
// importação de tours — ficam reservadas a ADMIN, EDITOR não. Mesmo
// conjunto de papéis que PODE_ESCREVER_CONFIGURACAO, mas nome próprio: são
// decisões independentes (uma sobre destruir/importar conteúdo, outra sobre
// configuração do tenant), que podem divergir no futuro.
const PODE_EXCLUIR_OU_IMPORTAR_CONTEUDO = new Set<AdminRole>(['SUPER_ADMIN', 'ADMIN'])

// "Configuração" do tenant = aparência do widget e catálogo de telas — só
// ADMIN escreve; EDITOR e VIEWER só leem (GET continua liberado pros dois,
// ex.: o seletor de telas usado ao criar uma campanha).
const PODE_ESCREVER_CONFIGURACAO = new Set<AdminRole>(['SUPER_ADMIN', 'ADMIN'])

export function requireEscritaConteudo(req: Request, res: Response, next: NextFunction): void {
  if (!PODE_ESCREVER_CONTEUDO.has(req.adminUser!.role)) {
    res.status(403).json({ erro: 'Seu papel não tem permissão para esta ação.' })
    return
  }
  next()
}

export function requireExclusaoOuImportacaoConteudo(req: Request, res: Response, next: NextFunction): void {
  if (!PODE_EXCLUIR_OU_IMPORTAR_CONTEUDO.has(req.adminUser!.role)) {
    res.status(403).json({ erro: 'Apenas administradores podem excluir ou importar este conteúdo.' })
    return
  }
  next()
}

export function requireEscritaConfiguracao(req: Request, res: Response, next: NextFunction): void {
  if (!PODE_ESCREVER_CONFIGURACAO.has(req.adminUser!.role)) {
    res.status(403).json({ erro: 'Apenas administradores podem alterar esta configuração.' })
    return
  }
  next()
}
