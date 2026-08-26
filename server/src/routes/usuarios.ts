import { Router } from 'express'
import { requireEscritaConfiguracao } from '../middleware/requireEscritaTenant'
import * as usuarios from '../controllers/usuarios'

// Gestão de usuários self-service — tenant SEMPRE resolvido por
// req.adminUser.tenant_id (ver controllers/usuarios.ts), nunca um :id de
// tenant na rota. requireEscritaConfiguracao (ADMIN-only dentro do próprio
// tenant, mesmo guard de billing.ts) aplicado em TODAS as rotas, inclusive
// GET — gestão de acesso/permissões é sensível o bastante pra restringir a
// leitura também, mesmo padrão de billing.ts.
const router = Router()

router.get('/', requireEscritaConfiguracao, usuarios.listar)
router.post('/', requireEscritaConfiguracao, usuarios.criarUsuarioComSenha)
router.post('/convites', requireEscritaConfiguracao, usuarios.criarConvite)
router.delete('/convites/:id', requireEscritaConfiguracao, usuarios.cancelarConvite)
router.post('/convites/:id/reenviar', requireEscritaConfiguracao, usuarios.reenviarConvite)
router.put('/:id', requireEscritaConfiguracao, usuarios.atualizarUsuario)
router.delete('/:id', requireEscritaConfiguracao, usuarios.desativarUsuario)
router.get('/:id/permissoes', requireEscritaConfiguracao, usuarios.consultarPermissoes)
router.put('/:id/permissoes', requireEscritaConfiguracao, usuarios.salvarPermissoes)
router.delete('/:id/permissoes', requireEscritaConfiguracao, usuarios.desativarPermissoes)

export default router
