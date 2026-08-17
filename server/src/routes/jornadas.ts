import { Router } from 'express'
import * as jornadas from '../controllers/jornadas'
import { requireEscritaConteudo, requireExclusaoOuImportacaoConteudo } from '../middleware/requireEscritaTenant'

const router = Router()

router.get('/', jornadas.listar)
router.post('/', requireEscritaConteudo, jornadas.criar)
router.get('/:id', jornadas.buscarPorId)
router.put('/:id', requireEscritaConteudo, jornadas.atualizar)
// Exclusão de verdade (hard delete, ver controller) — reservada a ADMIN.
router.delete('/:id', requireExclusaoOuImportacaoConteudo, jornadas.remover)

export default router
