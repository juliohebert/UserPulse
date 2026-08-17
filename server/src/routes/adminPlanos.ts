import { Router } from 'express'
import * as adminPlanos from '../controllers/adminPlanos'

const router = Router()

router.get('/', adminPlanos.listar)
router.post('/', adminPlanos.criar)
router.put('/:id', adminPlanos.atualizar)
router.delete('/:id', adminPlanos.remover)

export default router
