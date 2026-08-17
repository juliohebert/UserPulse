import { Router } from 'express'
import * as catalogoTelas from '../controllers/catalogoTelas'
import { requireEscritaConfiguracao } from '../middleware/requireEscritaTenant'

const router = Router()

// GET fica liberado pra qualquer role autenticada (ex.: o seletor de telas
// usado ao criar uma campanha/tour, acessível a EDITOR) — só escrita é
// restrita a ADMIN (ver requireEscritaConfiguracao).
router.get('/', catalogoTelas.listar)
router.post('/', requireEscritaConfiguracao, catalogoTelas.criar)
router.put('/:id', requireEscritaConfiguracao, catalogoTelas.atualizar)
router.delete('/:id', requireEscritaConfiguracao, catalogoTelas.remover)

export default router
