import { Router } from 'express'
import * as campanhas from '../controllers/campanhas'

const router = Router()

router.get('/', campanhas.listar)
router.post('/', campanhas.criar)
router.get('/:id', campanhas.buscarPorId)
router.put('/:id', campanhas.atualizar)
router.delete('/:id', campanhas.remover)
router.post('/:id/testar-elegibilidade', campanhas.testarElegibilidade)

export default router
