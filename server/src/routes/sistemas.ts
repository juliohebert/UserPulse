import { Router } from 'express'
import * as sistemas from '../controllers/sistemas'
import { requireEscritaConfiguracao } from '../middleware/requireEscritaTenant'

const router = Router()

router.get('/', sistemas.listar)
router.post('/', requireEscritaConfiguracao, sistemas.criar)
router.put('/:id', requireEscritaConfiguracao, sistemas.atualizar)
router.delete('/:id', requireEscritaConfiguracao, sistemas.remover)

export default router
