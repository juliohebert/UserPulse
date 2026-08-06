import { Router } from 'express'
import * as adminPlanos from '../controllers/adminPlanos'

const router = Router()

router.get('/', adminPlanos.listar)
router.post('/', adminPlanos.criar)
router.put('/:id', adminPlanos.atualizar)

export default router
