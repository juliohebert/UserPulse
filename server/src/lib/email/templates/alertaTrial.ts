import type { EmailMessage } from '../EmailProvider'
import type { MarcoAlertaTrial } from '../../trialAlertas'

// Dados já resolvidos pelo chamador (nunca lidos de novo aqui) — mesma
// convenção de boasVindas.ts/redefinirSenha.ts. urlAssinatura já vem pronta
// (${APP_URL}/minha-assinatura), o template nunca monta a URL sozinho.
export interface DadosAlertaTrial {
  nomeResponsavel: string
  urlAssinatura: string
}

const ASSUNTO_POR_MARCO: Record<MarcoAlertaTrial, string> = {
  D7: 'Seu teste grátis termina em 7 dias',
  D3: 'Faltam 3 dias para o fim do seu teste grátis',
  D1: 'Seu teste grátis termina amanhã',
  VENCIDO: 'Seu teste grátis terminou',
}

// Corpo específico de cada marco — sempre termina reforçando o CTA (regra
// explícita da tarefa: "Escolher um plano"). Sem travessão/em dash em
// nenhum texto (mesma regra dos outros templates), só vírgula e ponto final.
const CORPO_POR_MARCO: Record<MarcoAlertaTrial, string> = {
  D7: 'Seu teste grátis do UserPulse termina em 7 dias. Aproveite para conhecer todos os recursos antes do fim do período gratuito.',
  D3: 'Faltam 3 dias para o fim do seu teste grátis do UserPulse. Escolha um plano para continuar usando a plataforma sem interrupções.',
  D1: 'Seu teste grátis do UserPulse termina amanhã. Escolha um plano agora para continuar usando a plataforma sem interrupções.',
  VENCIDO: 'Seu teste grátis do UserPulse terminou. Escolha um plano para continuar usando a plataforma.',
}

export function montarEmailAlertaTrial(destinatario: string, marco: MarcoAlertaTrial, dados: DadosAlertaTrial): EmailMessage {
  const subject = ASSUNTO_POR_MARCO[marco]
  const corpo = CORPO_POR_MARCO[marco]

  const text = [
    `Olá, ${dados.nomeResponsavel}.`,
    '',
    corpo,
    '',
    `Escolher um plano: ${dados.urlAssinatura}`,
  ].join('\n')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;color:#0a1317;">
  <h1 style="font-size:20px;margin:0 0 16px;">Olá, ${dados.nomeResponsavel}.</h1>
  <p style="font-size:15px;line-height:22px;margin:0 0 20px;">
    ${corpo}
  </p>
  <p style="margin:0;">
    <a href="${dados.urlAssinatura}" style="background:#0064e0;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
      Escolher um plano
    </a>
  </p>
</div>`.trim()

  return { to: destinatario, subject, html, text }
}
