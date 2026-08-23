import { Router } from 'express'
import * as sistemas from '../controllers/sistemas'
import { requireGerenciarModuloConfiguracoes } from '../middleware/requireEscritaTenant'

const router = Router()

// Ajuste pós-revisão da Fase 4 — mesmo raciocínio de catalogoTelas.ts: GET
// fica sem guard de módulo, de propósito. O seletor de sistema usado ao
// criar campanha/tela (web/src/pages/campanhas/CampanhaForm.tsx,
// pages/catalogo/Index.tsx) depende deste endpoint fora da tela de
// Configurações; gatear por CONFIGURACOES quebraria esses fluxos agora que
// o padrão de EDITOR/VIEWER em CONFIGURACOES é NENHUM (ver
// lib/permissoesModulo.ts). Só escrita é restrita a ADMIN via
// requireGerenciarModuloConfiguracoes.
router.get('/', sistemas.listar)
router.post('/', requireGerenciarModuloConfiguracoes, sistemas.criar)
router.put('/:id', requireGerenciarModuloConfiguracoes, sistemas.atualizar)
router.delete('/:id', requireGerenciarModuloConfiguracoes, sistemas.remover)

export default router
