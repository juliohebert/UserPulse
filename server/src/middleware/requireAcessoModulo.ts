import { Request, Response, NextFunction } from 'express'
import { ModuloPainel, NivelAcessoModulo } from '@prisma/client'
import { possuiNivelMinimo } from '../lib/permissoesModulo'

// Guard de LEITURA por módulo (Fase 1 de permissões personalizadas) — não
// existia nenhum guard de leitura antes desta fase pra Campanhas/Tours/
// Jornadas/Configurações (GET era aberto a qualquer papel autenticado, ver
// comentário do relatório de diagnóstico). Sempre atrás de requireAdminAuth
// (req.adminUser já populado, permissoes incluídas no mesmo SELECT — ver
// requireAdminAuth.ts). Nunca consulta o banco aqui: nivelAcessoEfetivo é
// puro, já recebe tudo que precisa de req.adminUser.
//
// Também serve pra GERENCIAR quando usado com minimo='GERENCIAR' — mas as
// rotas de escrita continuam usando requireEscritaConteudo/
// requireExclusaoOuImportacaoConteudo/requireEscritaConfiguracao (ver
// requireEscritaTenant.ts), que por sua vez já delegam pra
// nivelAcessoEfetivo quando permissoes_personalizadas=true. Este guard aqui
// é só o pedaço que faltava: VISUALIZAR.
export function requireAcessoModulo(modulo: ModuloPainel, minimo: NivelAcessoModulo) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!possuiNivelMinimo(req.adminUser!, modulo, minimo)) {
      res.status(403).json({ erro: 'Seu papel não tem permissão para visualizar este módulo.' })
      return
    }
    next()
  }
}
