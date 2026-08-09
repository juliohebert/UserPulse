import { useLocation } from 'react-router-dom'

interface CadastroNavigationState {
  trialIniciado?: boolean
  diasTrial?: number | null
}

// Fase 6B — indicação de que o trial acabou de começar, mostrada uma única
// vez logo após o cadastro público (ver pages/Cadastro.tsx, que navega pra
// "/" com este state). Não é um estado persistido em lugar nenhum — some
// sozinho ao navegar pra qualquer outra rota (novo histórico, sem este
// state) ou ao recarregar a página, de propósito: nenhum contador/alerta
// complexo nesta fase, isso fica pra Fase de e-mails/alertas (ver
// AvisoComercial.tsx, que já cobre o aviso de vencimento próximo/vencido).
export function BoasVindasTrial() {
  const location = useLocation()
  const state = location.state as CadastroNavigationState | null
  if (!state?.trialIniciado) return null

  const dias = state.diasTrial
  const texto = dias
    ? `Seu teste grátis começou. Você tem ${dias} dia${dias === 1 ? '' : 's'} para explorar o UserPulse.`
    : 'Seu teste grátis começou. Explore o UserPulse.'

  return (
    <div className="px-4 lg:px-margin-desktop py-2.5 text-body-sm font-medium flex items-center gap-2 bg-tertiary-container text-on-tertiary-container">
      <span className="material-symbols-outlined ms-fill text-[18px] shrink-0">celebration</span>
      {texto}
    </div>
  )
}
