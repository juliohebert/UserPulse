import { Router } from 'express'
import * as adminTenants from '../controllers/adminTenants'
import * as adminTenantsAsaas from '../controllers/adminTenantsAsaas'

const router = Router()

router.get('/', adminTenants.listar)
router.get('/:id', adminTenants.obter)
router.post('/', adminTenants.criar)
router.put('/:id', adminTenants.atualizar)
router.get('/:id/admins', adminTenants.listarAdmins)
router.post('/:id/admins', adminTenants.criarAcesso)
router.put('/:id/admins/:adminId', adminTenants.atualizarAcesso)
router.post('/:id/admins/:adminId/reset-password', adminTenants.resetarSenha)
router.get('/:id/asaas', adminTenantsAsaas.obterVinculo)
router.post('/:id/asaas/customer', adminTenantsAsaas.criarCliente)
router.post('/:id/asaas/subscription', adminTenantsAsaas.criarAssinatura)

export default router
