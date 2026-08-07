import { Router } from 'express'
import * as campanhas from '../controllers/campanhas'
import { requireEscritaConteudo } from '../middleware/requireEscritaTenant'

const router = Router()

router.get('/', campanhas.listar)
router.post('/', requireEscritaConteudo, campanhas.criar)
router.get('/:id', campanhas.buscarPorId)
router.put('/:id', requireEscritaConteudo, campanhas.atualizar)
// DELETE aqui é "inativar" (o controller só marca ativo:false, nunca
// remove a linha — ver remover() em controllers/campanhas.ts), a mesma
// ação de ativar/inativar do PUT — por isso fica em requireEscritaConteudo
// (EDITOR pode), não na exclusão reservada a ADMIN usada por tours/jornadas.
router.delete('/:id', requireEscritaConteudo, campanhas.remover)
// testar-elegibilidade é só simulação (nunca escreve no banco, ver
// controller) — liberado pra VIEWER também, igual a qualquer outra leitura.
router.post('/:id/testar-elegibilidade', campanhas.testarElegibilidade)
router.get('/:id/respostas.csv', campanhas.exportarRespostasCSV)

export default router
