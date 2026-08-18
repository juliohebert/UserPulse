import { Router } from 'express'
import * as jornadas from '../controllers/jornadas'
import { requireEscritaConteudo, requireExclusaoOuImportacaoConteudo } from '../middleware/requireEscritaTenant'
import { requireAcessoModulo } from '../middleware/requireAcessoModulo'

const router = Router()

// Fase 1 de permissões personalizadas — leitura passa a exigir ao menos
// VISUALIZAR no módulo JORNADAS (antes, GET era aberto a qualquer papel
// autenticado sem guard nenhum).
router.get('/', requireAcessoModulo('JORNADAS', 'VISUALIZAR'), jornadas.listar)
router.post('/', requireEscritaConteudo('JORNADAS'), jornadas.criar)
router.get('/:id', requireAcessoModulo('JORNADAS', 'VISUALIZAR'), jornadas.buscarPorId)
router.put('/:id', requireEscritaConteudo('JORNADAS'), jornadas.atualizar)
// Exclusão de verdade (hard delete, ver controller) — reservada a ADMIN.
router.delete('/:id', requireExclusaoOuImportacaoConteudo('JORNADAS'), jornadas.remover)

export default router
