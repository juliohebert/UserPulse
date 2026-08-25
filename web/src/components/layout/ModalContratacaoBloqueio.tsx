import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { podeEscreverConfiguracao } from '../../utils/permissions'
import { get } from '../../services/api'
import type { PlanoContratavel } from '../../types'
import { LoadingSpinner, ErrorState } from '../ui/EmptyState'
import { Button } from '../ui/Button'
import { formatarValorReais } from '../../utils/campanha'

const CICLO_LABEL: Record<string, string> = {
  WEEKLY: 'semanal', BIWEEKLY: 'quinzenal', MONTHLY: 'mensal', BIMONTHLY: 'bimestral',
  QUARTERLY: 'trimestral', SEMIANNUALLY: 'semestral', YEARLY: 'anual',
}

const STORAGE_PREFIX = 'modal-bloqueio-fechada:'

// Chave por tenant+usuário (mesma convenção de sessionStorage vs
// localStorage — ver logout() em useAuth.tsx, que limpa qualquer chave com
// este prefixo) — reabre normalmente após logout+login na mesma aba, mas
// não reabre a cada navegação/reload enquanto a sessão continuar a mesma.
function chaveFechada(tenantId: string, userId: string): string {
  return `${STORAGE_PREFIX}${tenantId}:${userId}`
}

// Mesma regra de bloqueio já usada em AvisoComercial.tsx (situacao_comercial
// vindo pronto do backend, nunca recalculada aqui) — só os 2 estados em que
// o trial/licença já venceram de vez (fora da tolerância de inadimplência)
// viram modal bloqueante. suspenso/cancelado seguem só com o banner, nunca
// com esta modal (regra explícita da tarefa).
function deveExibir(tenant: { situacao_comercial: string; tolerancia_dias_restantes: number | null }): boolean {
  if (tenant.situacao_comercial === 'trial_vencido') return true
  if (tenant.situacao_comercial === 'licenca_vencida') {
    const dias = tenant.tolerancia_dias_restantes
    return dias == null || dias <= 0
  }
  return false
}

// Renderizado em Layout.tsx, acima do <Outlet />, mesmo nível de
// <AvisoComercial /> — nunca em /admin/* (Gestão SaaS) nem em
// /minha-assinatura (a própria tela de destino do CTA, não faz sentido
// bloquear ela mesma).
export function ModalContratacaoBloqueio() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [fechada, setFechada] = useState(false)

  const bloqueadaPorRota = location.pathname.startsWith('/admin') || location.pathname === '/minha-assinatura'
  const deveMostrar = Boolean(user) && !bloqueadaPorRota && deveExibir(user!.tenant)

  const chave = user ? chaveFechada(user.tenant.id, user.id) : null

  useEffect(() => {
    if (!chave) return
    try {
      setFechada(sessionStorage.getItem(chave) === '1')
    } catch {
      setFechada(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const podeVerPlanos = podeEscreverConfiguracao(user?.role)
  const [planos, setPlanos] = useState<PlanoContratavel[] | null>(null)
  const [planosLoading, setPlanosLoading] = useState(false)
  const [planosErro, setPlanosErro] = useState<string | null>(null)
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState<string | null>(null)

  useEffect(() => {
    if (!deveMostrar || fechada || !podeVerPlanos || planos !== null) return
    setPlanosLoading(true)
    setPlanosErro(null)
    get<PlanoContratavel[]>('/billing/planos-disponiveis')
      .then(setPlanos)
      .catch(e => setPlanosErro(e instanceof Error ? e.message : 'Erro ao carregar planos disponíveis.'))
      .finally(() => setPlanosLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deveMostrar, fechada, podeVerPlanos])

  const fechar = () => {
    setFechada(true)
    if (chave) {
      try { sessionStorage.setItem(chave, '1') } catch {}
    }
  }

  useEffect(() => {
    if (!deveMostrar || fechada) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deveMostrar, fechada])

  if (!deveMostrar || fechada) return null

  const situacaoTrial = user!.tenant.situacao_comercial === 'trial_vencido'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-bloqueio-title"
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 id="modal-bloqueio-title" className="text-headline-md font-bold text-on-surface">
              {situacaoTrial ? 'Seu teste grátis terminou' : 'Sua licença venceu'}
            </h3>
            <button
              type="button"
              aria-label="Fechar"
              onClick={fechar}
              className="shrink-0 text-on-surface-variant hover:text-on-surface rounded-full p-1"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
          <p className="text-body-md text-on-surface-variant mb-5">
            {situacaoTrial
              ? 'O período de teste grátis chegou ao fim. Escolha um plano para continuar usando o UserPulse.'
              : 'Sua assinatura está vencida. Regularize contratando um plano para continuar usando o UserPulse.'}
          </p>

          {podeVerPlanos ? (
            <>
              {planosLoading && <LoadingSpinner />}
              {!planosLoading && planosErro && <ErrorState message={planosErro} onRetry={() => setPlanos(null)} />}
              {!planosLoading && !planosErro && planos && planos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                  {planos.map(p => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPlanoSelecionadoId(p.id)}
                      className={`text-left p-4 rounded-xl border transition-colors ${
                        planoSelecionadoId === p.id
                          ? 'border-primary bg-primary/5'
                          : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50'
                      }`}
                    >
                      <h4 className="text-title-md font-bold text-on-surface mb-1">{p.nome}</h4>
                      <p className="text-title-md font-bold text-on-surface mb-2">
                        {p.valor != null ? formatarValorReais(Number(p.valor)) : 'Sob consulta'}
                        {p.ciclo && <span className="text-body-sm font-normal text-on-surface-variant"> / {CICLO_LABEL[p.ciclo] ?? p.ciclo}</span>}
                      </p>
                      <ul className="space-y-1 text-body-sm text-on-surface-variant">
                        <li className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-tertiary">check</span>
                          {p.limite_campanhas_ativas != null ? `${p.limite_campanhas_ativas} campanhas ativas` : 'Campanhas ilimitadas'}
                        </li>
                        <li className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-tertiary">check</span>
                          {p.limite_tours_ativos != null ? `${p.limite_tours_ativos} tours` : 'Tours ilimitados'}
                        </li>
                        {p.permite_jornadas && (
                          <li className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-tertiary">check</span>
                            {p.limite_jornadas_ativas != null ? `${p.limite_jornadas_ativas} jornadas ativas` : 'Jornadas ilimitadas'}
                          </li>
                        )}
                        {p.permite_white_label && (
                          <li className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-tertiary">check</span>
                            White label
                          </li>
                        )}
                      </ul>
                    </button>
                  ))}
                </div>
              )}
              {!planosLoading && !planosErro && planos && planos.length === 0 && (
                <p className="text-body-md text-on-surface-variant mb-5">Nenhum plano disponível para contratação no momento.</p>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  fullWidthMobile
                  disabled={!planoSelecionadoId}
                  onClick={() => {
                    fechar()
                    navigate('/minha-assinatura', { state: { planoPreselecionadoId: planoSelecionadoId } })
                  }}
                  className="sm:flex-1"
                >
                  {planoSelecionadoId
                    ? `Assinar ${planos?.find(p => p.id === planoSelecionadoId)?.nome ?? ''}`
                    : 'Assinar plano'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-body-md text-on-surface-variant">
              Fale com o administrador da sua conta para contratar um plano e continuar usando o UserPulse.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
