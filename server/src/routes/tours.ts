import { Router } from 'express'
import * as tours from '../controllers/tours'

const router = Router()

router.get('/', tours.listar)
router.post('/', tours.criar)
router.post('/importar', tours.importar)
router.get('/:id/dashboard', tours.buscarDashboard)
router.get('/:id/exportar', tours.exportar)
router.post('/:id/duplicar', tours.duplicar)
router.get('/:id', tours.buscarPorId)
router.put('/:id', tours.atualizar)
router.delete('/:id', tours.remover)

export default router
