import { Router } from 'express'
import * as adminTenants from '../controllers/adminTenants'
import * as adminTenantsAsaas from '../controllers/adminTenantsAsaas'
import * as adminTenantsPermissoes from '../controllers/adminTenantsPermissoes'

const router = Router()

router.get('/', adminTenants.listar)
router.get('/:id', adminTenants.obter)
router.post('/', adminTenants.criar)
router.put('/:id', adminTenants.atualizar)
router.get('/:id/admins', adminTenants.listarAdmins)
router.post('/:id/admins', adminTenants.criarAcesso)
router.put('/:id/admins/:adminId', adminTenants.atualizarAcesso)
router.post('/:id/admins/:adminId/reset-password', adminTenants.resetarSenha)
// Fase 2 de permissões personalizadas — mesmo router (já atrás de
// requireAdminAuth + requireSuperAdmin em index.ts, nenhuma rota deste
// arquivo tem guard próprio). GET/PUT consultam e salvam a matriz completa;
// DELETE só desliga permissoes_personalizadas (não apaga a matriz salva).
router.get('/:id/admins/:adminId/permissoes', adminTenantsPermissoes.consultarPermissoes)
router.put('/:id/admins/:adminId/permissoes', adminTenantsPermissoes.salvarPermissoes)
router.delete('/:id/admins/:adminId/permissoes', adminTenantsPermissoes.desativarPermissoes)
router.get('/:id/asaas', adminTenantsAsaas.obterVinculo)
router.put('/:id/asaas/billing', adminTenantsAsaas.atualizarDadosCobranca)
router.post('/:id/asaas/customer', adminTenantsAsaas.criarCliente)
router.post('/:id/asaas/subscription', adminTenantsAsaas.criarAssinatura)
router.get('/:id/asaas/events', adminTenantsAsaas.listarEventos)
router.post('/:id/asaas/sync', adminTenantsAsaas.sincronizar)
router.get('/:id/asaas/payments', adminTenantsAsaas.listarCobrancas)
router.get('/:id/asaas/diagnostico', adminTenantsAsaas.diagnosticar)

export default router
