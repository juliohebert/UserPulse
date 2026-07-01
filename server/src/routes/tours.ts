import { Router } from 'express'
import * as tours from '../controllers/tours'

const router = Router()

router.get('/', tours.listar)
router.post('/', tours.criar)
router.get('/:id/dashboard', tours.buscarDashboard)
router.post('/:id/duplicar', tours.duplicar)
router.get('/:id', tours.buscarPorId)
router.put('/:id', tours.atualizar)
router.delete('/:id', tours.remover)

export default router
