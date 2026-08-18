import { Request, Response, NextFunction } from 'express'
import { AdminRole, ModuloPainel } from '@prisma/client'
import { possuiNivelMinimo } from '../lib/permissoesModulo'

// RBAC real dos usuários DE UM CLIENTE (ADMIN/EDITOR/VIEWER) sobre os
// próprios recursos do tenant — não confundir com requireSuperAdmin.ts
// (esse é sobre rotas cross-tenant de Gestão SaaS). Sempre atrás de
// requireAdminAuth (req.adminUser já populado). SUPER_ADMIN entra nos dois
// conjuntos: dentro do próprio tenant (Quark) se comporta como ADMIN, sem
// bypass nem perda de acesso (ver comentário em schema.prisma).
//
// Fase 1 de permissões personalizadas: quando req.adminUser.
// permissoes_personalizadas=true, o Set de requireEscritaConteudo deixa de
// valer pro usuário — a decisão passa inteira pra nivelAcessoEfetivo (ver
// lib/permissoesModulo.ts), que exige GERENCIAR no módulo informado.
// requireExclusaoOuImportacaoConteudo é DIFERENTE de propósito (ajuste
// pós-revisão): permissão personalizada nunca eleva o teto administrativo
// da role — GERENCIAR personalizado só autoriza excluir/importar quando a
// role já está em PODE_EXCLUIR_OU_IMPORTAR_CONTEUDO (SUPER_ADMIN/ADMIN).
// EDITOR/VIEWER com GERENCIAR personalizado continuam bloqueados aqui,
// mesmo que esse mesmo GERENCIAR já libere a escrita comum do módulo via
// requireEscritaConteudo. Quando permissoes_personalizadas=false, ambos os
// guards têm o comportamento EXATAMENTE igual a antes desta fase — Sets
// intocados.
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

export function requireEscritaConteudo(modulo: ModuloPainel) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const adminUser = req.adminUser!
    const permitido = adminUser.permissoes_personalizadas
      ? possuiNivelMinimo(adminUser, modulo, 'GERENCIAR')
      : PODE_ESCREVER_CONTEUDO.has(adminUser.role)
    if (!permitido) {
      res.status(403).json({ erro: 'Seu papel não tem permissão para esta ação.' })
      return
    }
    next()
  }
}

export function requireExclusaoOuImportacaoConteudo(modulo: ModuloPainel) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const adminUser = req.adminUser!
    // Teto administrativo da role NUNCA é elevado por permissão
    // personalizada (ajuste pós-revisão) — só SUPER_ADMIN/ADMIN excluem ou
    // importam, com ou sem personalização. Quando personalizado=true, além
    // de estar no teto da role, o usuário também precisa ter GERENCIAR
    // efetivo no módulo (um ADMIN cuja personalização reduziu o nível pro
    // módulo pra VISUALIZAR/NENHUM não deve excluir/importar ali).
    const dentroDoTetoDaRole = PODE_EXCLUIR_OU_IMPORTAR_CONTEUDO.has(adminUser.role)
    const permitido =
      dentroDoTetoDaRole && (!adminUser.permissoes_personalizadas || possuiNivelMinimo(adminUser, modulo, 'GERENCIAR'))
    if (!permitido) {
      res.status(403).json({ erro: 'Apenas administradores podem excluir ou importar este conteúdo.' })
      return
    }
    next()
  }
}

// ATENÇÃO: esta guarda também é usada por routes/billing.ts (Minha
// Assinatura) — regra fechada da tarefa: "Billing/Minha Assinatura fica
// fora de CONFIGURACOES", não alterar billing. Por isso NÃO delega pra
// nivelAcessoEfetivo/permissoes_personalizadas — continua 100% Set-based,
// idêntica a antes desta fase, pros dois consumidores (aparência/catálogo/
// sistemas E billing). Quem precisa do módulo CONFIGURACOES personalizável
// é requireGerenciarModuloConfiguracoes, abaixo — só usada pelas 3 rotas
// de configuração de tenant, nunca por billing.ts.
export function requireEscritaConfiguracao(req: Request, res: Response, next: NextFunction): void {
  if (!PODE_ESCREVER_CONFIGURACAO.has(req.adminUser!.role)) {
    res.status(403).json({ erro: 'Apenas administradores podem alterar esta configuração.' })
    return
  }
  next()
}

// Escrita do módulo CONFIGURACOES (aparência do widget, catálogo de telas,
// sistemas) sensível a permissões personalizadas — usar esta em vez de
// requireEscritaConfiguracao nas 3 rotas de configuração de tenant
// (aparenciaWidget.ts/catalogoTelas.ts/sistemas.ts). Nunca usar em
// billing.ts (ver comentário acima).
export function requireGerenciarModuloConfiguracoes(req: Request, res: Response, next: NextFunction): void {
  const adminUser = req.adminUser!
  const permitido = adminUser.permissoes_personalizadas
    ? possuiNivelMinimo(adminUser, 'CONFIGURACOES', 'GERENCIAR')
    : PODE_ESCREVER_CONFIGURACAO.has(adminUser.role)
  if (!permitido) {
    res.status(403).json({ erro: 'Apenas administradores podem alterar esta configuração.' })
    return
  }
  next()
}
