import { useEffect, useState } from 'react'
import { get, put, post } from '../services/api'
import type {
  SituacaoBillingResposta, SituacaoAsaasDecisao, SituacaoComercialTenant,
  AssinaturaSelfServiceResposta, PagarCobrancaResposta,
} from '../types'
import { LoadingSpinner, ErrorState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { formatDate, formatarValorReais } from '../utils/campanha'
import {
  formatarCpfCnpj, formatarTelefone, normalizarCpfCnpj, normalizarTelefone, normalizarEmail,
} from '../utils/mascaras'

// "Minha Assinatura" — Fase 5, pagamento self-service. Fora de Gestão SaaS
// (rota liberada só pra ADMIN do próprio tenant, ver RequireEscritaConfiguracao
// em App.tsx e requireEscritaConfiguracao no backend). Nunca usa Asaas
// Checkout nesta fase — todo redirecionamento é pra uma invoiceUrl que o
// backend já buscou de uma assinatura/cobrança existente (ver
// server/src/controllers/billing.ts). Esta tela NUNCA decide sozinha se a
// licença está liberada — só exibe o que o backend calculou; quem confirma
// pagamento de verdade é sempre o webhook Asaas.

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

interface BillingForm {
  billing_nome_responsavel: string
  billing_email: string
  billing_cpf_cnpj: string
  billing_telefone: string
}

const FORM_VAZIO: BillingForm = {
  billing_nome_responsavel: '', billing_email: '', billing_cpf_cnpj: '', billing_telefone: '',
}

export function MinhaAssinatura() {
  const [situacao, setSituacao] = useState<SituacaoBillingResposta | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [form, setForm] = useState<BillingForm>(FORM_VAZIO)
  const [salvandoForm, setSalvandoForm] = useState(false)
  const [formSucesso, setFormSucesso] = useState<string | null>(null)
  const [formErro, setFormErro] = useState<string | null>(null)

  const [assinando, setAssinando] = useState(false)
  const [assinaturaErro, setAssinaturaErro] = useState<string | null>(null)
  const [assinaturaResultado, setAssinaturaResultado] = useState<AssinaturaSelfServiceResposta | null>(null)

  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [pagarErro, setPagarErro] = useState<string | null>(null)

  const carregar = () => {
    setLoading(true)
    setErro(null)
    get<SituacaoBillingResposta>('/billing/situacao')
      .then(setSituacao)
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar situação de billing.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

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

  const assinar = async () => {
    setAssinando(true)
    setAssinaturaErro(null)
    setAssinaturaResultado(null)
    try {
      const resultado = await post<AssinaturaSelfServiceResposta>('/billing/assinatura', {})
      setAssinaturaResultado(resultado)
      carregar()
    } catch (e) {
      setAssinaturaErro(e instanceof Error ? e.message : 'Erro ao criar assinatura.')
    } finally {
      setAssinando(false)
    }
  }

  const pagar = async (cobrancaId: string) => {
    setPagandoId(cobrancaId)
    setPagarErro(null)
    try {
      const resultado = await post<PagarCobrancaResposta>(`/billing/cobrancas/${encodeURIComponent(cobrancaId)}/pagar`, {})
      if (resultado.invoiceUrl) window.open(resultado.invoiceUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setPagarErro(e instanceof Error ? e.message : 'Erro ao preparar pagamento.')
    } finally {
      setPagandoId(null)
    }
  }

  return (
    <>
      <div className="px-4 lg:px-margin-desktop py-5">
        <h2 className="text-title-lg font-bold text-on-surface">Minha Assinatura</h2>
        <p className="text-body-md text-on-surface-variant mt-0.5">
          Plano, valor, ciclo e situação da licença. Pague via Pix ou cartão diretamente pela página segura do Asaas.
        </p>
      </div>

      <section className="w-full px-4 lg:px-margin-desktop pt-0 pb-5 max-w-[900px] space-y-4">
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
          return (
          <>
            <div className={card}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-title-md font-bold text-on-surface">Plano</h3>
                <button
                  onClick={carregar}
                  className="flex items-center gap-1 text-[12px] font-bold text-primary hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Atualizar
                </button>
              </div>

              {situacao.plano ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-md">
                  <div>
                    <span className="block text-[12px] text-on-surface-variant">Plano</span>
                    <span className="text-on-surface font-semibold">{situacao.plano.nome}</span>
                  </div>
                  <div>
                    <span className="block text-[12px] text-on-surface-variant">Valor</span>
                    <span className="text-on-surface font-semibold">
                      {situacao.plano.valor != null ? formatarValorReais(Number(situacao.plano.valor)) : '—'}
                      {situacao.plano.ciclo && ` / ${CICLO_LABEL[situacao.plano.ciclo] ?? situacao.plano.ciclo}`}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] text-on-surface-variant">Situação comercial</span>
                    <span className="text-on-surface">{SITUACAO_COMERCIAL_LABEL[situacao.situacaoComercial]}</span>
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
              ) : (
                <p className="text-body-md text-on-surface-variant">Nenhum plano vinculado — entre em contato com o suporte.</p>
              )}
              <p className="mt-3 text-[12px] text-on-surface-variant">{situacao.motivoSituacaoAsaas}</p>
            </div>

            {/* Regularização — nunca cria cobrança nova, só libera a escolha
                do meio de pagamento numa cobrança PENDING/OVERDUE já
                existente e devolve a invoiceUrl (ver pagarCobranca no
                backend). */}
            {bloqueadoPorStatus && (
              <div className={card}>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-error shrink-0">error</span>
                  <p className="text-body-md text-on-surface">Entre em contato com o suporte para regularizar sua assinatura.</p>
                </div>
              </div>
            )}

            {!bloqueadoPorStatus && situacao.cobrancasVencidas.length > 0 && (
              <div className={card}>
                <h3 className="text-title-md font-bold text-on-surface mb-2">Cobranças vencidas</h3>
                <p className="text-[12px] text-on-surface-variant mb-3">
                  Se você paga via Pix, é esperado regularizar aqui a cada novo ciclo — no cartão, a cobrança
                  seguinte é renovada automaticamente.
                </p>
                {pagarErro && <div className="mb-3 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{pagarErro}</div>}
                <div className="divide-y divide-outline-variant">
                  {situacao.cobrancasVencidas.map(c => (
                    <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <span className="text-body-md font-semibold text-on-surface">{formatarValorReais(c.value)}</span>
                        <span className="ml-2 text-[12px] text-on-surface-variant">venceu em {formatDate(c.dueDate)}</span>
                      </div>
                      <Button size="sm" variant="danger" disabled={pagandoId === c.id} onClick={() => pagar(c.id)}>
                        {pagandoId === c.id ? 'Preparando…' : 'Pagar'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reativação self-service foi removida (correção de segurança
                pós-revisão): um tenant com assinatura INACTIVE no Asaas
                normalmente já está SUSPENDED, e hoje não existe forma
                confiável de saber se a suspensão foi manual ou causada pelo
                billing — ver bloqueioOperacaoFinanceiraSelfService em
                server/src/services/asaasClient.ts. Assinatura INACTIVA sem
                bloqueio de status (ex.: EXPIRED) já mostra a orientação de
                contato via motivoSituacaoAsaas no card "Plano" acima. */}

            {/* Nova contratação — só quando o tenant ainda não tem nenhuma
                assinatura Asaas vinculada. billingType sempre UNDEFINED no
                backend: quem escolhe Pix ou cartão é o pagador, na página
                hospedada do Asaas — nunca o UserPulse. */}
            {!bloqueadoPorStatus && !situacao.possuiAssinatura && (
              <>
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
                  <h3 className="text-title-md font-bold text-on-surface mb-2">Assinar</h3>
                  <p className="text-body-md text-on-surface-variant mb-2">
                    Você será redirecionado para a página segura do Asaas, onde escolhe entre Pix ou cartão de crédito.
                    O UserPulse nunca recebe nem armazena dados do seu cartão.
                  </p>
                  <p className="text-body-md text-on-surface-variant mb-3">
                    No cartão, as cobranças seguintes são renovadas automaticamente. No Pix, cada cobrança do
                    ciclo precisa ser paga manualmente por aqui quando vencer — a assinatura continua sendo a
                    mesma, sem precisar assinar de novo a cada mês (Pix Automático ainda não é suportado nesta versão).
                  </p>
                  {assinaturaErro && <div className="mb-3 p-3 bg-error-container text-on-error-container rounded-xl text-body-md">{assinaturaErro}</div>}
                  {assinaturaResultado && !assinaturaResultado.cobrancaDisponivel && (
                    <div className="mb-3 p-3 bg-tertiary/10 text-tertiary rounded-xl text-body-md">
                      Assinatura criada! Estamos gerando a primeira cobrança — clique em "Atualizar" acima em instantes.
                    </div>
                  )}
                  {assinaturaResultado?.invoiceUrl && (
                    <div className="mb-3">
                      <a
                        href={assinaturaResultado.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary font-bold underline"
                      >
                        Abrir página de pagamento
                      </a>
                    </div>
                  )}
                  <Button onClick={assinar} disabled={assinando}>
                    {assinando ? 'Gerando…' : 'Assinar agora'}
                  </Button>
                </div>
              </>
            )}
          </>
          )
        })()}
      </section>
    </>
  )
}
