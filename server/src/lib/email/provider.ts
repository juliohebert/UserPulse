import type { EmailProvider } from './EmailProvider'
import { ResendEmailProvider } from './providers/ResendEmailProvider'

// Ponto único de resolução de provider a partir do ambiente. EMAIL_PROVIDER
// ausente = sem provider (caminho normal de dev, nunca lança) — ver
// EmailService.ts, que trata provider null como "loga e não envia", nunca
// finge sucesso. EMAIL_PROVIDER="resend" exige RESEND_API_KEY e EMAIL_FROM;
// faltando qualquer um dos dois, LANÇA (erro de configuração, não falha de
// envio em runtime) — mesmo padrão de getSessionSecret() em lib/auth.ts
// (falha clara na inicialização, nunca um provider incompleto rodando em
// silêncio). Nunca loga a API key em nenhum branch.
export function resolverEmailProvider(): EmailProvider | null {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase()
  if (!provider) return null

  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const from = process.env.EMAIL_FROM?.trim()
    if (!apiKey || !from) {
      const faltando = [!apiKey && 'RESEND_API_KEY', !from && 'EMAIL_FROM'].filter(Boolean).join(', ')
      throw new Error(
        `EMAIL_PROVIDER=resend definido, mas faltam variáveis obrigatórias: ${faltando}. Defina no .env (ver .env.example) ou remova EMAIL_PROVIDER para desativar o envio de e-mail.`
      )
    }
    return new ResendEmailProvider(apiKey, from)
  }

  console.warn(`[email] EMAIL_PROVIDER="${provider}" não é um provider reconhecido — nenhum e-mail será enviado.`)
  return null
}
