// Abstração mínima de envio de e-mail — ResendEmailProvider (ver
// providers/ResendEmailProvider.ts) é o primeiro provider concreto. Qualquer
// outro futuro (SES, Postmark, SendGrid...) só precisa implementar esta
// interface; EmailService (e todo o resto do código, controllers inclusive)
// nunca importa um provider concreto, só esta interface.
export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

// idempotencyKey é opcional e cada provider decide se/como usa (Resend
// aceita nativamente, ver ResendEmailProvider) — providers que não suportam
// simplesmente ignoram. Identificação estável por evento+usuário, nunca um
// valor aleatório por tentativa (ver montagem em controllers/auth.ts) — sem
// isso, um retry (ex.: timeout na resposta do provider, e-mail enviado mas
// confirmação perdida) poderia duplicar o envio.
export interface EnviarOpcoes {
  idempotencyKey?: string
}

export interface EmailProvider {
  enviar(mensagem: EmailMessage, opcoes?: EnviarOpcoes): Promise<void>
}
