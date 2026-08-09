import type { EmailProvider, EnviarOpcoes } from './EmailProvider'
import { resolverEmailProvider } from './provider'
import { montarEmailBoasVindas, type DadosBoasVindas } from './templates/boasVindas'
import { montarEmailRedefinicaoSenha, type DadosRedefinicaoSenha } from './templates/redefinirSenha'

// Camada de negócio: sabe qual template usar pra cada evento, nunca chama um
// provider HTTP diretamente de um controller (regra explícita da tarefa —
// "não espalhar envio direto em controller"). provider null (nenhum
// configurado, ver provider.ts) nunca lança nem finge sucesso: só loga e
// segue sem enviar. Quem chama (ex.: controllers/auth.ts) trata o envio como
// best-effort — falha/ausência de e-mail nunca impede o cadastro/pedido de
// redefinição em si; esta classe NUNCA engole o erro do provider sozinha
// (propaga a rejeição), quem decide não deixar isso quebrar o fluxo é
// sempre o caller, via .catch(). Nenhum log aqui (nem no aviso de "sem
// provider") imprime o corpo do e-mail — o de redefinição de senha carrega
// o token na URL, e o token nunca pode aparecer em log nenhum.
export class EmailService {
  constructor(private readonly provider: EmailProvider | null) {}

  async enviarBoasVindas(destinatario: string, dados: DadosBoasVindas, opcoes?: EnviarOpcoes): Promise<void> {
    const mensagem = montarEmailBoasVindas(destinatario, dados)
    if (!this.provider) {
      console.warn(`[email] Nenhum provider configurado — e-mail de boas-vindas NÃO enviado para ${destinatario}.`)
      return
    }
    await this.provider.enviar(mensagem, opcoes)
  }

  async enviarRedefinicaoSenha(destinatario: string, dados: DadosRedefinicaoSenha, opcoes?: EnviarOpcoes): Promise<void> {
    const mensagem = montarEmailRedefinicaoSenha(destinatario, dados)
    if (!this.provider) {
      console.warn(`[email] Nenhum provider configurado — e-mail de redefinição de senha NÃO enviado para ${destinatario}.`)
      return
    }
    await this.provider.enviar(mensagem, opcoes)
  }
}

// Mesmo padrão de falha de configuração que getSessionSecret() usa pro
// segredo de sessão (ver index.ts): EMAIL_PROVIDER=resend sem
// RESEND_API_KEY/EMAIL_FROM é erro de CONFIGURAÇÃO (nunca envia
// silenciosamente incompleto) — falha aqui, na inicialização do módulo
// (carregado a partir de controllers/auth.ts, portanto antes do servidor
// aceitar requisições), com mensagem clara, derrubando o processo. Ausência
// de EMAIL_PROVIDER continua sendo o caminho "sem provider" normal
// (resolverEmailProvider não lança nesse caso).
let providerResolvido: EmailProvider | null
try {
  providerResolvido = resolverEmailProvider()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

export const emailService = new EmailService(providerResolvido)
