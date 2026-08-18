import { Router } from 'express'
import * as aparenciaWidget from '../controllers/aparenciaWidget'
import { requireGerenciarModuloConfiguracoes } from '../middleware/requireEscritaTenant'
import { requireAcessoModulo } from '../middleware/requireAcessoModulo'

const router = Router()

// Fase 1 de permissões personalizadas — leitura passa a exigir ao menos
// VISUALIZAR no módulo CONFIGURACOES (antes, GET era aberto a qualquer
// papel autenticado sem guard nenhum). requireGerenciarModuloConfiguracoes
// (não requireEscritaConfiguracao, usado por billing.ts) é quem entende
// permissoes_personalizadas pra este módulo — ver requireEscritaTenant.ts.
router.get('/default', requireAcessoModulo('CONFIGURACOES', 'VISUALIZAR'), aparenciaWidget.buscarDefault)
router.put('/default', requireGerenciarModuloConfiguracoes, aparenciaWidget.salvarDefault)
router.get('/:sistema', requireAcessoModulo('CONFIGURACOES', 'VISUALIZAR'), aparenciaWidget.buscar)
router.put('/:sistema', requireGerenciarModuloConfiguracoes, aparenciaWidget.salvar)

export default router
