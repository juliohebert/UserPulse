import { Router } from 'express'
import * as catalogoTelas from '../controllers/catalogoTelas'

const router = Router()

router.get('/', catalogoTelas.listar)
router.post('/', catalogoTelas.criar)
router.put('/:id', catalogoTelas.atualizar)
router.delete('/:id', catalogoTelas.remover)

export default router
