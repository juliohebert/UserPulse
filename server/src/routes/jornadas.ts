import { Router } from 'express'
import * as jornadas from '../controllers/jornadas'

const router = Router()

router.get('/', jornadas.listar)
router.post('/', jornadas.criar)
router.get('/:id', jornadas.buscarPorId)
router.put('/:id', jornadas.atualizar)
router.delete('/:id', jornadas.remover)

export default router
