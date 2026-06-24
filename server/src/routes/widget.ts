import { Router } from 'express'
import * as widget from '../controllers/widget'

const router = Router()

router.get('/campanha', widget.buscarCampanha)
router.post('/evento', widget.registrarEvento)
router.post('/feedback', widget.registrarFeedback)
router.post('/confirmacao', widget.registrarConfirmacao)

export default router
