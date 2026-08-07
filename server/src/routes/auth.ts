import { Router } from 'express'
import * as auth from '../controllers/auth'
import { requireAdminAuth } from '../middleware/requireAdminAuth'

const router = Router()

// login é a única rota deste router que fica pública (é o próprio ato de se
// autenticar) — me/logout exigem sessão já válida.
router.post('/login', auth.login)
router.get('/me', requireAdminAuth, auth.me)
router.post('/logout', auth.logout)
router.post('/trocar-senha', requireAdminAuth, auth.trocarSenha)

export default router
