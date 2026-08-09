import { Router } from 'express'
import { requireEscritaConfiguracao } from '../middleware/requireEscritaTenant'
import * as billing from '../controllers/billing'

// Fase 5 — pagamento self-service. Tenant sempre resolvido por
// req.adminUser.tenant_id/tenant (ver controllers/billing.ts) — nenhuma
// rota aqui recebe um :id de tenant, de propósito (nunca dá pra pedir pra
// operar em cima de outro tenant através de um parâmetro de rota).
//
// requireEscritaConfiguracao (ADMIN-only dentro do próprio tenant, mesmo
// guard já usado por aparência do widget/catálogo de telas) aplicado em
// TODAS as rotas, inclusive a leitura — diferente do padrão usual do
// projeto (onde GET costuma ficar aberto a qualquer papel), billing é
// sensível o bastante pra restringir a leitura também (regra explícita da
// tarefa: "somente ADMIN do próprio tenant").
const router = Router()

router.get('/situacao', requireEscritaConfiguracao, billing.obterSituacao)
// Fase 6B — planos comerciais contratáveis (nunca o interno, nunca o de
// trial). Mesmo guard das demais rotas deste router: ADMIN-only dentro do
// próprio tenant, não uma rota pública.
router.get('/planos-disponiveis', requireEscritaConfiguracao, billing.listarPlanosDisponiveis)
router.put('/dados-cobranca', requireEscritaConfiguracao, billing.atualizarDadosCobranca)
router.post('/assinatura', requireEscritaConfiguracao, billing.criarAssinatura)
// Fase 8A — upgrade self-service pra plano superior (tenant já pago). Mesmo
// guard das demais rotas financeiras deste router (ADMIN-only). preview
// nunca tem efeito colateral (não chama o Asaas, não escreve no banco) —
// existe só pra Minha Assinatura mostrar o valor proporcional ANTES de
// confirmar, sem o frontend calcular nada sozinho.
router.get('/upgrade/preview', requireEscritaConfiguracao, billing.previewUpgrade)
router.post('/upgrade', requireEscritaConfiguracao, billing.solicitarUpgrade)
router.post('/cobrancas/:cobrancaId/pagar', requireEscritaConfiguracao, billing.pagarCobranca)
// POST /reativar (reativação self-service de assinatura INACTIVE) foi
// removida nesta Fase — correção de segurança: não há hoje como distinguir
// suspensão manual de suspensão causada pelo billing, então self-service
// não pode reativar uma assinatura sem risco de reverter uma decisão
// manual do SUPER_ADMIN. Ver bloqueioOperacaoFinanceiraSelfService em
// services/asaasClient.ts.

export default router
