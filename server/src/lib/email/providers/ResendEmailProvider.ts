import { Resend } from 'resend'
import type { EmailProvider, EmailMessage, EnviarOpcoes } from '../EmailProvider'

// Único arquivo do projeto que importa o SDK do Resend — EmailService e
// qualquer controller nunca conhecem esta classe, só a interface
// EmailProvider (ver resolverEmailProvider em provider.ts, que decide
// quando instanciar isto). Não testado com chamada real ao Resend (ver
// regra explícita da tarefa) — a lógica testável (montagem do e-mail,
// resolução de configuração, propagação de falha) já está coberta em
// EmailService.test.ts/provider.test.ts/boasVindas.test.ts; esta classe é
// só o adaptador fino pro SDK, validado manualmente (ver relatório da
// tarefa pra como rodar um envio real).
export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend
  private readonly from: string

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey)
    this.from = from
  }

  async enviar(mensagem: EmailMessage, opcoes?: EnviarOpcoes): Promise<void> {
    const resultado = await this.client.emails.send(
      {
        from: this.from,
        to: mensagem.to,
        subject: mensagem.subject,
        html: mensagem.html,
        text: mensagem.text,
      },
      opcoes?.idempotencyKey ? { idempotencyKey: opcoes.idempotencyKey } : undefined
    )

    // O SDK do Resend nunca lança em erro de envio — devolve
    // { error, data: null } (ver Response<T> no pacote resend). Nunca inclui
    // a API key na resposta de erro, mas mesmo assim só repassamos
    // name/message, nunca o payload da requisição inteiro.
    if (resultado.error) {
      throw new Error(`Resend (${resultado.error.name}): ${resultado.error.message}`)
    }
  }
}
