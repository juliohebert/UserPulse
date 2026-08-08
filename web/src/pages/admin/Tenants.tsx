import { useEffect, useRef, useState } from 'react'
import { get, post, put } from '../../services/api'
import type { AdminDoTenant, AdminRole, AsaasEventoTenant, AsaasVinculoTenant, AtualizarCobrancaResposta, CobrancaResumo, CobrancasAsaasResposta, DiagnosticoAsaasResposta, PlanoAdmin, SituacaoAsaasDecisao, TenantAdminItem, TenantStatus } from '../../types'
import { LoadingSpinner, ErrorState, EmptyState } from '../../components/ui/EmptyState'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, type ConfirmDialogVariant } from '../../components/ui/ConfirmDialog'
import { AdminSaasTabs } from '../../components/admin/AdminSaasTabs'
import { gerarSlug, formatDate, formatDateTime, formatarValorReais, toInputDate } from '../../utils/campanha'
import {
  formatarCpfCnpj, formatarTelefone, formatarCep, formatarEstado,
  normalizarCpfCnpj, normalizarTelefone, normalizarCep, normalizarEmail, emailValido,
} from '../../utils/mascaras'

const STATUS_OPCOES: { value: TenantStatus; label: string }[] = [
  { value: 'TRIAL', label: 'Teste grátis' },
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'EXPIRED', label: 'Expirado' },
  { value: 'SUSPENDED', label: 'Suspenso' },
  { value: 'CANCELED', label: 'Cancelado' },
]

const FILTRO_STATUS_OPCOES = [{ value: '', label: 'Todos' }, ...STATUS_OPCOES]

type Situacao = 'trial_ativo' | 'trial_vencido' | 'licenca_ativa' | 'licenca_vencida' | 'suspenso' | 'cancelado'
type FiltroSituacao = '' | Situacao

const FILTRO_SITUACAO_OPCOES: { value: FiltroSituacao; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'trial_ativo', label: 'Trial ativo' },
  { value: 'trial_vencido', label: 'Trial vencido' },
  { value: 'licenca_ativa', label: 'Licença ativa' },
  { value: 'licenca_vencida', label: 'Licença vencida' },
  { value: 'suspenso', label: 'Suspenso' },
  { value: 'cancelado', label: 'Cancelado' },
]

// Estado comercial derivado (status + datas) — complementar ao filtro de
// Status (valor bruto do enum). TRIAL usa trial_fim; ACTIVE usa licenca_fim;
// EXPIRED representa trial OU licença vencida (licenca_fim preenchido decide
// qual); SUSPENDED/CANCELED vêm direto do status, sem olhar data nenhuma.
// Datas ausentes nunca contam como "vencido" (sem trial_fim/licenca_fim
// definido = ainda sem prazo pra vencer).
function classificarSituacao(tenant: Pick<TenantAdminItem, 'status' | 'trial_fim' | 'licenca_fim'>): Situacao {
  if (tenant.status === 'SUSPENDED') return 'suspenso'
  if (tenant.status === 'CANCELED') return 'cancelado'

  const venceu = (data: string | null) => data != null && new Date(data).getTime() < Date.now()

  if (tenant.status === 'TRIAL') return venceu(tenant.trial_fim) ? 'trial_vencido' : 'trial_ativo'
  if (tenant.status === 'ACTIVE') return venceu(tenant.licenca_fim) ? 'licenca_vencida' : 'licenca_ativa'
  // EXPIRED
  return tenant.licenca_fim ? 'licenca_vencida' : 'trial_vencido'
}

const STATUS_BADGE: Record<TenantStatus, { label: string; className: string }> = {
  TRIAL: { label: 'Teste grátis', className: 'bg-primary/10 text-primary' },
  ACTIVE: { label: 'Ativo', className: 'bg-tertiary/10 text-tertiary' },
  EXPIRED: { label: 'Expirado', className: 'bg-error-container text-error' },
  SUSPENDED: { label: 'Suspenso', className: 'bg-error-container text-error' },
  CANCELED: { label: 'Cancelado', className: 'bg-outline-variant/30 text-outline' },
}

// Badge de status de cobrança (Fase 3, seção "Cobranças") — mapeia o status
// bruto do Asaas pros rótulos pedidos. DELETED conta como "Cancelada" (a
// cobrança não é mais devida); REFUNDED tem rótulo próprio ("Reembolsada")
// por já ter sido paga e depois estornada, diferente de uma cobrança apenas
// cancelada/excluída sem pagamento. Qualquer status fora dessa lista (ex.:
// REFUND_REQUESTED, CHARGEBACK_REQUESTED) cai no fallback neutro, mostrando
// o valor bruto — nunca escondido.
const COBRANCA_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-outline-variant/30 text-outline' },
  RECEIVED: { label: 'Recebida', className: 'bg-tertiary/10 text-tertiary' },
  RECEIVED_IN_CASH: { label: 'Recebida', className: 'bg-tertiary/10 text-tertiary' },
  CONFIRMED: { label: 'Confirmada', className: 'bg-tertiary/10 text-tertiary' },
  AWAITING_RISK_ANALYSIS: { label: 'Em análise', className: 'bg-outline-variant/30 text-outline' },
  OVERDUE: { label: 'Vencida', className: 'bg-error-container text-error' },
  REFUNDED: { label: 'Reembolsada', className: 'bg-outline-variant/30 text-outline' },
  DELETED: { label: 'Cancelada', className: 'bg-outline-variant/30 text-outline' },
}

function CobrancaStatusBadge({ status }: { status: string }) {
  const cfg = COBRANCA_STATUS_BADGE[status] ?? { label: status, className: 'bg-outline-variant/30 text-outline' }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>
}

// Badge da decisão do diagnóstico de billing (Fase 4) — as 4 decisões que
// calcularSituacaoAsaas pode retornar (server/src/services/asaasClient.ts),
// nunca um valor fora desse conjunto (tipo fechado, sem fallback genérico
// necessário aqui, diferente de COBRANCA_STATUS_BADGE que reflete enum
// aberto do Asaas).
const SITUACAO_ASAAS_BADGE: Record<SituacaoAsaasDecisao, { label: string; className: string }> = {
  OK: { label: 'Em dia', className: 'bg-tertiary/10 text-tertiary' },
  INADIMPLENTE: { label: 'Inadimplente', className: 'bg-error-container text-error' },
  ASSINATURA_INATIVA: { label: 'Assinatura inativa', className: 'bg-error-container text-error' },
  INDETERMINADO: { label: 'Indeterminado', className: 'bg-outline-variant/30 text-outline' },
}

function SituacaoAsaasBadge({ decisao }: { decisao: SituacaoAsaasDecisao }) {
  const cfg = SITUACAO_ASAAS_BADGE[decisao]
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>
}

const COBRANCA_TIPO_LABEL: Record<string, string> = {
  BOLETO: 'Boleto',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  DEPOSIT: 'Depósito',
  TRANSFER: 'Transferência',
  // RECEIVED_IN_CASH é um valor de status de cobrança (ver
  // COBRANCA_STATUS_BADGE), mas o Asaas também documenta como possível
  // billingType em alguns retornos — mapeado aqui por segurança, caso
  // chegue nesse campo.
  RECEIVED_IN_CASH: 'Recebido em dinheiro',
  UNDEFINED: 'A definir',
}

// Status da assinatura no Asaas (Tenant.asaas_status, espelho pra exibição —
// ver comentário em schema.prisma). Domínio pequeno e estável (Asaas só usa
// esses 3 valores pra Subscription.status).
const ASAAS_SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  EXPIRED: 'Expirada',
  INACTIVE: 'Inativa',
}

// Eventos de webhook Asaas exibidos no histórico (Fase 2, ver GET .../asaas
// /events) — cobre os tipos de payment/subscription que este projeto
// efetivamente recebe (ver mapearEventoAsaas em asaasClient.ts pros que
// disparam efeito; os demais só ficam registrados no log). Nomes que o
// Asaas ainda não documentou pra este projeto, ou eventos de outras APIs
// (transfer, invoice), caem no fallback de rotuloAsaas abaixo.
const EVENTO_ASAAS_LABEL: Record<string, string> = {
  PAYMENT_CREATED: 'Cobrança criada',
  PAYMENT_UPDATED: 'Cobrança atualizada',
  PAYMENT_CONFIRMED: 'Pagamento confirmado',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  PAYMENT_OVERDUE: 'Cobrança vencida',
  PAYMENT_DELETED: 'Cobrança excluída',
  PAYMENT_RESTORED: 'Cobrança restaurada',
  PAYMENT_REFUNDED: 'Pagamento estornado',
  PAYMENT_PARTIALLY_REFUNDED: 'Pagamento parcialmente estornado',
  PAYMENT_REFUND_IN_PROGRESS: 'Estorno em andamento',
  PAYMENT_REFUND_DENIED: 'Estorno negado',
  PAYMENT_RECEIVED_IN_CASH_UNDONE: 'Recebimento em dinheiro desfeito',
  PAYMENT_CHARGEBACK_REQUESTED: 'Chargeback solicitado',
  PAYMENT_CHARGEBACK_DISPUTE: 'Disputa de chargeback aberta',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'Aguardando reversão de chargeback',
  PAYMENT_DUNNING_RECEIVED: 'Cobrança de inadimplência recebida',
  PAYMENT_DUNNING_REQUESTED: 'Cobrança de inadimplência solicitada',
  PAYMENT_BANK_SLIP_VIEWED: 'Boleto visualizado pelo cliente',
  PAYMENT_BANK_SLIP_CANCELLED: 'Boleto cancelado',
  PAYMENT_CHECKOUT_VIEWED: 'Checkout visualizado pelo cliente',
  PAYMENT_AWAITING_RISK_ANALYSIS: 'Pagamento aguardando análise de risco',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: 'Pagamento aprovado na análise de risco',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'Pagamento reprovado na análise de risco',
  PAYMENT_AUTHORIZED: 'Pagamento autorizado',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'Captura no cartão de crédito recusada',
  PAYMENT_ANTICIPATED: 'Pagamento antecipado',
  PAYMENT_SPLIT_CANCELLED: 'Divisão de pagamento (split) cancelada',
  PAYMENT_SPLIT_DIVERGENCE_BLOCK: 'Divisão de pagamento (split) bloqueada por divergência',
  PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED: 'Bloqueio por divergência no split finalizado',
  SUBSCRIPTION_CREATED: 'Assinatura criada',
  SUBSCRIPTION_UPDATED: 'Assinatura atualizada',
  SUBSCRIPTION_DELETED: 'Assinatura excluída',
  SUBSCRIPTION_INACTIVATED: 'Assinatura inativada',
  SUBSCRIPTION_SPLIT_DISABLED: 'Divisão de pagamento (split) da assinatura desativada',
  SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK: 'Divisão de pagamento (split) da assinatura bloqueada por divergência',
  SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED: 'Bloqueio por divergência no split da assinatura finalizado',
}

// Tradução de código Asaas -> rótulo PT-BR reaproveitada pelos três mapas
// acima. Código desconhecido nunca quebra a tela: cai no próprio código
// como fallback (mesma UX que os badges já tinham antes desta tradução).
function rotuloAsaas(mapa: Record<string, string>, codigo: string): string {
  return mapa[codigo] ?? codigo
}

function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const { label, className } = STATUS_BADGE[status]
  return <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase whitespace-nowrap ${className}`}>{label}</span>
}

// Textos do ConfirmDialog (ver components/ui/ConfirmDialog.tsx) pras 3
// transições de status disparadas pela tabela de Clientes — substitui os
// antigos window.confirm. Só cobre os 3 status alcançáveis pelos botões da
// linha (SUSPENDED/CANCELED/ACTIVE); TRIAL/EXPIRED não têm botão de ação direta.
const STATUS_CONFIRM_CFG: Partial<Record<TenantStatus, { titulo: string; descricao: string; confirmLabel: string; variant: ConfirmDialogVariant }>> = {
  SUSPENDED: {
    titulo: 'Suspender',
    descricao: 'Isso bloqueia ações de escrita no painel do cliente. O acesso poderá ser reativado depois.',
    confirmLabel: 'Suspender',
    variant: 'warning',
  },
  CANCELED: {
    titulo: 'Cancelar cliente',
    descricao: 'Isso marca o cliente como cancelado e bloqueia o uso. Use apenas quando o contrato estiver encerrado.',
    confirmLabel: 'Cancelar cliente',
    variant: 'danger',
  },
  ACTIVE: {
    titulo: 'Reativar',
    descricao: 'O cliente voltará a poder usar o sistema conforme o plano e a licença configurados.',
    confirmLabel: 'Reativar',
    variant: 'default',
  },
}

// Papéis atribuíveis a um usuário DO CLIENTE — SUPER_ADMIN nunca aparece
// aqui de propósito (só existe fora desse fluxo, ver requireSuperAdmin.ts).
type RoleAcessoCliente = 'ADMIN' | 'EDITOR' | 'VIEWER'

const ROLE_ACESSO_OPCOES: { value: AdminRole; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Visualizador' },
]

// Descrição exibida abaixo do select "Papel" (ver card no formulário de
// Acessos) — hoje é só INFORMATIVO: nenhuma rota de campanhas/tours/jornadas/
// aparência/catálogo confere role para restringir escrita (só
// requireSuperAdmin.ts confere role, e só pra bloquear rotas cross-tenant de
// Gestão SaaS). ADMIN, EDITOR e VIEWER têm hoje o mesmo acesso de leitura e
// escrita dentro do próprio tenant — este texto descreve o uso PRETENDIDO de
// cada papel, não uma permissão já aplicada pelo backend. Implementar RBAC
// de verdade é uma tarefa própria, fora de escopo aqui.
const ROLE_DESCRICAO: Record<RoleAcessoCliente, string> = {
  ADMIN: 'Pode gerenciar campanhas, tours, jornadas, aparência, integrações e configurações do cliente. Não acessa Gestão SaaS.',
  EDITOR: 'Pode criar e editar campanhas, tours e jornadas do próprio cliente. Não gerencia plano, licença, integrações globais ou acessos.',
  VIEWER: 'Pode apenas visualizar dados, campanhas, tours, jornadas e resultados. Não pode criar, editar, ativar, inativar ou excluir.',
}

const ROLE_BADGE: Partial<Record<AdminRole, { label: string; className: string }>> = {
  ADMIN: { label: 'Admin', className: 'bg-primary/10 text-primary' },
  EDITOR: { label: 'Editor', className: 'bg-tertiary/10 text-tertiary' },
  VIEWER: { label: 'Visualizador', className: 'bg-outline-variant/30 text-outline' },
}

function RoleBadge({ role }: { role: AdminRole }) {
  const cfg = ROLE_BADGE[role] ?? { label: role, className: 'bg-outline-variant/30 text-outline' }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>
}

const EMPTY_ACESSO_FORM = { nome: '', email: '', senha: '', role: 'ADMIN' as AdminRole }

// Dados de cobrança (Fase 2 da integração Asaas) — mesmos 11 campos de
// DadosCobrancaTenant (ver types.ts), todos string vazia por padrão (nunca
// undefined, pra manter os <input> controlados).
const EMPTY_BILLING_FORM = {
  billing_nome_responsavel: '',
  billing_email: '',
  billing_cpf_cnpj: '',
  billing_telefone: '',
  billing_endereco: '',
  billing_numero: '',
  billing_complemento: '',
  billing_bairro: '',
  billing_cidade: '',
  billing_estado: '',
  billing_cep: '',
}

type BillingForm = typeof EMPTY_BILLING_FORM
type BillingErros = Partial<Record<keyof BillingForm, string>>

// Validação pura (sem estado) dos "Dados de cobrança" — chamada a cada
// render (formulário pequeno, sem custo perceptível) e só EXIBIDA depois de
// uma tentativa de salvar (ver billingTentouSalvar), pra não mostrar erro
// em campo vazio assim que o modal abre. Usada tanto pra desenhar as
// mensagens quanto pra bloquear o submit (ver salvarBillingHandler).
function validarBillingForm(form: BillingForm): BillingErros {
  const erros: BillingErros = {}
  if (!form.billing_nome_responsavel.trim()) erros.billing_nome_responsavel = 'Informe o nome do responsável.'
  if (!form.billing_cpf_cnpj.trim()) erros.billing_cpf_cnpj = 'Informe o CPF/CNPJ.'
  if (!form.billing_email.trim()) erros.billing_email = 'Informe o e-mail.'
  else if (!emailValido(form.billing_email)) erros.billing_email = 'E-mail inválido.'
  if (form.billing_endereco.trim() && !normalizarCep(form.billing_cep)) erros.billing_cep = 'Informe o CEP (endereço preenchido).'
  if (form.billing_estado.trim() && form.billing_estado.trim().length !== 2) erros.billing_estado = 'Estado deve ter 2 letras (UF).'
  return erros
}

const EMPTY_FORM = {
  nome: '',
  slug: '',
  plano_id: '',
  status: 'TRIAL' as TenantStatus,
  trial_inicio: '',
  trial_fim: '',
  licenca_inicio: '',
  licenca_fim: '',
  proxima_cobranca: '',
  ultimo_pagamento_em: '',
  observacao_comercial: '',
  // Administrador inicial — só usado ao criar (ver salvar()); ignorados na
  // edição, mesmo que fiquem preenchidos no estado por algum motivo.
  admin_nome: '',
  admin_email: '',
  admin_password: '',
  admin_password_confirm: '',
}

type FormState = typeof EMPTY_FORM

const field =
  'w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors'

const sectionHeader = 'text-[11px] font-bold uppercase tracking-wider text-outline'

const DIAS_TRIAL_PADRAO = 14

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function maisDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function AdminTenantsIndex() {
  const [tenants, setTenants] = useState<TenantAdminItem[]>([])
  const [planos, setPlanos] = useState<PlanoAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<TenantAdminItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Modal "Acessos" — lista/cria/edita usuários (ADMIN/EDITOR/VIEWER) DO
  // CLIENTE selecionado. Nunca confundir com o próprio SUPER_ADMIN.
  const [acessosModalTenant, setAcessosModalTenant] = useState<TenantAdminItem | null>(null)
  const [acessos, setAcessos] = useState<AdminDoTenant[]>([])
  const [acessosLoading, setAcessosLoading] = useState(false)
  const [acessosError, setAcessosError] = useState<string | null>(null)
  const [togglingAcesso, setTogglingAcesso] = useState<string | null>(null)

  // Formulário de novo acesso / edição de acesso — reaproveitado pros dois
  // casos (editandoAcesso null = criando).
  const [mostrarFormAcesso, setMostrarFormAcesso] = useState(false)
  const [editandoAcesso, setEditandoAcesso] = useState<AdminDoTenant | null>(null)
  const [acessoForm, setAcessoForm] = useState(EMPTY_ACESSO_FORM)
  const [salvandoAcesso, setSalvandoAcesso] = useState(false)
  const [acessoFormError, setAcessoFormError] = useState<string | null>(null)

  // Mini-modal de reset de senha, empilhado por cima do modal de Acessos.
  const [resetandoSenhaDe, setResetandoSenhaDe] = useState<AdminDoTenant | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSucesso, setResetSucesso] = useState<string | null>(null)

  // Modal "Cobrança Asaas" — vínculo do tenant selecionado com o Asaas
  // (fundação/sandbox, ver server/src/services/asaasClient.ts). Nunca abre
  // sozinho, nunca chama o Asaas automaticamente — só reflete o que já está
  // salvo e oferece os dois botões de ação manual.
  const [asaasModalTenant, setAsaasModalTenant] = useState<TenantAdminItem | null>(null)
  // Token incremental da abertura atual do modal Asaas — incrementado tanto
  // ao abrir (nova versão) quanto ao fechar (invalida qualquer requisição
  // ainda pendente da abertura anterior). Usar só o tenantId como guard não
  // basta: abrir tenant A, fechar, e abrir A de novo precisa invalidar a
  // resposta da primeira abertura mesmo sendo o mesmo tenantId. Todo loader
  // (carregarAsaas/carregarEventosAsaas/carregarCobrancas) recebe a versão
  // vigente no momento da chamada e só aplica setState se ela ainda for a
  // atual quando a resposta chegar.
  const asaasModalVersaoRef = useRef(0)
  const [asaasVinculo, setAsaasVinculo] = useState<AsaasVinculoTenant | null>(null)
  const [asaasLoading, setAsaasLoading] = useState(false)
  const [asaasError, setAsaasError] = useState<string | null>(null)
  const [criandoClienteAsaas, setCriandoClienteAsaas] = useState(false)
  const [criandoAssinaturaAsaas, setCriandoAssinaturaAsaas] = useState(false)

  // Dados de cobrança (Fase 2) — formulário próprio, salvo via PUT .../asaas/
  // billing antes de criar o customer Asaas (ver salvarBillingHandler).
  const [billingForm, setBillingForm] = useState(EMPTY_BILLING_FORM)
  const [salvandoBilling, setSalvandoBilling] = useState(false)
  const [billingSucesso, setBillingSucesso] = useState<string | null>(null)
  // Erros só aparecem depois da primeira tentativa de salvar — evita
  // "Informe o nome do responsável" já piscando assim que o modal abre com
  // o formulário vazio.
  const [billingTentouSalvar, setBillingTentouSalvar] = useState(false)
  const billingErros = validarBillingForm(billingForm)

  // Histórico de eventos Asaas do tenant selecionado (Fase 2).
  const [asaasEventos, setAsaasEventos] = useState<AsaasEventoTenant[]>([])
  const [eventosLoading, setEventosLoading] = useState(false)
  const [eventosError, setEventosError] = useState<string | null>(null)

  // Sincronização manual (Fase 2) — só busca o status atual no Asaas, nunca
  // mexe em licença/status (ver POST .../asaas/sync no backend).
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMensagem, setSyncMensagem] = useState<string | null>(null)

  // Cobranças da assinatura (Fase 3) — read-only, ver GET .../asaas/payments.
  const [cobrancas, setCobrancas] = useState<CobrancaResumo[]>([])
  const [cobrancasLoading, setCobrancasLoading] = useState(false)
  const [cobrancasError, setCobrancasError] = useState<string | null>(null)
  // true quando o Asaas tem mais cobranças além das retornadas (limite fixo
  // no backend) — só um aviso, a UI não pagina nesta fase.
  const [cobrancasTemMais, setCobrancasTemMais] = useState(false)

  // Diagnóstico de billing (Fase 4) — read-only, ver GET .../asaas/
  // diagnostico. Nunca dispara sozinho ao abrir o modal (diferente de
  // cobranças/eventos) — só sob clique explícito em "Atualizar
  // diagnóstico", porque a rota consulta o Asaas ao vivo (mais lenta que
  // as outras seções, que só leem o que já está salvo).
  const [diagnostico, setDiagnostico] = useState<DiagnosticoAsaasResposta | null>(null)
  const [diagnosticoLoading, setDiagnosticoLoading] = useState(false)
  const [diagnosticoError, setDiagnosticoError] = useState<string | null>(null)

  const [copiado, setCopiado] = useState<string | null>(null)
  const [mudandoStatus, setMudandoStatus] = useState<string | null>(null)
  // Pendura a transição de status até o usuário confirmar no ConfirmDialog
  // (ver STATUS_CONFIRM_CFG) — substitui o antigo window.confirm.
  const [confirmStatusChange, setConfirmStatusChange] = useState<{ tenant: TenantAdminItem; novoStatus: TenantStatus } | null>(null)
  // Idem, pra ativar/desativar um acesso (ver ConfirmDialog no fim do arquivo).
  const [confirmAcesso, setConfirmAcesso] = useState<AdminDoTenant | null>(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<TenantStatus | ''>('')
  const [filtroPlanoId, setFiltroPlanoId] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('')

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([get<TenantAdminItem[]>('/admin/tenants'), get<PlanoAdmin[]>('/admin/planos')])
      .then(([t, p]) => { setTenants(t); setPlanos(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const set = (key: keyof FormState, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const abrirNovo = () => {
    setEditando(null)
    const inicio = hojeISO()
    setForm({ ...EMPTY_FORM, trial_inicio: inicio, trial_fim: maisDias(inicio, DIAS_TRIAL_PADRAO) })
    setFormError(null)
    setShowForm(true)
  }

  const abrirEditar = (tenant: TenantAdminItem) => {
    setEditando(tenant)
    setForm({
      nome: tenant.nome,
      slug: tenant.slug,
      plano_id: tenant.plano_id ?? '',
      status: tenant.status,
      trial_inicio: toInputDate(tenant.trial_inicio),
      trial_fim: toInputDate(tenant.trial_fim),
      licenca_inicio: toInputDate(tenant.licenca_inicio),
      licenca_fim: toInputDate(tenant.licenca_fim),
      proxima_cobranca: toInputDate(tenant.proxima_cobranca),
      ultimo_pagamento_em: toInputDate(tenant.ultimo_pagamento_em),
      observacao_comercial: tenant.observacao_comercial ?? '',
      admin_nome: '',
      admin_email: '',
      admin_password: '',
      admin_password_confirm: '',
    })
    setFormError(null)
    setShowForm(true)
  }

  const fecharForm = () => {
    setShowForm(false)
    setEditando(null)
    setFormError(null)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()

    // Administrador inicial só é exigido ao criar — edição nunca valida nem
    // envia esses campos (ver payload abaixo).
    if (!editando) {
      if (!form.admin_nome.trim() || !form.admin_email.trim() || !form.admin_password) {
        setFormError('Preencha os dados do administrador inicial.')
        return
      }
      if (form.admin_password.length < 8) {
        setFormError('A senha do administrador precisa ter pelo menos 8 caracteres.')
        return
      }
      if (form.admin_password !== form.admin_password_confirm) {
        setFormError('A confirmação de senha não confere.')
        return
      }
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        nome: form.nome.trim(),
        slug: form.slug.trim(),
        plano_id: form.plano_id || null,
        status: form.status,
        trial_inicio: form.trial_inicio || null,
        trial_fim: form.trial_fim || null,
        licenca_inicio: form.licenca_inicio || null,
        licenca_fim: form.licenca_fim || null,
        proxima_cobranca: form.proxima_cobranca || null,
        ultimo_pagamento_em: form.ultimo_pagamento_em || null,
        observacao_comercial: form.observacao_comercial.trim() || null,
        ...(editando ? {} : {
          admin_nome: form.admin_nome.trim(),
          admin_email: form.admin_email.trim(),
          admin_password: form.admin_password,
        }),
      }
      if (editando) {
        await put(`/admin/tenants/${editando.id}`, payload)
      } else {
        await post('/admin/tenants', payload)
      }
      fecharForm()
      load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // Só abre o ConfirmDialog — a chamada de fato fica em confirmarMudarStatus,
  // disparada pelo onConfirm do modal (nunca mais window.confirm aqui).
  const pedirMudarStatus = (tenant: TenantAdminItem, novoStatus: TenantStatus) => {
    setConfirmStatusChange({ tenant, novoStatus })
  }

  const fecharConfirmStatus = () => setConfirmStatusChange(null)

  const confirmarMudarStatus = async () => {
    if (!confirmStatusChange) return
    const { tenant, novoStatus } = confirmStatusChange
    setMudandoStatus(tenant.id)
    try {
      // Preserva todos os campos de trial/licença/observação do cliente —
      // omitir qualquer um aqui faria o PUT gravar null neles (validação do
      // backend trata campo ausente como "limpar").
      await put(`/admin/tenants/${tenant.id}`, {
        nome: tenant.nome,
        slug: tenant.slug,
        plano_id: tenant.plano_id,
        status: novoStatus,
        trial_inicio: tenant.trial_inicio,
        trial_fim: tenant.trial_fim,
        licenca_inicio: tenant.licenca_inicio,
        licenca_fim: tenant.licenca_fim,
        proxima_cobranca: tenant.proxima_cobranca,
        ultimo_pagamento_em: tenant.ultimo_pagamento_em,
        observacao_comercial: tenant.observacao_comercial,
      })
      setConfirmStatusChange(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar status.')
      setConfirmStatusChange(null)
    } finally {
      setMudandoStatus(null)
    }
  }

  const carregarAcessos = (tenantId: string) => {
    setAcessosLoading(true)
    setAcessosError(null)
    get<AdminDoTenant[]>(`/admin/tenants/${tenantId}/admins`)
      .then(setAcessos)
      .catch(e => setAcessosError(e instanceof Error ? e.message : 'Erro ao carregar acessos.'))
      .finally(() => setAcessosLoading(false))
  }

  const abrirAcessos = (tenant: TenantAdminItem) => {
    setAcessosModalTenant(tenant)
    setAcessos([])
    setMostrarFormAcesso(false)
    setEditandoAcesso(null)
    carregarAcessos(tenant.id)
  }

  const fecharAcessos = () => {
    setAcessosModalTenant(null)
    setMostrarFormAcesso(false)
    setEditandoAcesso(null)
    setAcessoFormError(null)
  }

  const abrirNovoAcesso = () => {
    setEditandoAcesso(null)
    setAcessoForm(EMPTY_ACESSO_FORM)
    setAcessoFormError(null)
    setMostrarFormAcesso(true)
  }

  const abrirEditarAcesso = (acesso: AdminDoTenant) => {
    setEditandoAcesso(acesso)
    setAcessoForm({ nome: acesso.nome, email: acesso.email, senha: '', role: acesso.role })
    setAcessoFormError(null)
    setMostrarFormAcesso(true)
  }

  const fecharFormAcesso = () => {
    setMostrarFormAcesso(false)
    setEditandoAcesso(null)
    setAcessoFormError(null)
  }

  const salvarAcesso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acessosModalTenant) return
    setSalvandoAcesso(true)
    setAcessoFormError(null)
    try {
      if (editandoAcesso) {
        // ativo não muda por aqui — é a ação separada "Ativar/Desativar" na
        // linha (ver alternarAtivoAcesso) que mexe só nesse campo.
        await put(`/admin/tenants/${acessosModalTenant.id}/admins/${editandoAcesso.id}`, {
          nome: acessoForm.nome.trim(),
          role: acessoForm.role,
          ativo: editandoAcesso.ativo,
        })
      } else {
        if (!acessoForm.nome.trim() || !acessoForm.email.trim() || !acessoForm.senha) {
          setAcessoFormError('Preencha nome, e-mail e senha temporária.')
          setSalvandoAcesso(false)
          return
        }
        if (acessoForm.senha.length < 8) {
          setAcessoFormError('A senha precisa ter pelo menos 8 caracteres.')
          setSalvandoAcesso(false)
          return
        }
        await post(`/admin/tenants/${acessosModalTenant.id}/admins`, {
          nome: acessoForm.nome.trim(),
          email: acessoForm.email.trim(),
          senha: acessoForm.senha,
          role: acessoForm.role,
        })
      }
      fecharFormAcesso()
      carregarAcessos(acessosModalTenant.id)
      load()
    } catch (e) {
      setAcessoFormError(e instanceof Error ? e.message : 'Erro ao salvar acesso.')
    } finally {
      setSalvandoAcesso(false)
    }
  }

  // Só abre o ConfirmDialog — a chamada de fato fica em
  // confirmarAlternarAtivoAcesso (nunca mais window.confirm aqui).
  const pedirAlternarAtivoAcesso = (acesso: AdminDoTenant) => setConfirmAcesso(acesso)

  const fecharConfirmAcesso = () => setConfirmAcesso(null)

  const confirmarAlternarAtivoAcesso = async () => {
    if (!acessosModalTenant || !confirmAcesso) return
    setTogglingAcesso(confirmAcesso.id)
    try {
      await put(`/admin/tenants/${acessosModalTenant.id}/admins/${confirmAcesso.id}`, {
        nome: confirmAcesso.nome,
        role: confirmAcesso.role,
        ativo: !confirmAcesso.ativo,
      })
      setConfirmAcesso(null)
      carregarAcessos(acessosModalTenant.id)
    } catch (e) {
      setAcessosError(e instanceof Error ? e.message : 'Erro ao atualizar acesso.')
      setConfirmAcesso(null)
    } finally {
      setTogglingAcesso(null)
    }
  }

  const abrirResetSenha = (acesso: AdminDoTenant) => {
    setResetandoSenhaDe(acesso)
    setNovaSenha('')
    setResetError(null)
    setResetSucesso(null)
  }

  const fecharResetSenha = () => {
    setResetandoSenhaDe(null)
    setResetError(null)
    setResetSucesso(null)
  }

  const resetarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acessosModalTenant || !resetandoSenhaDe) return
    if (novaSenha.length < 8) {
      setResetError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setResetSaving(true)
    setResetError(null)
    try {
      await post(`/admin/tenants/${acessosModalTenant.id}/admins/${resetandoSenhaDe.id}/reset-password`, { nova_senha: novaSenha })
      setResetSucesso('Senha redefinida. A senha temporária deve ser enviada manualmente ao cliente. Envio automático será implementado futuramente.')
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Erro ao redefinir senha.')
    } finally {
      setResetSaving(false)
    }
  }

  const copiarPublicKey = (publicKey: string) => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopiado(publicKey)
      setTimeout(() => setCopiado(null), 1500)
    })
  }

  const carregarAsaas = (tenantId: string, versao: number) => {
    setAsaasLoading(true)
    setAsaasError(null)
    get<AsaasVinculoTenant>(`/admin/tenants/${tenantId}/asaas`)
      .then(vinculo => {
        if (asaasModalVersaoRef.current !== versao) return
        setAsaasVinculo(vinculo)
        // Reaplica a máscara em cima do que veio salvo — funciona tanto pra
        // dados já normalizados (só dígitos, ver Fase de normalização) quanto
        // pra dados antigos eventualmente salvos com pontuação (as funções
        // de máscara sempre extraem os dígitos primeiro, ver utils/mascaras.ts).
        setBillingForm({
          billing_nome_responsavel: vinculo.billing_nome_responsavel ?? '',
          billing_email: vinculo.billing_email ?? '',
          billing_cpf_cnpj: formatarCpfCnpj(vinculo.billing_cpf_cnpj ?? ''),
          billing_telefone: formatarTelefone(vinculo.billing_telefone ?? ''),
          billing_endereco: vinculo.billing_endereco ?? '',
          billing_numero: vinculo.billing_numero ?? '',
          billing_complemento: vinculo.billing_complemento ?? '',
          billing_bairro: vinculo.billing_bairro ?? '',
          billing_cidade: vinculo.billing_cidade ?? '',
          billing_estado: formatarEstado(vinculo.billing_estado ?? ''),
          billing_cep: formatarCep(vinculo.billing_cep ?? ''),
        })
      })
      .catch(e => {
        if (asaasModalVersaoRef.current !== versao) return
        setAsaasError(e instanceof Error ? e.message : 'Erro ao carregar vínculo Asaas.')
      })
      .finally(() => {
        if (asaasModalVersaoRef.current !== versao) return
        setAsaasLoading(false)
      })
  }

  const carregarEventosAsaas = (tenantId: string, versao: number) => {
    setEventosLoading(true)
    setEventosError(null)
    get<AsaasEventoTenant[]>(`/admin/tenants/${tenantId}/asaas/events`)
      .then(eventos => {
        if (asaasModalVersaoRef.current !== versao) return
        setAsaasEventos(eventos)
      })
      .catch(e => {
        if (asaasModalVersaoRef.current !== versao) return
        setEventosError(e instanceof Error ? e.message : 'Erro ao carregar eventos Asaas.')
      })
      .finally(() => {
        if (asaasModalVersaoRef.current !== versao) return
        setEventosLoading(false)
      })
  }

  const carregarCobrancas = (tenantId: string, versao: number) => {
    setCobrancasLoading(true)
    setCobrancasError(null)
    get<CobrancasAsaasResposta>(`/admin/tenants/${tenantId}/asaas/payments`)
      .then(resposta => {
        if (asaasModalVersaoRef.current !== versao) return
        setCobrancas(resposta.cobrancas)
        setCobrancasTemMais(resposta.hasMore)
      })
      .catch(e => {
        if (asaasModalVersaoRef.current !== versao) return
        setCobrancasError(e instanceof Error ? e.message : 'Erro ao carregar cobranças Asaas.')
      })
      .finally(() => {
        if (asaasModalVersaoRef.current !== versao) return
        setCobrancasLoading(false)
      })
  }

  // Diagnóstico (Fase 4) — não chamado automaticamente em abrirAsaas (ver
  // comentário no state acima); só sob clique explícito no botão da seção
  // "Situação do billing".
  const carregarDiagnostico = (tenantId: string, versao: number) => {
    setDiagnosticoLoading(true)
    setDiagnosticoError(null)
    get<DiagnosticoAsaasResposta>(`/admin/tenants/${tenantId}/asaas/diagnostico`)
      .then(resposta => {
        if (asaasModalVersaoRef.current !== versao) return
        setDiagnostico(resposta)
      })
      .catch(e => {
        if (asaasModalVersaoRef.current !== versao) return
        setDiagnosticoError(e instanceof Error ? e.message : 'Erro ao gerar diagnóstico de billing.')
      })
      .finally(() => {
        if (asaasModalVersaoRef.current !== versao) return
        setDiagnosticoLoading(false)
      })
  }

  const abrirAsaas = (tenant: TenantAdminItem) => {
    const versao = ++asaasModalVersaoRef.current
    setAsaasModalTenant(tenant)
    setAsaasVinculo(null)
    setBillingForm(EMPTY_BILLING_FORM)
    setBillingSucesso(null)
    setBillingTentouSalvar(false)
    setAsaasEventos([])
    setCobrancas([])
    setCobrancasError(null)
    setCobrancasTemMais(false)
    setDiagnostico(null)
    setDiagnosticoError(null)
    setSyncMensagem(null)
    setAsaasError(null)
    carregarAsaas(tenant.id, versao)
    carregarEventosAsaas(tenant.id, versao)
    carregarCobrancas(tenant.id, versao)
  }

  const fecharAsaas = () => {
    asaasModalVersaoRef.current++
    setAsaasModalTenant(null)
    setAsaasError(null)
  }

  const salvarBillingHandler = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!asaasModalTenant) return
    setBillingTentouSalvar(true)
    // Impede o envio quando há erro de validação (campo obrigatório vazio,
    // e-mail inválido, CEP faltando com endereço preenchido, etc.) — nunca
    // um alert(), só os erros já visíveis abaixo de cada campo.
    if (Object.keys(billingErros).length > 0) return

    setSalvandoBilling(true)
    setAsaasError(null)
    setBillingSucesso(null)
    try {
      // Enviado sempre normalizado (só dígitos em cpf_cnpj/telefone/cep,
      // e-mail em minúsculas) — a máscara é só apresentação em tela (ver
      // utils/mascaras.ts); o backend também normaliza de forma defensiva
      // (ver extrairDadosBilling em adminTenantsAsaas.ts).
      const payload = {
        billing_nome_responsavel: billingForm.billing_nome_responsavel.trim() || null,
        billing_email: normalizarEmail(billingForm.billing_email) || null,
        billing_cpf_cnpj: normalizarCpfCnpj(billingForm.billing_cpf_cnpj) || null,
        billing_telefone: normalizarTelefone(billingForm.billing_telefone) || null,
        billing_endereco: billingForm.billing_endereco.trim() || null,
        billing_numero: billingForm.billing_numero.trim() || null,
        billing_complemento: billingForm.billing_complemento.trim() || null,
        billing_bairro: billingForm.billing_bairro.trim() || null,
        billing_cidade: billingForm.billing_cidade.trim() || null,
        billing_estado: billingForm.billing_estado.trim() || null,
        billing_cep: normalizarCep(billingForm.billing_cep) || null,
      }
      const resposta = await put<AtualizarCobrancaResposta>(`/admin/tenants/${asaasModalTenant.id}/asaas/billing`, payload)
      if (resposta.asaas_sync_erro) {
        setAsaasError(`Dados salvos, mas não foi possível sincronizar com o Asaas: ${resposta.asaas_sync_erro}`)
      } else {
        setBillingSucesso('Dados de cobrança salvos.')
      }
      carregarAsaas(asaasModalTenant.id, asaasModalVersaoRef.current)
    } catch (e) {
      setAsaasError(e instanceof Error ? e.message : 'Erro ao salvar dados de cobrança.')
    } finally {
      setSalvandoBilling(false)
    }
  }

  const criarClienteAsaasHandler = async () => {
    if (!asaasModalTenant) return
    setCriandoClienteAsaas(true)
    setAsaasError(null)
    try {
      await post(`/admin/tenants/${asaasModalTenant.id}/asaas/customer`, {})
      carregarAsaas(asaasModalTenant.id, asaasModalVersaoRef.current)
      load()
    } catch (e) {
      setAsaasError(e instanceof Error ? e.message : 'Erro ao criar cliente no Asaas.')
    } finally {
      setCriandoClienteAsaas(false)
    }
  }

  const criarAssinaturaAsaasHandler = async () => {
    if (!asaasModalTenant) return
    setCriandoAssinaturaAsaas(true)
    setAsaasError(null)
    try {
      await post(`/admin/tenants/${asaasModalTenant.id}/asaas/subscription`, {})
      carregarAsaas(asaasModalTenant.id, asaasModalVersaoRef.current)
      load()
    } catch (e) {
      setAsaasError(e instanceof Error ? e.message : 'Erro ao criar assinatura no Asaas.')
    } finally {
      setCriandoAssinaturaAsaas(false)
    }
  }

  const sincronizarAsaasHandler = async () => {
    if (!asaasModalTenant) return
    setSincronizando(true)
    setAsaasError(null)
    setSyncMensagem(null)
    try {
      await post(`/admin/tenants/${asaasModalTenant.id}/asaas/sync`, {})
      setSyncMensagem('Sincronizado com o Asaas.')
      carregarAsaas(asaasModalTenant.id, asaasModalVersaoRef.current)
    } catch (e) {
      setAsaasError(e instanceof Error ? e.message : 'Erro ao sincronizar com o Asaas.')
    } finally {
      setSincronizando(false)
    }
  }

  const atualizarCobrancasHandler = () => {
    if (!asaasModalTenant) return
    carregarCobrancas(asaasModalTenant.id, asaasModalVersaoRef.current)
  }

  const atualizarDiagnosticoHandler = () => {
    if (!asaasModalTenant) return
    carregarDiagnostico(asaasModalTenant.id, asaasModalVersaoRef.current)
  }

  // Só planos ativos e comerciais (nunca "Interno (Quark)") ficam
  // oferecíveis a um cliente comum — mas o plano JÁ atribuído ao tenant em
  // edição continua na lista mesmo se hoje estiver inativo/interno (sem
  // isso, abrir "Editar" nesse tenant mostraria o select vazio/resetado só
  // por causa do filtro, perdendo a seleção real dele). Na prática só o
  // próprio tenant Quark tem plano interno — este guard existe pra nunca
  // quebrar a tela dele, não porque se espera algum cliente comum caindo
  // nesse caso.
  const planoOpcoes = [
    { value: '', label: 'Sem plano' },
    ...planos
      .filter(p => (p.ativo && !p.interno) || p.id === editando?.plano_id)
      .map(p => ({
        value: p.id,
        label: p.interno || !p.ativo ? `${p.nome} (atual)` : p.nome,
      })),
  ]
  // Filtro da tabela de Clientes continua com a lista inteira (inclui
  // inativos/interno) — um super admin pode querer localizar quem ainda
  // está num plano descontinuado, diferente do select de atribuição acima.
  const filtroPlanoOpcoes = [{ value: '', label: 'Todos' }, ...planos.map(p => ({ value: p.id, label: p.nome }))]

  // Lista já vem inteira do backend (painel interno, poucos clientes) — os
  // filtros abaixo são só client-side, sem round-trip extra pro servidor.
  const clientesFiltrados = tenants.filter(tenant => {
    if (busca.trim()) {
      const q = busca.trim().toLowerCase().replace(/^#/, '')
      const bate =
        tenant.nome.toLowerCase().includes(q) ||
        tenant.slug.toLowerCase().includes(q) ||
        String(tenant.codigo).includes(q) ||
        tenant.public_key.toLowerCase().includes(q)
      if (!bate) return false
    }
    if (filtroStatus && tenant.status !== filtroStatus) return false
    if (filtroPlanoId && tenant.plano_id !== filtroPlanoId) return false
    if (filtroSituacao && classificarSituacao(tenant) !== filtroSituacao) return false
    return true
  })

  return (
    <div className="px-4 lg:px-margin-desktop py-5">
      <AdminSaasTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-title-lg font-bold text-on-surface">Clientes</h2>
          <p className="text-body-md text-on-surface-variant mt-0.5">
            Clientes do UserPulse — venda, teste grátis e liberação de acesso.
          </p>
        </div>
        <Button
          onClick={abrirNovo}
          className="shrink-0"
          iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
        >
          Novo Cliente
        </Button>
      </div>

      {/* Filtros — tudo client-side em cima da lista já carregada (painel
          interno, poucos clientes; ver comentário de clientesFiltrados). */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-outline pointer-events-none">search</span>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, slug, código ou public key…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select value={filtroStatus} options={FILTRO_STATUS_OPCOES} onChange={v => setFiltroStatus(v as TenantStatus | '')} placeholder="Status" size="sm" />
        </div>
        <div className="w-full sm:w-44">
          <Select value={filtroPlanoId} options={filtroPlanoOpcoes} onChange={setFiltroPlanoId} placeholder="Plano" size="sm" />
        </div>
        <div className="w-full sm:w-48">
          <Select value={filtroSituacao} options={FILTRO_SITUACAO_OPCOES} onChange={v => setFiltroSituacao(v as FiltroSituacao)} placeholder="Situação" size="sm" />
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <div className="rounded-2xl border border-outline-variant overflow-x-auto">
          <table className="w-full min-w-[1200px] text-body-md">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-left text-[11px] uppercase tracking-wider text-outline">
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Plano</th>
                <th className="px-4 py-3 font-semibold">Trial até</th>
                <th className="px-4 py-3 font-semibold">Licença até</th>
                <th className="px-4 py-3 font-semibold">Próxima cobrança</th>
                <th className="px-4 py-3 font-semibold">Public key</th>
                <th className="px-4 py-3 font-semibold">Criado em</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-on-surface-variant">
                    {tenants.length === 0
                      ? 'Nenhum cliente cadastrado ainda.'
                      : 'Nenhum cliente encontrado para esses filtros.'}
                  </td>
                </tr>
              )}
              {clientesFiltrados.map(tenant => (
                <tr key={tenant.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] text-outline">#{tenant.codigo}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {tenant.nome}
                    <div className="text-[11px] text-on-surface-variant font-normal">{tenant._count.admins} admin(s)</div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.slug}</td>
                  <td className="px-4 py-3"><TenantStatusBadge status={tenant.status} /></td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.plano?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.trial_fim ? formatDate(tenant.trial_fim) : '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.licenca_fim ? formatDate(tenant.licenca_fim) : '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{tenant.proxima_cobranca ? formatDate(tenant.proxima_cobranca) : '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copiarPublicKey(tenant.public_key)}
                      title={tenant.public_key}
                      className="flex items-center gap-1.5 font-mono text-[12px] text-outline hover:text-primary transition-colors"
                    >
                      {tenant.public_key.slice(0, 8)}…
                      <span className="material-symbols-outlined text-[14px]">
                        {copiado === tenant.public_key ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{formatDateTime(tenant.criado_em)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5 flex-nowrap">
                      <button
                        onClick={() => abrirEditar(tenant)}
                        title="Editar"
                        aria-label={`Editar ${tenant.nome}`}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => abrirAcessos(tenant)}
                        title="Acessos"
                        aria-label={`Gerenciar acessos de ${tenant.nome}`}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">group</span>
                      </button>
                      <button
                        onClick={() => abrirAsaas(tenant)}
                        title="Cobrança Asaas"
                        aria-label={`Abrir cobrança Asaas de ${tenant.nome}`}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">payments</span>
                      </button>
                      {tenant.status !== 'SUSPENDED' && (
                        <button
                          onClick={() => pedirMudarStatus(tenant, 'SUSPENDED')}
                          disabled={mudandoStatus === tenant.id}
                          title="Suspender"
                          aria-label={`Suspender ${tenant.nome}`}
                          className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">pause_circle</span>
                        </button>
                      )}
                      {(tenant.status === 'SUSPENDED' || tenant.status === 'EXPIRED') && (
                        <button
                          onClick={() => pedirMudarStatus(tenant, 'ACTIVE')}
                          disabled={mudandoStatus === tenant.id}
                          title="Reativar"
                          aria-label={`Reativar ${tenant.nome}`}
                          className="p-1.5 rounded-lg text-tertiary hover:bg-tertiary/10 transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">play_circle</span>
                        </button>
                      )}
                      {tenant.status !== 'CANCELED' && (
                        <button
                          onClick={() => pedirMudarStatus(tenant, 'CANCELED')}
                          disabled={mudandoStatus === tenant.id}
                          title="Cancelar"
                          aria-label={`Cancelar ${tenant.nome}`}
                          className="p-1.5 rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">cancel</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal criar/editar tenant — largura maior (max-w-2xl, era max-w-lg) +
          header/footer fixos com só o miolo rolando, pra caber confortável
          com as 3 seções (Dados/Licença/Administrador) sem cortar o rodapé. */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">{editando ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button onClick={fecharForm} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={salvar} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {formError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{formError}</div>}

                {editando && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                    <span>Código: <strong className="text-on-surface">#{editando.codigo}</strong></span>
                    <span className="font-mono truncate">Public key: <strong className="text-on-surface">{editando.public_key}</strong></span>
                  </div>
                )}

                <div className="rounded-xl border border-outline-variant/60 p-4 space-y-4">
                  <h4 className={`${sectionHeader} flex items-center gap-1.5`}>
                    <span className="material-symbols-outlined text-[15px]">badge</span>
                    Dados do cliente
                  </h4>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                    <input
                      required
                      value={form.nome}
                      onChange={e => {
                        const nome = e.target.value
                        setForm(prev => ({ ...prev, nome, slug: editando ? prev.slug : gerarSlug(nome) }))
                      }}
                      placeholder="Ex: Clínica Acme"
                      className={field}
                    />
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Slug <span className="text-error">*</span></label>
                    <input required value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="Ex: clinica-acme" className={field} />
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant/60 p-4 space-y-4">
                  <h4 className={`${sectionHeader} flex items-center gap-1.5`}>
                    <span className="material-symbols-outlined text-[15px]">workspace_premium</span>
                    Licença
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Plano</label>
                      <Select value={form.plano_id} options={planoOpcoes} onChange={v => set('plano_id', v)} />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Status</label>
                      <Select value={form.status} options={STATUS_OPCOES} onChange={v => set('status', v)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Trial início</label>
                      <input type="date" value={form.trial_inicio} onChange={e => set('trial_inicio', e.target.value)} className={field} />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Trial fim</label>
                      <input type="date" value={form.trial_fim} onChange={e => set('trial_fim', e.target.value)} className={field} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Licença início</label>
                      <input type="date" value={form.licenca_inicio} onChange={e => set('licenca_inicio', e.target.value)} className={field} />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Licença fim</label>
                      <input type="date" value={form.licenca_fim} onChange={e => set('licenca_fim', e.target.value)} className={field} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Próxima cobrança</label>
                      <input type="date" value={form.proxima_cobranca} onChange={e => set('proxima_cobranca', e.target.value)} className={field} />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Último pagamento</label>
                      <input type="date" value={form.ultimo_pagamento_em} onChange={e => set('ultimo_pagamento_em', e.target.value)} className={field} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-md text-on-surface-variant mb-1.5">Observação comercial</label>
                    <textarea
                      value={form.observacao_comercial}
                      onChange={e => set('observacao_comercial', e.target.value)}
                      rows={2}
                      placeholder="Ex: negociando renovação, pagou via PIX direto…"
                      className={`${field} w-full`}
                    />
                  </div>
                </div>

                {!editando && (
                  <div className="rounded-xl border border-outline-variant/60 bg-primary/5 p-4 space-y-4">
                    <h4 className={`${sectionHeader} flex items-center gap-1.5`}>
                      <span className="material-symbols-outlined text-[15px]">person_add</span>
                      Administrador do cliente
                    </h4>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Nome do administrador <span className="text-error">*</span></label>
                      <input required value={form.admin_nome} onChange={e => set('admin_nome', e.target.value)} className={field} />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail do administrador <span className="text-error">*</span></label>
                      <input required type="email" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} className={field} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">Senha temporária <span className="text-error">*</span></label>
                        <input
                          required
                          minLength={8}
                          value={form.admin_password}
                          onChange={e => set('admin_password', e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          className={field}
                        />
                      </div>
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">Confirmar senha <span className="text-error">*</span></label>
                        <input
                          required
                          minLength={8}
                          value={form.admin_password_confirm}
                          onChange={e => set('admin_password_confirm', e.target.value)}
                          className={field}
                        />
                      </div>
                    </div>
                    <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                      A senha temporária deve ser enviada manualmente ao cliente. O usuário será obrigado a trocar a senha no primeiro acesso.
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-outline-variant">
                <Button type="button" onClick={fecharForm} variant="ghost">
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} size="md">
                  {saving ? 'Salvando…' : editando ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Acessos — usuários (ADMIN/EDITOR/VIEWER) DO CLIENTE. Nunca
          confundir com o painel Gestão SaaS, que é exclusivo do super admin.
          Largura maior (max-w-2xl, era max-w-xl) pra caber o formulário em
          grid 2 colunas + a descrição do papel sem apertar. */}
      {acessosModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Acessos — {acessosModalTenant.nome}</h3>
              <button onClick={fecharAcessos} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              {acessosError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{acessosError}</div>}

              {!mostrarFormAcesso && (
                <Button
                  onClick={abrirNovoAcesso}
                  iconLeft={<span className="material-symbols-outlined text-[18px]">add</span>}
                >
                  Novo acesso
                </Button>
              )}

              {mostrarFormAcesso && (
                <form onSubmit={salvarAcesso} className="rounded-xl border border-outline-variant p-4 space-y-4">
                  <h4 className={sectionHeader}>{editandoAcesso ? 'Editar acesso' : 'Novo acesso'}</h4>
                  {acessoFormError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{acessoFormError}</div>}

                  <div className={editandoAcesso ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Nome <span className="text-error">*</span></label>
                      <input
                        required
                        value={acessoForm.nome}
                        onChange={e => setAcessoForm(prev => ({ ...prev, nome: e.target.value }))}
                        className={field}
                      />
                    </div>
                    {!editandoAcesso && (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail <span className="text-error">*</span></label>
                        <input
                          required
                          type="email"
                          value={acessoForm.email}
                          onChange={e => setAcessoForm(prev => ({ ...prev, email: e.target.value }))}
                          className={field}
                        />
                      </div>
                    )}
                  </div>

                  <div className={editandoAcesso ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                    {!editandoAcesso && (
                      <div>
                        <label className="block text-label-md text-on-surface-variant mb-1.5">Senha temporária <span className="text-error">*</span></label>
                        <input
                          required
                          minLength={8}
                          value={acessoForm.senha}
                          onChange={e => setAcessoForm(prev => ({ ...prev, senha: e.target.value }))}
                          placeholder="Mínimo 8 caracteres"
                          className={field}
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Papel</label>
                      <Select
                        value={acessoForm.role}
                        options={ROLE_ACESSO_OPCOES}
                        onChange={v => setAcessoForm(prev => ({ ...prev, role: v as AdminRole }))}
                      />
                    </div>
                  </div>

                  {/* Descrição do papel selecionado — hoje só informativa (ver
                      comentário de ROLE_DESCRICAO acima): nenhum papel restringe
                      escrita de verdade ainda, isso só orienta o super admin na
                      hora de escolher. */}
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
                    <span className="material-symbols-outlined text-[16px] text-outline shrink-0 mt-0.5">info</span>
                    <p className="text-[12px] text-on-surface-variant">{ROLE_DESCRICAO[acessoForm.role as RoleAcessoCliente]}</p>
                  </div>

                  {!editandoAcesso && (
                    <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                      A senha temporária deve ser enviada manualmente ao cliente. O usuário será obrigado a trocar a senha no primeiro acesso.
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" onClick={fecharFormAcesso} variant="ghost">
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={salvandoAcesso} size="md">
                      {salvandoAcesso ? 'Salvando…' : editandoAcesso ? 'Salvar' : 'Criar acesso'}
                    </Button>
                  </div>
                </form>
              )}

              {acessosLoading && <LoadingSpinner />}

              {!acessosLoading && acessos.length === 0 && (
                <EmptyState icon="group_off" title="Nenhum acesso cadastrado para este cliente." />
              )}

              {!acessosLoading && acessos.length > 0 && (
                <div className="rounded-xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
                  {acessos.map(acesso => (
                    <div key={acesso.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-container-lowest transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-md font-semibold text-on-surface truncate">{acesso.nome}</span>
                          <RoleBadge role={acesso.role} />
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${acesso.ativo ? 'bg-tertiary/10 text-tertiary' : 'bg-outline-variant/30 text-outline'}`}>
                            {acesso.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="text-[12px] text-on-surface-variant truncate">{acesso.email}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => abrirEditarAcesso(acesso)}
                          title="Editar"
                          aria-label={`Editar acesso de ${acesso.nome}`}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => abrirResetSenha(acesso)}
                          title="Resetar senha"
                          aria-label={`Resetar senha de ${acesso.nome}`}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                        </button>
                        <button
                          onClick={() => pedirAlternarAtivoAcesso(acesso)}
                          disabled={togglingAcesso === acesso.id}
                          title={acesso.ativo ? 'Desativar' : 'Ativar'}
                          aria-label={`${acesso.ativo ? 'Desativar' : 'Ativar'} acesso de ${acesso.nome}`}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${acesso.ativo ? 'text-error hover:bg-error-container' : 'text-tertiary hover:bg-tertiary/10'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">{acesso.ativo ? 'block' : 'check_circle'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Cobrança Asaas — vínculo do tenant com o Asaas (fundação/
          sandbox, ver server/src/services/asaasClient.ts). Nunca dispara
          nada automaticamente — só reflete o vínculo salvo e os botões de
          ação manual (salvar cobrança / criar cliente / criar assinatura /
          sincronizar). Largura maior (max-w-2xl) desde a Fase 2 — cabe as
          seções de dados de cobrança e histórico de eventos sem apertar. */}
      {asaasModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Cobrança Asaas — {asaasModalTenant.nome}</h3>
              <button onClick={fecharAsaas} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-100 text-amber-900">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">science</span>
                <p className="text-[12px] font-medium">Integração em sandbox. Não usar em produção.</p>
              </div>

              {asaasError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{asaasError}</div>}
              {billingSucesso && <div className="p-3 bg-tertiary/10 text-tertiary rounded-xl text-body-md">{billingSucesso}</div>}
              {syncMensagem && <div className="p-3 bg-tertiary/10 text-tertiary rounded-xl text-body-md">{syncMensagem}</div>}

              {asaasLoading && <LoadingSpinner />}

              {!asaasLoading && asaasVinculo && (
                <div className="rounded-xl border border-outline-variant/60 p-4 space-y-3 text-body-md">
                  <div className="space-y-2">
                    <div className="flex justify-between gap-3">
                      <span className="text-on-surface-variant">Customer ID</span>
                      <span className="font-mono text-[13px] text-on-surface truncate">{asaasVinculo.asaas_customer_id ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-on-surface-variant">Subscription ID</span>
                      <span className="font-mono text-[13px] text-on-surface truncate">{asaasVinculo.asaas_subscription_id ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-on-surface-variant">Status Asaas</span>
                      <span className="text-on-surface">{asaasVinculo.asaas_status ? rotuloAsaas(ASAAS_SUBSCRIPTION_STATUS_LABEL, asaasVinculo.asaas_status) : '—'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-on-surface-variant">Última sincronização</span>
                      <span className="text-on-surface">{asaasVinculo.asaas_ultima_sincronizacao ? formatDateTime(asaasVinculo.asaas_ultima_sincronizacao) : '—'}</span>
                    </div>
                  </div>
                  {asaasVinculo.asaas_subscription_id && (
                    <div className="flex justify-end pt-1 border-t border-outline-variant/40">
                      <button
                        onClick={sincronizarAsaasHandler}
                        disabled={sincronizando}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-label-md font-bold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">sync</span>
                        {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Diagnóstico de billing (Fase 4) — read-only, nunca dispara
                  automaticamente (diferente de Cobranças/Eventos abaixo, ver
                  comentário no state), nunca cria/cancela/reembolsa nada e
                  nunca altera Tenant.status/licença/plano (ver GET .../asaas/
                  diagnostico + calcularSituacaoAsaas no backend). Só calcula
                  uma leitura da situação a partir do que o Asaas responde
                  agora, pra consulta manual do SUPER_ADMIN. */}
              {!asaasLoading && asaasVinculo && (
                <div className="rounded-xl border border-outline-variant p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={sectionHeader}>Situação do billing</h4>
                    {asaasVinculo.asaas_subscription_id && (
                      <button
                        onClick={atualizarDiagnosticoHandler}
                        disabled={diagnosticoLoading}
                        className="flex items-center gap-1 text-[12px] font-bold text-primary hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">refresh</span>
                        {diagnosticoLoading ? 'Consultando…' : 'Atualizar diagnóstico'}
                      </button>
                    )}
                  </div>

                  {!asaasVinculo.asaas_subscription_id && (
                    <p className="text-[12px] text-on-surface-variant">Crie uma assinatura Asaas para calcular o diagnóstico de billing.</p>
                  )}

                  {asaasVinculo.asaas_subscription_id && (
                    <>
                      {diagnosticoError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{diagnosticoError}</div>}
                      {diagnosticoLoading && <LoadingSpinner />}
                      {!diagnosticoLoading && !diagnosticoError && !diagnostico && (
                        <p className="text-[12px] text-on-surface-variant">Clique em "Atualizar diagnóstico" para consultar o Asaas agora.</p>
                      )}
                      {!diagnosticoLoading && diagnostico && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <SituacaoAsaasBadge decisao={diagnostico.decisao} />
                            <span className="text-[12px] text-on-surface-variant">{diagnostico.motivo}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px] pt-1 border-t border-outline-variant/40">
                            <div>
                              <span className="block text-on-surface-variant">Status da assinatura</span>
                              <span className="text-on-surface">
                                {diagnostico.statusAssinatura ? rotuloAsaas(ASAAS_SUBSCRIPTION_STATUS_LABEL, diagnostico.statusAssinatura) : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-on-surface-variant">Cobranças vencidas</span>
                              <span className="text-on-surface">{diagnostico.quantidadeCobrancasVencidas}</span>
                            </div>
                            <div>
                              <span className="block text-on-surface-variant">Consultado em</span>
                              <span className="text-on-surface">{formatDateTime(diagnostico.consultadoEm)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Dados de cobrança (Fase 2) — usados ao criar/atualizar o
                  customer no Asaas. Editável a qualquer momento, mesmo depois
                  do customer já existir (nesse caso, salvar também tenta
                  sincronizar no Asaas — ver salvarBillingHandler). */}
              {!asaasLoading && asaasVinculo && (
                <form onSubmit={salvarBillingHandler} className="rounded-xl border border-outline-variant p-4 space-y-3">
                  <h4 className={sectionHeader}>Dados de cobrança</h4>
                  <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                    Dados usados apenas para cobrança e integração Asaas.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Nome do responsável <span className="text-error">*</span></label>
                      <input
                        value={billingForm.billing_nome_responsavel}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_nome_responsavel: e.target.value }))}
                        placeholder={asaasModalTenant.nome}
                        className={field}
                      />
                      {billingTentouSalvar && billingErros.billing_nome_responsavel && (
                        <p className="text-[12px] text-error mt-1">{billingErros.billing_nome_responsavel}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">CPF/CNPJ <span className="text-error">*</span></label>
                      <input
                        value={billingForm.billing_cpf_cnpj}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_cpf_cnpj: formatarCpfCnpj(e.target.value) }))}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        className={field}
                      />
                      {billingTentouSalvar && billingErros.billing_cpf_cnpj && (
                        <p className="text-[12px] text-error mt-1">{billingErros.billing_cpf_cnpj}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail <span className="text-error">*</span></label>
                      <input
                        type="email"
                        value={billingForm.billing_email}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_email: e.target.value }))}
                        className={field}
                      />
                      {billingTentouSalvar && billingErros.billing_email && (
                        <p className="text-[12px] text-error mt-1">{billingErros.billing_email}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Telefone</label>
                      <input
                        value={billingForm.billing_telefone}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_telefone: formatarTelefone(e.target.value) }))}
                        placeholder="(00) 00000-0000"
                        inputMode="numeric"
                        className={field}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Endereço</label>
                      <input
                        value={billingForm.billing_endereco}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_endereco: e.target.value }))}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Número</label>
                      <input
                        value={billingForm.billing_numero}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_numero: e.target.value }))}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Complemento</label>
                      <input
                        value={billingForm.billing_complemento}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_complemento: e.target.value }))}
                        className={field}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Bairro</label>
                      <input
                        value={billingForm.billing_bairro}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_bairro: e.target.value }))}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">CEP</label>
                      <input
                        value={billingForm.billing_cep}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_cep: formatarCep(e.target.value) }))}
                        placeholder="00000-000"
                        inputMode="numeric"
                        className={field}
                      />
                      {billingTentouSalvar && billingErros.billing_cep && (
                        <p className="text-[12px] text-error mt-1">{billingErros.billing_cep}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Cidade</label>
                      <input
                        value={billingForm.billing_cidade}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_cidade: e.target.value }))}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-label-md text-on-surface-variant mb-1.5">Estado</label>
                      <input
                        value={billingForm.billing_estado}
                        onChange={e => setBillingForm(prev => ({ ...prev, billing_estado: formatarEstado(e.target.value) }))}
                        placeholder="UF"
                        maxLength={2}
                        className={field}
                      />
                      {billingTentouSalvar && billingErros.billing_estado && (
                        <p className="text-[12px] text-error mt-1">{billingErros.billing_estado}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={salvandoBilling} size="md">
                      {salvandoBilling ? 'Salvando…' : 'Salvar dados de cobrança'}
                    </Button>
                  </div>
                </form>
              )}

              {!asaasLoading && asaasVinculo && !asaasVinculo.asaas_customer_id && (
                <div className="rounded-xl border border-outline-variant p-4 space-y-3">
                  <h4 className={sectionHeader}>Criar cliente Asaas</h4>
                  <p className="text-[12px] text-on-surface-variant">
                    Usa os dados de cobrança salvos acima (nome e CPF/CNPJ são obrigatórios).
                  </p>
                  <div className="flex justify-end">
                    <Button
                      onClick={criarClienteAsaasHandler}
                      disabled={criandoClienteAsaas || !billingForm.billing_cpf_cnpj.trim()}
                      size="md"
                    >
                      {criandoClienteAsaas ? 'Criando…' : 'Criar cliente Asaas'}
                    </Button>
                  </div>
                </div>
              )}

              {!asaasLoading && asaasVinculo?.asaas_customer_id && !asaasVinculo.asaas_subscription_id && (
                <div className="rounded-xl border border-outline-variant p-4 space-y-3">
                  <h4 className={sectionHeader}>Criar assinatura Asaas</h4>
                  <p className="text-[12px] text-on-surface-variant">
                    Usa o plano e o valor de assinatura configurados em Gestão SaaS &gt; Planos.
                  </p>
                  <div className="flex justify-end">
                    <Button
                      onClick={criarAssinaturaAsaasHandler}
                      disabled={criandoAssinaturaAsaas}
                      size="md"
                    >
                      {criandoAssinaturaAsaas ? 'Criando…' : 'Criar assinatura Asaas'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Cobranças da assinatura (Fase 3) — read-only, nunca cria
                  pagamento nenhum dentro do UserPulse (ver GET .../asaas/
                  payments). Só renderizada quando o vínculo já carregou, pra
                  decidir entre os dois estados vazios (sem assinatura vs.
                  assinatura sem cobrança nenhuma ainda). */}
              {!asaasLoading && asaasVinculo && (
                <div className="rounded-xl border border-outline-variant p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={sectionHeader}>Cobranças</h4>
                    {asaasVinculo.asaas_subscription_id && (
                      <button
                        onClick={atualizarCobrancasHandler}
                        disabled={cobrancasLoading}
                        className="flex items-center gap-1 text-[12px] font-bold text-primary hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[14px]">refresh</span>
                        {cobrancasLoading ? 'Atualizando…' : 'Atualizar cobranças'}
                      </button>
                    )}
                  </div>

                  {!asaasVinculo.asaas_subscription_id && (
                    <p className="text-[12px] text-on-surface-variant">Crie uma assinatura Asaas para visualizar cobranças.</p>
                  )}

                  {asaasVinculo.asaas_subscription_id && (
                    <>
                      {cobrancasError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{cobrancasError}</div>}
                      {cobrancasLoading && <LoadingSpinner />}
                      {!cobrancasLoading && !cobrancasError && cobrancas.length === 0 && (
                        <p className="text-[12px] text-on-surface-variant">Nenhuma cobrança encontrada para esta assinatura.</p>
                      )}
                      {!cobrancasLoading && cobrancas.length > 0 && (
                        <div className="divide-y divide-outline-variant">
                          {cobrancas.map(cobranca => (
                            <div key={cobranca.id} className="py-2.5 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-body-md font-semibold text-on-surface">{formatarValorReais(cobranca.value)}</span>
                                <CobrancaStatusBadge status={cobranca.status} />
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-on-surface-variant mt-0.5">
                                <span>Vencimento: {formatDate(cobranca.dueDate)}</span>
                                <span>Pagamento: {cobranca.paymentDate ? formatDate(cobranca.paymentDate) : '—'}</span>
                                <span>{cobranca.billingType ? rotuloAsaas(COBRANCA_TIPO_LABEL, cobranca.billingType) : '—'}</span>
                              </div>
                              {cobranca.description && <p className="text-[11px] text-on-surface-variant mt-0.5">{cobranca.description}</p>}
                              {cobranca.invoiceUrl && (
                                <a
                                  href={cobranca.invoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[12px] font-bold text-primary hover:underline mt-1"
                                >
                                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                  Abrir cobrança
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!cobrancasLoading && cobrancasTemMais && (
                        <p className="text-[11px] text-on-surface-variant italic">
                          Mostrando só as cobranças mais recentes — há cobranças adicionais não exibidas aqui.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Histórico de eventos Asaas (Fase 2) — webhooks já recebidos
                  pra este customer/subscription (ver GET .../asaas/events). */}
              <div className="rounded-xl border border-outline-variant p-4 space-y-3">
                <h4 className={sectionHeader}>Últimos eventos</h4>
                {eventosError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{eventosError}</div>}
                {eventosLoading && <LoadingSpinner />}
                {!eventosLoading && !eventosError && asaasEventos.length === 0 && (
                  <p className="text-[12px] text-on-surface-variant">Nenhum evento Asaas recebido ainda.</p>
                )}
                {!eventosLoading && asaasEventos.length > 0 && (
                  <div className="divide-y divide-outline-variant">
                    {asaasEventos.map(evento => (
                      <div key={evento.asaas_event_id ?? `${evento.evento}-${evento.criado_em}`} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-on-surface" title={evento.evento}>{rotuloAsaas(EVENTO_ASAAS_LABEL, evento.evento)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            evento.erro
                              ? 'bg-error-container text-error'
                              : evento.processado
                                ? 'bg-tertiary/10 text-tertiary'
                                : 'bg-outline-variant/30 text-outline'
                          }`}>
                            {evento.erro ? 'Erro' : evento.processado ? 'Processado' : 'Pendente'}
                          </span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">{formatDateTime(evento.criado_em)}</p>
                        {evento.erro && <p className="text-[12px] text-error mt-1">{evento.erro}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mini-modal de reset de senha — empilhado por cima do modal de Acessos. */}
      {resetandoSenhaDe && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <h3 className="text-title-md font-bold text-on-surface">Resetar senha</h3>
              <button onClick={fecharResetSenha} title="Fechar" aria-label="Fechar" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {resetSucesso ? (
              <div className="px-5 py-4 space-y-4">
                <p className="text-body-md text-on-surface bg-tertiary/10 text-tertiary rounded-xl px-3 py-2">{resetSucesso}</p>
                <div className="flex justify-end">
                  <Button onClick={fecharResetSenha} size="md">
                    Fechar
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={resetarSenha} className="px-5 py-4 space-y-4">
                <p className="text-body-md text-on-surface-variant">{resetandoSenhaDe.email}</p>
                {resetError && <div className="p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{resetError}</div>}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-1.5">Nova senha temporária <span className="text-error">*</span></label>
                  <input
                    required
                    minLength={8}
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className={field}
                  />
                </div>
                <p className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2">
                  A senha temporária deve ser enviada manualmente ao cliente. O usuário será obrigado a trocar a senha no primeiro acesso.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" onClick={fecharResetSenha} variant="ghost">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={resetSaving} size="md">
                    {resetSaving ? 'Salvando…' : 'Redefinir senha'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ConfirmDialog padrão (ver components/ui/ConfirmDialog.tsx) — substitui
          os antigos window.confirm de suspender/cancelar/reativar cliente. */}
      {confirmStatusChange && (
        <ConfirmDialog
          title={`${STATUS_CONFIRM_CFG[confirmStatusChange.novoStatus]?.titulo ?? 'Confirmar'} "${confirmStatusChange.tenant.nome}"?`}
          description={STATUS_CONFIRM_CFG[confirmStatusChange.novoStatus]?.descricao ?? ''}
          confirmLabel={STATUS_CONFIRM_CFG[confirmStatusChange.novoStatus]?.confirmLabel ?? 'Confirmar'}
          variant={STATUS_CONFIRM_CFG[confirmStatusChange.novoStatus]?.variant ?? 'default'}
          loading={mudandoStatus === confirmStatusChange.tenant.id}
          onConfirm={confirmarMudarStatus}
          onCancel={fecharConfirmStatus}
        />
      )}

      {/* ConfirmDialog padrão pra ativar/desativar acesso — substitui a
          ausência de confirmação que existia antes (alternarAtivoAcesso
          disparava a troca direto, sem nenhum aviso). */}
      {confirmAcesso && (
        <ConfirmDialog
          title={confirmAcesso.ativo ? `Desativar acesso de "${confirmAcesso.nome}"?` : `Ativar acesso de "${confirmAcesso.nome}"?`}
          description={
            confirmAcesso.ativo
              ? 'Este usuário não conseguirá mais acessar o painel do cliente.'
              : 'Este usuário voltará a conseguir acessar o painel do cliente.'
          }
          confirmLabel={confirmAcesso.ativo ? 'Desativar' : 'Ativar'}
          variant={confirmAcesso.ativo ? 'warning' : 'default'}
          loading={togglingAcesso === confirmAcesso.id}
          onConfirm={confirmarAlternarAtivoAcesso}
          onCancel={fecharConfirmAcesso}
        />
      )}
    </div>
  )
}
