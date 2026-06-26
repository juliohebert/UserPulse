import { Router } from 'express'
import * as widget from '../controllers/widget'

const router = Router()

router.get('/campanha', widget.buscarCampanha)
router.get('/candidatas', widget.buscarCandidatas)
router.post('/evento', widget.registrarEvento)
router.post('/feedback', widget.registrarFeedback)
router.patch('/feedback/:id/telefone', widget.atualizarTelefone)
router.post('/confirmacao', widget.registrarConfirmacao)

export default router
