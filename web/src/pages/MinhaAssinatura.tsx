import { useEffect, useState } from 'react'
import { get, put, post } from '../services/api'
import type {
  SituacaoBillingResposta, SituacaoAsaasDecisao, SituacaoComercialTenant,
  AssinaturaSelfServiceResposta, PagarCobrancaResposta, PlanoContratavel,
  UpgradePreviewResposta, UpgradeSolicitadoResposta, CobrancaEmAbertoResumo,
} from '../types'
import { LoadingSpinner, ErrorState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { formatDate, formatarValorReais } from '../utils/campanha'
import {
  formatarCpfCnpj, formatarTelefone, normalizarCpfCnpj, normalizarTelefone, normalizarEmail,
} from '../utils/mascaras'
import { useAuth } from '../hooks/useAuth'

// "Minha Assinatura" — Fase 5, pagamento self-service; reorganizada na Fase
// 6B pra corrigir um problema de produto: um tenant em trial via "Plano sem
// valor de assinatura configurado" e um botão "Assinar agora" tentando
// contratar o próprio teste-gratis (que nunca teve, nem deveria ter, valor
// configurado). Agora o fluxo para quem ainda não tem assinatura paga é
// sempre: situação do teste grátis, planos disponíveis pra escolher, resumo
// do escolhido, dados de cobrança, CTA. O plano escolhido é gravado como
// plano_pendente_id (ver POST /billing/assinatura) — o Tenant continua no
// plano atual até o webhook confirmar o pagamento, nunca antes disso.
//
// Fora de Gestão SaaS (rota liberada só pra ADMIN do próprio tenant, ver
// RequireEscritaConfiguracao em App.tsx e requireEscritaConfiguracao no
// backend). Nunca usa Asaas Checkout nesta fase — todo redirecionamento é
// pra uma invoiceUrl que o backend já buscou de uma assinatura/cobrança
// existente (ver server/src/controllers/billing.ts). Esta tela NUNCA decide
// sozinha se a licença está liberada, só exibe o que o backend calculou;
// quem confirma pagamento de verdade é sempre o webhook Asaas.

const card = 'w-full bg-surface-container-lowest p-5 rounded-xl border border-outline-variant shadow-sm'
const field = 'w-full bg-surface-bright border border-outline-variant rounded-lg px-3 py-2.5 text-body-md focus:outline-none focus:ring-2 focus:ring-primary'

const SITUACAO_COMERCIAL_LABEL: Record<SituacaoComercialTenant, string> = {
  trial_ativo: 'Período de teste grátis ativo',
  trial_vencido: 'Período de teste grátis vencido',
  licenca_ativa: 'Licença ativa',
  licenca_vencida: 'Licença vencida',
  suspenso: 'Conta suspensa',
  cancelado: 'Conta cancelada',
}

const SITUACAO_ASAAS_LABEL: Record<SituacaoAsaasDecisao, { label: string; className: string }> = {
  OK: { label: 'Em dia', className: 'bg-tertiary/10 text-tertiary' },
  INADIMPLENTE: { label: 'Pagamento pendente', className: 'bg-error-container text-error' },
  ASSINATURA_INATIVA: { label: 'Assinatura inativa', className: 'bg-error-container text-error' },
  INDETERMINADO: { label: 'Não foi possível confirmar', className: 'bg-outline-variant/30 text-outline' },
}

const CICLO_LABEL: Record<string, string> = {
  WEEKLY: 'semanal', BIWEEKLY: 'quinzenal', MONTHLY: 'mensal', BIMONTHLY: 'bimestral',
  QUARTERLY: 'trimestral', SEMIANNUALLY: 'semestral', YEARLY: 'anual',
}

// Correção de produto — troca de forma de pagamento pontual (só de uma
// cobrança específica, ver "Pagar com outra forma" abaixo). UNDEFINED só
// aparece aqui pra rotular cobranças antigas (nunca é uma opção de troca —
// backend rejeita, ver validarFormaPagamentoSelfService em asaasClient.ts).
const FORMA_PAGAMENTO_LABEL: Record<'CREDIT_CARD' | 'PIX' | 'BOLETO' | 'UNDEFINED', string> = {
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'Pix',
  BOLETO: 'Boleto',
  UNDEFINED: 'a definir no Asaas',
}

// Cobrança pode ter sido criada antes desta correção (billingType ausente/
// UNDEFINED) — nesse caso o seletor abre já em CREDIT_CARD (mesmo padrão
// default da primeira assinatura), nunca em UNDEFINED (backend rejeita).
function formaPagamentoValidaOuPadrao(billingType: CobrancaEmAbertoResumo['billingType']): 'CREDIT_CARD' | 'PIX' | 'BOLETO' {
  return billingType === 'CREDIT_CARD' || billingType === 'PIX' || billingType === 'BOLETO' ? billingType : 'CREDIT_CARD'
}

interface BillingForm {
  billing_nome_responsavel: string
  billing_email: string
  billing_cpf_cnpj: string
  billing_telefone: string
}

const FORM_VAZIO: BillingForm = {
  billing_nome_responsavel: '', billing_email: '', billing_cpf_cnpj: '', billing_telefone: '',
}

// Texto contextual do card de licença paga vencida, no topo da página —
// trial_ativo/trial_vencido ganharam um card próprio, mais orientado ao
// cliente (ver TrialCard abaixo), sem passar por este texto genérico.
function textoSituacao(situacaoComercial: SituacaoComercialTenant): string {
  if (situacaoComercial === 'licenca_vencida') return 'Sua licença venceu. Escolha um plano abaixo para regularizar o acesso.'
  return ''
}

// Mesmo cálculo de dias restantes já usado em AvisoComercial.tsx (duplicado
// de propósito, sem util compartilhado no projeto ainda) — nunca lido do
// backend, sempre derivado de trial_fim (já devolvido em /auth/me).
function diasRestantes(dataISO: string | null): number | null {
  if (!dataISO) return null
  return Math.ceil((new Date(dataISO).getTime() - Date.now()) / 86_400_000)
}

// Sem trailing "s" hardcoded fora daqui — só usado nos 3 números do card de
// trial abaixo. null vira "Ilimitado" (nunca um número inventado, mesma
// convenção de limite nulo = sem limite já usada em Cadastro.tsx).
function fmtLimite(n: number | null): string {
  return n != null ? String(n) : 'Ilimitado'
}

// Card de trial voltado ao cliente — nunca menciona Tenant/Asaas/termos
// técnicos (regra explícita da tarefa). Limites vêm de user.tenant.plano
// (já devolvido em /auth/me, nunca hardcoded aqui) — plano do trial é
// sempre o mesmo plano vinculado ao Tenant nesse momento (ver Fase 6A/6B).
function TrialCard({ ativo, trialFim, plano }: {
  ativo: boolean
  trialFim: string | null
  plano: { limite_campanhas_ativas: number | null; limite_tours_ativos: number | null; limite_jornadas_ativas: number | null } | null
}) {
  const dias = ativo ? diasRestantes(trialFim) : null
  return (
    <div className="w-full bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined ms-fill text-primary text-[28px] shrink-0">rocket_launch</span>
        <div>
          <h3 className="text-title-md font-bold text-on-surface">
            {ativo ? 'Seu teste grátis está ativo' : 'Seu teste grátis terminou'}
          </h3>
          <p className="text-body-md text-on-surface-variant mt-1">
            {ativo
              ? (dias != null ? (dias <= 0 ? 'Vence hoje.' : `Restam ${dias} dia${dias === 1 ? '' : 's'} para explorar o UserPulse.`) : 'Aproveite para explorar o UserPulse.')
              : 'Escolha um plano abaixo para continuar usando o UserPulse sem interrupções.'}
          </p>
        </div>
      </div>

      {plano && (
        <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-outline-variant/60">
          <div className="text-center">
            <p className="text-title-md font-bold text-on-surface">{fmtLimite(plano.limite_campanhas_ativas)}</p>
            <p className="text-label-sm text-on-surface-variant">campanhas</p>
          </div>
          <div className="text-center">
            <p className="text-title-md font-bold text-on-surface">{fmtLimite(plano.limite_tours_ativos)}</p>
            <p className="text-label-sm text-on-surface-variant">tours</p>
          </div>
          <div className="text-center">
            <p className="text-title-md font-bold text-on-surface">{fmtLimite(plano.limite_jornadas_ativas)}</p>
            <p className="text-label-sm text-on-surface-variant">jornadas</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function MinhaAssinatura() {
  const { user } = useAuth()
  const [situacao, setSituacao] = useState<SituacaoBillingResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [planos, setPlanos] = useState<PlanoContratavel[] | null>(null)
  const [planosLoading, setPlanosLoading] = useState(false)
  const [planosErro, setPlanosErro] = useState<string | null>(null)
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState<string | null>(null)
  // Correção de produto — forma de pagamento deixou de ser implícita
  // (UNDEFINED, escolhida na página do Asaas) e virou uma escolha explícita
  // aqui no UserPulse, sempre com um valor válido (CREDIT_CARD por padrão
  // — "Recomendado" — nunca fica null, então o botão "Assinar" não precisa
  // esperar seleção nenhuma). Usuário pode trocar livremente antes de
  // assinar.
  const [formaPagamento, setFormaPagamento] = useState<'CREDIT_CARD' | 'PIX' | 'BOLETO'>('CREDIT_CARD')

  const [form, setForm] = useState<BillingForm>(FORM_VAZIO)
  const [salvandoForm, setSalvandoForm] = useState(false)
  const [formSucesso, setFormSucesso] = useState<string | null>(null)
  const [formErro, setFormErro] = useState<string | null>(null)

  const [assinando, setAssinando] = useState(false)
  const [assinaturaErro, setAssinaturaErro] = useState<string | null>(null)
  const [assinaturaResultado, setAssinaturaResultado] = useState<AssinaturaSelfServiceResposta | null>(null)

  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [pagarErro, setPagarErro] = useState<string | null>(null)
  // Correção de produto — id da cobrança com o seletor "Pagar com outra
  // forma" aberto (null = nenhum, mostra só o botão "Pagar" simples com a
  // forma atual da cobrança). formaEscolhidaCobranca é só o valor do
  // seletor aberto, nunca persiste nada até o clique em "Pagar".
  const [trocandoFormaId, setTrocandoFormaId] = useState<string | null>(null)
  const [formaEscolhidaCobranca, setFormaEscolhidaCobranca] = useState<'CREDIT_CARD' | 'PIX' | 'BOLETO'>('CREDIT_CARD')

  // Fase 8A — upgrade self-service. upgradePlanoId é o plano em análise (o
  // cliente clicou "Fazer upgrade" nele); upgradePreview é sempre o
  // resultado de GET /billing/upgrade/preview pra ESSE plano — nunca um
  // valor calculado aqui (regra explícita da tarefa: nenhum cálculo
  // financeiro no frontend, o backend recalcula tudo de novo no POST
  // /billing/upgrade também, nunca confia no que a prévia devolveu).
  const [upgradePlanoId, setUpgradePlanoId] = useState<string | null>(null)
  const [upgradePreview, setUpgradePreview] = useState<UpgradePreviewResposta | null>(null)
  const [upgradePreviewLoading, setUpgradePreviewLoading] = useState(false)
  const [upgradePreviewErro, setUpgradePreviewErro] = useState<string | null>(null)
  const [upgradeConfirmando, setUpgradeConfirmando] = useState(false)
  const [upgradeErro, setUpgradeErro] = useState<string | null>(null)

  const carregar = () => {
    setLoading(true)
    setErro(null)
    get<SituacaoBillingResposta>('/billing/situacao')
      .then(setSituacao)
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar situação de billing.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  // Planos só são buscados quando de fato precisam aparecer (ver condição
  // de renderização abaixo) — evita a chamada em quem já é assinante e não
  // pode ver upgrade (ex.: suspenso/cancelado/em trial).
  const precisaEscolherPlano = Boolean(
    situacao && !situacao.planoPendente && !situacao.possuiAssinatura &&
    situacao.situacaoComercial !== 'suspenso' && situacao.situacaoComercial !== 'cancelado'
  )
  // Fase 8A — mesma lista de planos (GET /billing/planos-disponiveis) serve
  // pra escolher o primeiro plano E pra oferecer upgrade: só reaproveita os
  // planos com valor MAIOR que o atual (ver planosSuperiores abaixo) —
  // "superior" usa a mesma ordenação por valor que o backend usa em
  // validarUpgradePlano. licenca_vencida também exclui aqui (correção
  // pós-revisão) — o backend agora bloqueia upgrade fora de "em dia"
  // (tolerância/inadimplência, ver situacaoAdimplenciaTenant em
  // validarECalcularUpgrade), então nem oferece o botão nesse caso, em vez
  // de deixar o cliente cair num 403 depois de escolher um plano.
  // Correção pós-revisão 3 — situacaoComercial (licenca_fim) pode estar "em
  // dia" enquanto o Asaas já tem cobrança real vencida da assinatura
  // recorrente (situacao.situacaoAsaas, mesma fonte do badge "Pagamento
  // pendente" acima). Backend é a proteção definitiva (bloqueia com 403/503
  // de qualquer forma) — isto só evita oferecer um botão que sempre falharia.
  // Só considera 'OK' como liberado (mesmo critério fail-safe do backend:
  // INDETERMINADO — Asaas fora do ar, por exemplo — também não libera).
  const upgradeBloqueadoPorSituacaoLocal = Boolean(
    situacao && (
      !situacao.possuiAssinatura || Boolean(situacao.planoPendente) ||
      situacao.situacaoComercial === 'suspenso' || situacao.situacaoComercial === 'cancelado' ||
      situacao.situacaoComercial === 'trial_ativo' || situacao.situacaoComercial === 'trial_vencido' ||
      situacao.situacaoComercial === 'licenca_vencida'
    )
  )
  const podeVerUpgrade = Boolean(
    situacao && !upgradeBloqueadoPorSituacaoLocal && situacao.situacaoAsaas === 'OK'
  )
  const upgradeIndisponivelPorAsaas = Boolean(
    situacao && !upgradeBloqueadoPorSituacaoLocal && situacao.situacaoAsaas !== 'OK'
  )
  const planosSuperiores = (planos ?? []).filter(p => {
    if (!podeVerUpgrade || !situacao?.plano) return false
    if (p.valor == null || situacao.plano.valor == null) return false
    return Number(p.valor) > Number(situacao.plano.valor)
  })

  useEffect(() => {
    if ((!precisaEscolherPlano && !podeVerUpgrade) || planos !== null) return
    setPlanosLoading(true)
    setPlanosErro(null)
    get<PlanoContratavel[]>('/billing/planos-disponiveis')
      .then(setPlanos)
      .catch(e => setPlanosErro(e instanceof Error ? e.message : 'Erro ao carregar planos disponíveis.'))
      .finally(() => setPlanosLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precisaEscolherPlano, podeVerUpgrade])

  const salvarDadosCobranca = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvandoForm(true)
    setFormErro(null)
    setFormSucesso(null)
    try {
      await put('/billing/dados-cobranca', {
        billing_nome_responsavel: form.billing_nome_responsavel.trim() || null,
        billing_email: normalizarEmail(form.billing_email) || null,
        billing_cpf_cnpj: normalizarCpfCnpj(form.billing_cpf_cnpj) || null,
        billing_telefone: normalizarTelefone(form.billing_telefone) || null,
      })
      setFormSucesso('Dados de cobrança salvos.')
    } catch (e) {
      setFormErro(e instanceof Error ? e.message : 'Erro ao salvar dados de cobrança.')
    } finally {
      setSalvandoForm(false)
    }
  }

  // Fase 6B — plano_id é sempre o que o cliente escolheu entre os planos
  // disponíveis (nunca um valor calculado aqui); o backend recarrega o
  // Plano pelo id e ignora qualquer outro dado financeiro que viesse do
  // frontend (ver criarAssinatura em controllers/billing.ts). forma_pagamento
  // é só o enum (CREDIT_CARD/PIX) — nunca preço, nunca dado de cartão (esse
  // nunca trafega pelo UserPulse, é sempre digitado direto na página segura
  // do Asaas). Backend valida de novo (nunca confia só nesta tela).
  const assinar = async () => {
    if (!planoSelecionadoId) return
    setAssinando(true)
    setAssinaturaErro(null)
    setAssinaturaResultado(null)
    try {
      const resultado = await post<AssinaturaSelfServiceResposta>('/billing/assinatura', {
        plano_id: planoSelecionadoId,
        forma_pagamento: formaPagamento,
      })
      setAssinaturaResultado(resultado)
      carregar()
    } catch (e) {
      setAssinaturaErro(e instanceof Error ? e.message : 'Erro ao criar assinatura.')
    } finally {
      setAssinando(false)
    }
  }

  // forma_pagamento é o único dado enviado além do id na URL — nunca preço,
  // nunca dado de cartão (backend valida de novo contra a mesma allowlist,
  // nunca confia só nesta tela). Troca vale só para esta cobrança; a forma
  // padrão da assinatura nunca é alterada por aqui.
  const pagar = async (cobrancaId: string, formaPagamento: 'CREDIT_CARD' | 'PIX' | 'BOLETO') => {
    setPagandoId(cobrancaId)
    setPagarErro(null)
    try {
      const resultado = await post<PagarCobrancaResposta>(`/billing/cobrancas/${encodeURIComponent(cobrancaId)}/pagar`, {
        forma_pagamento: formaPagamento,
      })
      if (resultado.invoiceUrl) window.open(resultado.invoiceUrl, '_blank', 'noopener,noreferrer')
      setTrocandoFormaId(null)
    } catch (e) {
      setPagarErro(e instanceof Error ? e.message : 'Erro ao preparar pagamento.')
    } finally {
      setPagandoId(null)
    }
  }

  // Fase 8A — busca a prévia (GET /billing/upgrade/preview) pro plano
  // clicado; nunca calcula valor nenhum aqui, só exibe o que o backend
  // devolveu. Reaproveitada tanto no clique em "Fazer upgrade" quanto no
  // "Tentar novamente" do estado de erro.
  const buscarPreviewUpgrade = (planoId: string) => {
    setUpgradePlanoId(planoId)
    setUpgradePreview(null)
    setUpgradePreviewErro(null)
    setUpgradeErro(null)
    setUpgradePreviewLoading(true)
    get<UpgradePreviewResposta>(`/billing/upgrade/preview?plano_id=${encodeURIComponent(planoId)}`)
      .then(setUpgradePreview)
      .catch(e => setUpgradePreviewErro(e instanceof Error ? e.message : 'Erro ao calcular prévia de upgrade.'))
      .finally(() => setUpgradePreviewLoading(false))
  }

  const cancelarUpgrade = () => {
    setUpgradePlanoId(null)
    setUpgradePreview(null)
    setUpgradePreviewErro(null)
    setUpgradeErro(null)
  }

  // plano_id é o único dado enviado — valor/proporção são sempre
  // recalculados no backend a partir dele (nunca confia no que a prévia
  // devolveu, mesmo padrão de "assinar" acima).
  const confirmarUpgrade = async () => {
    if (!upgradePlanoId) return
    setUpgradeConfirmando(true)
    setUpgradeErro(null)
    try {
      const resultado = await post<UpgradeSolicitadoResposta>('/billing/upgrade', { plano_id: upgradePlanoId })
      if (resultado.invoiceUrl) window.open(resultado.invoiceUrl, '_blank', 'noopener,noreferrer')
      cancelarUpgrade()
      carregar()
    } catch (e) {
      setUpgradeErro(e instanceof Error ? e.message : 'Erro ao solicitar upgrade.')
    } finally {
      setUpgradeConfirmando(false)
    }
  }

  const planoSelecionado = planos?.find(p => p.id === planoSelecionadoId) ?? null

  return (
    <>
      <div className="px-4 lg:px-margin-desktop py-5">
        <h2 className="text-title-lg font-bold text-on-surface">Minha Assinatura</h2>
        <p className="text-body-md text-on-surface-variant mt-0.5">
          Situação do seu plano e pagamento via Pix ou cartão diretamente pela página segura do Asaas.
        </p>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-5 max-w-[1000px] space-y-4">
        {loading && <LoadingSpinner />}
        {!loading && erro && <ErrorState message={erro} onRetry={carregar} />}

        {!loading && !erro && situacao && (() => {
          // SUSPENDED/CANCELED (correção de segurança pós-revisão): backend
          // já bloqueia criarAssinatura/pagarCobranca com 403 pra esses dois
          // status (bloqueioOperacaoFinanceiraSelfService, ver
          // controllers/billing.ts) — aqui é só UX, pra nunca nem oferecer
          // um botão que vai 403. situacaoComercial 'suspenso'/'cancelado'
          // já é exatamente esse sinal (obterSituacaoComercialTenant no
          // backend deriva os dois direto de Tenant.status, sem duplicar
          // lógica aqui).
          const bloqueadoPorStatus = situacao.situacaoComercial === 'suspenso' || situacao.situacaoComercial === 'cancelado'
          const estaEmTrial = situacao.situacaoComercial === 'trial_ativo' || situacao.situacaoComercial === 'trial_vencido'
          const textoTopo = textoSituacao(situacao.situacaoComercial)

          return (
          <>
            {/* 1. Situação atual — nunca mostra "Plano sem valor de
                assinatura configurado": teste-gratis nunca teve valor, isso
                nunca foi um erro de configuração pra corrigir, é o estado
                esperado do trial. Trial ganha um card próprio, mais
                orientado ao cliente (ver TrialCard acima) — nunca menciona
                Tenant/assinatura Asaas/termos técnicos. */}
            {!bloqueadoPorStatus && estaEmTrial && (
              <TrialCard
                ativo={situacao.situacaoComercial === 'trial_ativo'}
                trialFim={user?.tenant.trial_fim ?? null}
                plano={user?.tenant.plano ?? null}
              />
            )}

            {!bloqueadoPorStatus && !estaEmTrial && (
              <div className={card}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-title-md font-bold text-on-surface">{SITUACAO_COMERCIAL_LABEL[situacao.situacaoComercial]}</h3>
                  <button
                    onClick={carregar}
                    className="flex items-center gap-1 text-[12px] font-bold text-primary hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    Atualizar
                  </button>
                </div>
                {textoTopo && <p className="text-body-md text-on-surface-variant">{textoTopo}</p>}
                {situacao.possuiAssinatura && !situacao.planoPendente && situacao.plano && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-md mt-3">
                    <div>
                      <span className="block text-[12px] text-on-surface-variant">Plano</span>
                      <span className="text-on-surface font-semibold">{situacao.plano.nome}</span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-on-surface-variant">Valor</span>
                      <span className="text-on-surface font-semibold">
                        {situacao.plano.valor != null ? formatarValorReais(Number(situacao.plano.valor)) : 'Sem custo'}
                        {situacao.plano.ciclo && ` / ${CICLO_LABEL[situacao.plano.ciclo] ?? situacao.plano.ciclo}`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[12px] text-on-surface-variant">Situação do pagamento</span>
                      <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${SITUACAO_ASAAS_LABEL[situacao.situacaoAsaas].className}`}>
                        {SITUACAO_ASAAS_LABEL[situacao.situacaoAsaas].label}
                      </span>
                    </div>
                    {situacao.proximaCobranca && (
                      <div>
                        <span className="block text-[12px] text-on-surface-variant">Próxima cobrança</span>
                        <span className="text-on-surface">{formatDate(situacao.proximaCobranca)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Correção pós-revisão 3 — upgrade indisponível só por causa da
                pendência financeira no Asaas (situação comercial local, por
                si só, permitiria). Orienta regularizar em vez de simplesmente
                esconder o upgrade sem explicação. */}
            {upgradeIndisponivelPorAsaas && (
              <p className="text-body-md text-on-surface-variant">
                Regularize sua pendência financeira para solicitar upgrade de plano.
              </p>
            )}

            {/* Fase 8A — upgrade self-service. Só aparece pra quem já é
                assinante, sem troca pendente, fora de trial/suspenso/
                cancelado, e com a situação financeira no Asaas confirmada em
                dia (podeVerUpgrade). Planos superiores vêm da MESMA lista de
                /billing/planos-disponiveis já usada pra escolher o primeiro
                plano, filtrados por valor MAIOR que o atual. */}
            {podeVerUpgrade && (
              <div>
                <h3 className="text-title-md font-bold text-on-surface mb-3">Planos superiores</h3>
                {planosLoading && <LoadingSpinner />}
                {!planosLoading && planosErro && <ErrorState message={planosErro} onRetry={() => { setPlanos(null) }} />}
                {!planosLoading && !planosErro && planosSuperiores.length === 0 && (
                  <p className="text-body-md text-on-surface-variant">Você já está no plano mais completo disponível.</p>
                )}
                {!planosLoading && !planosErro && planosSuperiores.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {planosSuperiores.map(p => (
                      <div key={p.id} className={card}>
                        <h4 className="text-title-md font-bold text-on-surface mb-1">{p.nome}</h4>
                        <p className="text-headline-md font-bold text-on-surface mb-3">
                          {p.valor != null ? formatarValorReais(Number(p.valor)) : 'Sob consulta'}
                          {p.ciclo && <span className="text-body-md font-normal text-on-surface-variant"> / {CICLO_LABEL[p.ciclo] ?? p.ciclo}</span>}
                        </p>
                        <Button size="sm" onClick={() => buscarPreviewUpgrade(p.id)} disabled={upgradePlanoId === p.id}>
                          Fazer upgrade
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {upgradePlanoId && (
                  <div className={`${card} mt-4`}>
                    <h3 className="text-title-md font-bold text-on-surface mb-2">Resumo do upgrade</h3>
                    {upgradePreviewLoading && <LoadingSpinner />}
                    {!upgradePreviewLoading && upgradePreviewErro && (
                      <ErrorState message={upgradePreviewErro} onRetry={() => buscarPreviewUpgrade(upgradePlanoId)} />
                    )}
                    {!upgradePreviewLoading && !upgradePreviewErro && upgradePreview && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-md mb-3">
                          <div>
                            <span className="block text-[12px] text-on-surface-variant">Plano atual</span>
                            <span className="text-on-surface font-semibold">
                              {upgradePreview.planoAtual?.nome ?? 'Nenhum'}
                              {upgradePreview.planoAtual?.valor != null && ` (${formatarValorReais(Number(upgradePreview.planoAtual.valor))})`}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[12px] text-on-surface-variant">Novo plano</span>
                            <span className="text-on-surface font-semibold">
                              {upgradePreview.planoNovo.nome}
                              {upgradePreview.planoNovo.valor != null && ` (${formatarValorReais(Number(upgradePreview.planoNovo.valor))})`}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[12px] text-on-surface-variant">Valor proporcional agora</span>
                            <span className="text-on-surface font-semibold">{formatarValorReais(upgradePreview.valorProporcional)}</span>
                          </div>
                          <div>
                            <span className="block text-[12px] text-on-surface-variant">Próximo ciclo (valor integral)</span>
                            <span className="text-on-surface font-semibold">
                              {upgradePreview.planoNovo.valor != null ? formatarValorReais(Number(upgradePreview.planoNovo.valor)) : 'Sob consulta'}
                              {upgradePreview.planoNovo.ciclo && ` / ${CICLO_LABEL[upgradePreview.planoNovo.ciclo] ?? upgradePreview.planoNovo.ciclo}`}
                            </span>
                          </div>
                        </div>
                        <p className="text-body-sm text-on-surface-variant mb-3">
                          Você paga agora só a diferença proporcional pelos {upgradePreview.diasRestantesCiclo}{' '}
                          dia{upgradePreview.diasRestantesCiclo === 1 ? '' : 's'} restantes do ciclo atual. A partir do
                          próximo ciclo, o valor integral do novo plano passa a ser cobrado automaticamente.
                        </p>
                        {upgradeErro && <div className="mb-3 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{upgradeErro}</div>}
                        <div className="flex gap-2">
                          <Button onClick={confirmarUpgrade} disabled={upgradeConfirmando}>
                            {upgradeConfirmando ? 'Confirmando…' : 'Confirmar upgrade'}
                          </Button>
                          <Button variant="ghost" onClick={cancelarUpgrade} disabled={upgradeConfirmando}>
                            Cancelar
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {bloqueadoPorStatus && (
              <div className={card}>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-error shrink-0">error</span>
                  <p className="text-body-md text-on-surface">Entre em contato com o suporte para regularizar sua assinatura.</p>
                </div>
              </div>
            )}

            {/* Aguardando confirmação: plano já escolhido (plano_pendente_id
                gravado), assinatura Asaas já criada, só falta o webhook
                confirmar o pagamento — nunca aplica o plano antes disso. */}
            {!bloqueadoPorStatus && situacao.planoPendente && (
              <div className={card}>
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-primary shrink-0">hourglass_top</span>
                  <div>
                    <h3 className="text-title-md font-bold text-on-surface mb-1">Aguardando confirmação do pagamento</h3>
                    <p className="text-body-md text-on-surface-variant">
                      Você escolheu o plano <span className="font-semibold text-on-surface">{situacao.planoPendente.nome}</span>
                      {situacao.planoPendente.valor != null && (
                        <> ({formatarValorReais(Number(situacao.planoPendente.valor))}
                          {situacao.planoPendente.ciclo && ` / ${CICLO_LABEL[situacao.planoPendente.ciclo] ?? situacao.planoPendente.ciclo}`})
                        </>
                      )}. Assim que o pagamento for confirmado, o plano é aplicado automaticamente.
                    </p>
                    {assinaturaResultado?.invoiceUrl && (
                      <a
                        href={assinaturaResultado.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-primary font-bold underline"
                      >
                        Abrir página de pagamento
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!bloqueadoPorStatus && !situacao.possuiAssinatura && !situacao.planoPendente && (
              <>
                {/* 2. Planos disponíveis */}
                <div>
                  <h3 className="text-title-md font-bold text-on-surface mb-3">Planos disponíveis</h3>
                  {planosLoading && <LoadingSpinner />}
                  {!planosLoading && planosErro && <ErrorState message={planosErro} onRetry={() => { setPlanos(null) }} />}
                  {!planosLoading && !planosErro && planos && planos.length === 0 && (
                    <div className="w-full bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant text-center">
                      <span className="material-symbols-outlined text-on-surface-variant text-[40px]">inventory_2</span>
                      <p className="text-body-md text-on-surface mt-2">Nenhum plano disponível para contratação no momento.</p>
                      <p className="text-body-sm text-on-surface-variant mt-1">Fale com a gente para conhecer as opções certas para você.</p>
                    </div>
                  )}
                  {!planosLoading && !planosErro && planos && planos.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Nenhum plano é destacado como "recomendado" — não
                          existe hoje um campo/regra no Plano indicando isso
                          (ver Plano em schema.prisma); inventar um critério
                          aqui divergiria da fonte de verdade no backend. */}
                      {planos.map(p => {
                        const selecionado = p.id === planoSelecionadoId
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setPlanoSelecionadoId(p.id); setFormaPagamento('CREDIT_CARD') }}
                            className={`text-left p-5 rounded-xl border-2 transition-all ${
                              selecionado
                                ? 'border-primary bg-primary/5 shadow-md'
                                : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <h4 className="text-title-md font-bold text-on-surface">{p.nome}</h4>
                              {selecionado && <span className="material-symbols-outlined ms-fill text-primary text-[22px]">check_circle</span>}
                            </div>
                            <p className="text-headline-md font-bold text-on-surface mb-1">
                              {p.valor != null ? formatarValorReais(Number(p.valor)) : 'Sob consulta'}
                              {p.ciclo && <span className="text-body-md font-normal text-on-surface-variant"> / {CICLO_LABEL[p.ciclo] ?? p.ciclo}</span>}
                            </p>
                            {p.descricao && <p className="text-body-sm text-on-surface-variant mb-3">{p.descricao}</p>}
                            <ul className="space-y-1.5 text-body-sm text-on-surface-variant">
                              <li className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-tertiary">check</span>
                                {p.limite_campanhas_ativas != null ? `${p.limite_campanhas_ativas} campanhas ativas` : 'Campanhas ilimitadas'}
                              </li>
                              <li className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] text-tertiary">check</span>
                                {p.limite_tours_ativos != null ? `${p.limite_tours_ativos} tours ativos` : 'Tours ilimitados'}
                              </li>
                              {p.permite_jornadas && (
                                <li className="flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[16px] text-tertiary">check</span>
                                  {p.limite_jornadas_ativas != null ? `${p.limite_jornadas_ativas} jornadas ativas` : 'Jornadas ilimitadas'}
                                </li>
                              )}
                              {p.permite_white_label && (
                                <li className="flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[16px] text-tertiary">check</span>
                                  White label
                                </li>
                              )}
                            </ul>
                            <div className="mt-4 pt-3 border-t border-outline-variant/60">
                              <span className={`inline-flex items-center gap-1.5 text-label-md font-bold ${selecionado ? 'text-primary' : 'text-on-surface-variant'}`}>
                                {selecionado ? (
                                  <>
                                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                    Plano selecionado
                                  </>
                                ) : (
                                  <>
                                    Escolher plano
                                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                                  </>
                                )}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 3. Resumo do plano escolhido + dados de cobrança + CTA */}
                {planoSelecionado && (
                  <>
                    <div className={card}>
                      <h3 className="text-title-md font-bold text-on-surface mb-2">Resumo</h3>
                      <p className="text-body-md text-on-surface">
                        Plano <span className="font-semibold">{planoSelecionado.nome}</span>,{' '}
                        {planoSelecionado.valor != null ? formatarValorReais(Number(planoSelecionado.valor)) : 'valor sob consulta'}
                        {planoSelecionado.ciclo && ` por ciclo ${CICLO_LABEL[planoSelecionado.ciclo] ?? planoSelecionado.ciclo}`}.
                      </p>
                    </div>

                    <form onSubmit={salvarDadosCobranca} className={card}>
                      <h3 className="text-title-md font-bold text-on-surface mb-3">Dados de cobrança</h3>
                      {formErro && <div className="mb-3 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{formErro}</div>}
                      {formSucesso && <div className="mb-3 p-3 bg-tertiary/10 text-tertiary rounded-xl text-body-md">{formSucesso}</div>}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-label-md text-on-surface-variant mb-1.5">
                            Nome do responsável <span className="text-error">*</span>
                          </label>
                          <input
                            value={form.billing_nome_responsavel}
                            onChange={e => setForm(f => ({ ...f, billing_nome_responsavel: e.target.value }))}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className="block text-label-md text-on-surface-variant mb-1.5">
                            CPF/CNPJ <span className="text-error">*</span>
                          </label>
                          <input
                            value={form.billing_cpf_cnpj}
                            onChange={e => setForm(f => ({ ...f, billing_cpf_cnpj: formatarCpfCnpj(e.target.value) }))}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className="block text-label-md text-on-surface-variant mb-1.5">E-mail</label>
                          <input
                            value={form.billing_email}
                            onChange={e => setForm(f => ({ ...f, billing_email: e.target.value }))}
                            className={field}
                          />
                        </div>
                        <div>
                          <label className="block text-label-md text-on-surface-variant mb-1.5">Telefone</label>
                          <input
                            value={form.billing_telefone}
                            onChange={e => setForm(f => ({ ...f, billing_telefone: formatarTelefone(e.target.value) }))}
                            className={field}
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <Button type="submit" size="md" disabled={salvandoForm}>
                          {salvandoForm ? 'Salvando…' : 'Salvar dados de cobrança'}
                        </Button>
                      </div>
                    </form>

                    <div className={card}>
                      <h3 className="text-title-md font-bold text-on-surface mb-2">Assinar {planoSelecionado.nome}</h3>
                      <p className="text-body-md text-on-surface-variant mb-4">
                        O pagamento é concluído na página segura do Asaas — o UserPulse nunca recebe nem armazena
                        dados do seu cartão.
                      </p>

                      <p className="text-label-md font-semibold text-on-surface mb-2">Como deseja pagar?</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <button
                          type="button"
                          onClick={() => setFormaPagamento('CREDIT_CARD')}
                          className={`relative text-left p-4 rounded-xl border-2 transition-colors ${
                            formaPagamento === 'CREDIT_CARD' ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-outline'
                          }`}
                        >
                          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase bg-tertiary/10 text-tertiary">
                            Recomendado
                          </span>
                          <span className="block text-title-md font-bold text-on-surface">Cartão de crédito</span>
                          <span className="block text-body-md text-on-surface-variant mt-1">Renovação automática</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormaPagamento('PIX')}
                          className={`text-left p-4 rounded-xl border-2 transition-colors ${
                            formaPagamento === 'PIX' ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-outline'
                          }`}
                        >
                          <span className="block text-title-md font-bold text-on-surface">Pix</span>
                          <span className="block text-body-md text-on-surface-variant mt-1">Pagamento via Pix a cada renovação</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFormaPagamento('BOLETO')}
                          className={`text-left p-4 rounded-xl border-2 transition-colors ${
                            formaPagamento === 'BOLETO' ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-outline'
                          }`}
                        >
                          <span className="block text-title-md font-bold text-on-surface">Boleto</span>
                          <span className="block text-body-md text-on-surface-variant mt-1">Pagamento via boleto a cada renovação</span>
                        </button>
                      </div>

                      {assinaturaErro && <div className="mb-3 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{assinaturaErro}</div>}
                      <Button onClick={assinar} disabled={assinando || !planoSelecionadoId}>
                        {assinando ? 'Gerando…' : `Assinar ${planoSelecionado.nome}`}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {!bloqueadoPorStatus && situacao.cobrancasEmAberto.length > 0 && (
              <div className={card}>
                <h3 className="text-title-md font-bold text-on-surface mb-2">Cobranças em aberto</h3>
                <p className="text-[12px] text-on-surface-variant mb-3">
                  Cobranças pendentes podem ser pagas antes do vencimento — não é preciso esperar vencer pra
                  trocar a forma de pagamento. Se você paga via Pix ou boleto, é esperado regularizar aqui a
                  cada novo ciclo; no cartão, a cobrança seguinte é renovada automaticamente.
                </p>
                {pagarErro && <div className="mb-3 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{pagarErro}</div>}
                <div className="divide-y divide-outline-variant">
                  {situacao.cobrancasEmAberto.map(c => (
                    <div key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <span className="text-body-md font-semibold text-on-surface">{formatarValorReais(c.value)}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                            c.status === 'OVERDUE' ? 'bg-error-container text-error' : 'bg-outline-variant/30 text-on-surface-variant'
                          }`}>
                            {c.status === 'OVERDUE' ? 'Vencida' : 'Pendente'}
                          </span>
                          <span className="ml-2 text-[12px] text-on-surface-variant">
                            {c.status === 'OVERDUE' ? 'venceu em' : 'vence em'} {formatDate(c.dueDate)}
                          </span>
                          <span className="block text-[12px] text-on-surface-variant">
                            Forma desta cobrança: {FORMA_PAGAMENTO_LABEL[c.billingType ?? 'UNDEFINED']}
                          </span>
                        </div>
                        {trocandoFormaId !== c.id && (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-[12px] text-primary font-semibold hover:underline"
                              onClick={() => { setTrocandoFormaId(c.id); setFormaEscolhidaCobranca(formaPagamentoValidaOuPadrao(c.billingType)) }}
                            >
                              Pagar com outra forma
                            </button>
                            <Button
                              size="sm" variant={c.status === 'OVERDUE' ? 'danger' : 'primary'} disabled={pagandoId === c.id}
                              onClick={() => pagar(c.id, formaPagamentoValidaOuPadrao(c.billingType))}
                            >
                              {pagandoId === c.id ? 'Preparando…' : 'Pagar'}
                            </Button>
                          </div>
                        )}
                      </div>

                      {trocandoFormaId === c.id && (
                        <div className="mt-3 p-3 bg-surface-container-lowest rounded-lg border border-outline-variant">
                          <p className="text-[12px] text-on-surface-variant mb-2">
                            Esta alteração vale somente para esta cobrança. Sua forma padrão continua sendo{' '}
                            {FORMA_PAGAMENTO_LABEL[situacao.formaPagamentoAssinatura ?? 'UNDEFINED']}.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                            {(['CREDIT_CARD', 'PIX', 'BOLETO'] as const).map(forma => (
                              <button
                                key={forma}
                                type="button"
                                onClick={() => setFormaEscolhidaCobranca(forma)}
                                className={`text-left px-3 py-2 rounded-lg border-2 text-body-md transition-colors ${
                                  formaEscolhidaCobranca === forma ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-outline'
                                }`}
                              >
                                {FORMA_PAGAMENTO_LABEL[forma]}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-3">
                            <Button size="sm" variant={c.status === 'OVERDUE' ? 'danger' : 'primary'} disabled={pagandoId === c.id} onClick={() => pagar(c.id, formaEscolhidaCobranca)}>
                              {pagandoId === c.id ? 'Preparando…' : 'Pagar'}
                            </Button>
                            <button type="button" className="text-[12px] text-on-surface-variant hover:underline" onClick={() => setTrocandoFormaId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reativação self-service foi removida (correção de segurança
                pós-revisão): um tenant com assinatura INACTIVE no Asaas
                normalmente já está SUSPENDED, e hoje não existe forma
                confiável de saber se a suspensão foi manual ou causada pelo
                billing, ver bloqueioOperacaoFinanceiraSelfService em
                server/src/services/asaasClient.ts. situacao.motivoSituacaoAsaas
                (diagnóstico técnico do backend) deixou de ser exibido nesta
                revisão — nunca fazia sentido pro cliente final, ver card de
                situação acima. */}
          </>
          )
        })()}
      </section>
    </>
  )
}
