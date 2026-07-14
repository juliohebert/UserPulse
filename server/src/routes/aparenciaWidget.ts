import { Router } from 'express'
import * as aparenciaWidget from '../controllers/aparenciaWidget'

const router = Router()

router.get('/:sistema', aparenciaWidget.buscar)
router.put('/:sistema', aparenciaWidget.salvar)

export default router
