import { Router } from 'express'
import * as tours from '../controllers/tours'
import { requireEscritaConteudo, requireExclusaoOuImportacaoConteudo } from '../middleware/requireEscritaTenant'
import { requireAcessoModulo } from '../middleware/requireAcessoModulo'

const router = Router()

// Fase 1 de permissões personalizadas — leitura passa a exigir ao menos
// VISUALIZAR no módulo TOURS (antes, GET era aberto a qualquer papel
// autenticado sem guard nenhum).
router.get('/', requireAcessoModulo('TOURS', 'VISUALIZAR'), tours.listar)
router.post('/', requireEscritaConteudo('TOURS'), tours.criar)
// Importar é reservado a ADMIN (ver requireExclusaoOuImportacaoConteudo) —
// EDITOR pode criar/duplicar um tour, mas não trazer um JSON externo. Com
// permissoes_personalizadas=true, GERENCIAR em TOURS já cobre importar
// (não há nível mais granular nesta fase, ver requireEscritaTenant.ts).
router.post('/importar', requireExclusaoOuImportacaoConteudo('TOURS'), tours.importar)
router.get('/:id/dashboard', requireAcessoModulo('TOURS', 'VISUALIZAR'), tours.buscarDashboard)
router.get('/:id/exportar', requireAcessoModulo('TOURS', 'VISUALIZAR'), tours.exportar)
router.post('/:id/duplicar', requireEscritaConteudo('TOURS'), tours.duplicar)
router.get('/:id', requireAcessoModulo('TOURS', 'VISUALIZAR'), tours.buscarPorId)
router.put('/:id', requireEscritaConteudo('TOURS'), tours.atualizar)
// Exclusão de verdade (hard delete, ver controller) — reservada a ADMIN.
router.delete('/:id', requireExclusaoOuImportacaoConteudo('TOURS'), tours.remover)

export default router
