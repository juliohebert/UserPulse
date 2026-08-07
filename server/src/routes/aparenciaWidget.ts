import { Router } from 'express'
import * as aparenciaWidget from '../controllers/aparenciaWidget'
import { requireEscritaConfiguracao } from '../middleware/requireEscritaTenant'

const router = Router()

router.get('/:sistema', aparenciaWidget.buscar)
router.put('/:sistema', requireEscritaConfiguracao, aparenciaWidget.salvar)

export default router
