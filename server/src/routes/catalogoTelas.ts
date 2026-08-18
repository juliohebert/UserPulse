import { Router } from 'express'
import * as catalogoTelas from '../controllers/catalogoTelas'
import { requireGerenciarModuloConfiguracoes } from '../middleware/requireEscritaTenant'

const router = Router()

// Ajuste pós-revisão da Fase 4: GET fica SEM guard de módulo, de propósito
// — o padrão de EDITOR/VIEWER em CONFIGURACOES virou NENHUM (ver
// lib/permissoesModulo.ts), mas este endpoint é consumido fora da tela de
// Configurações também (o seletor de telas usado ao criar uma campanha/
// tour, ver web/src/pages/campanhas2/Index.tsx — CAMPANHAS é módulo
// independente de CONFIGURACOES). Gatear esta leitura por CONFIGURACOES
// quebraria esse fluxo pra EDITOR sem relação nenhuma com o pedido desta
// fase. Mesmo comportamento de antes da Fase 1 (liberado a qualquer papel
// autenticado) — só escrita é restrita (ver requireGerenciarModuloConfiguracoes,
// não requireEscritaConfiguracao — esse é usado por billing.ts, fora do
// módulo CONFIGURACOES).
router.get('/', catalogoTelas.listar)
router.post('/', requireGerenciarModuloConfiguracoes, catalogoTelas.criar)
router.put('/:id', requireGerenciarModuloConfiguracoes, catalogoTelas.atualizar)
router.delete('/:id', requireGerenciarModuloConfiguracoes, catalogoTelas.remover)

export default router
