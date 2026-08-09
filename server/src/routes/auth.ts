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
// Fase 6B — cadastro público self-service. Públicas pelo mesmo motivo de
// /login: são o próprio ato de criar a conta, ainda não existe sessão pra
// exigir (ver auth.ts, cadastroConfig/cadastro).
router.get('/cadastro/config', auth.cadastroConfig)
router.post('/cadastro', auth.cadastro)
// "Esqueci minha senha" — públicas pelo mesmo motivo: quem chega aqui ainda
// não tem sessão (ver auth.ts, esqueciSenha/redefinirSenha).
router.post('/esqueci-senha', auth.esqueciSenha)
router.post('/redefinir-senha', auth.redefinirSenha)

export default router
