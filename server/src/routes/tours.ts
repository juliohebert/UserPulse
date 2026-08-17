import { Router } from 'express'
import * as tours from '../controllers/tours'
import { requireEscritaConteudo, requireExclusaoOuImportacaoConteudo } from '../middleware/requireEscritaTenant'

const router = Router()

router.get('/', tours.listar)
router.post('/', requireEscritaConteudo, tours.criar)
// Importar é reservado a ADMIN (ver requireExclusaoOuImportacaoConteudo) —
// EDITOR pode criar/duplicar um tour, mas não trazer um JSON externo.
router.post('/importar', requireExclusaoOuImportacaoConteudo, tours.importar)
router.get('/:id/dashboard', tours.buscarDashboard)
router.get('/:id/exportar', tours.exportar)
router.post('/:id/duplicar', requireEscritaConteudo, tours.duplicar)
router.get('/:id', tours.buscarPorId)
router.put('/:id', requireEscritaConteudo, tours.atualizar)
// Exclusão de verdade (hard delete, ver controller) — reservada a ADMIN.
router.delete('/:id', requireExclusaoOuImportacaoConteudo, tours.remover)

export default router
