import { Router } from 'express'
import * as configuracao from '../controllers/configuracao'

const router = Router()

router.get('/', configuracao.buscar)
router.put('/', configuracao.atualizar)

export default router
