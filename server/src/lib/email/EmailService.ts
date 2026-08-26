import type { EmailProvider, EnviarOpcoes } from './EmailProvider'
import { resolverEmailProvider } from './provider'
import { montarEmailBoasVindas, type DadosBoasVindas } from './templates/boasVindas'
import { montarEmailRedefinicaoSenha, type DadosRedefinicaoSenha } from './templates/redefinirSenha'
import { montarEmailAlertaTrial, type DadosAlertaTrial } from './templates/alertaTrial'
import { montarEmailConviteUsuario, type DadosConviteUsuario } from './templates/conviteUsuario'
import type { MarcoAlertaTrial } from '../trialAlertas'

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

  // Fase 6D (correção) — enviarBoasVindas/enviarRedefinicaoSenha resolvem
  // silenciosamente sem provider de propósito (best-effort, nunca deveriam
  // quebrar cadastro/reset). O scheduler de alertas de trial (ver
  // services/trialAlertasScheduler.ts) precisa da distinção: sem provider,
  // ele NUNCA pode marcar o alerta como ENVIADO (perderia o alerta pra
  // sempre) — precisa continuar tentando quando o provider for configurado.
  // Esta checagem síncrona deixa o caller decidir isso sem mudar o
  // comportamento dos outros dois métodos.
  get providerConfigurado(): boolean {
    return this.provider != null
  }

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

  // Fase 6D — alertas automáticos de trial (7/3/1 dias restantes e
  // vencido), disparados pelo scheduler (ver services/trialAlertasScheduler.ts).
  // Mesmo padrão dos dois métodos acima: sem provider, só loga e resolve
  // (nunca lança) — o scheduler é quem precisa checar `providerConfigurado`
  // ANTES de chamar este método pra nunca confundir "sem provider" com
  // "enviado" (ver correção de concorrência/idempotência no próprio
  // scheduler). Nunca engole o erro do provider quando ele existe (propaga
  // a rejeição, quem decide o que fazer é sempre o caller).
  async enviarAlertaTrial(destinatario: string, marco: MarcoAlertaTrial, dados: DadosAlertaTrial, opcoes?: EnviarOpcoes): Promise<void> {
    const mensagem = montarEmailAlertaTrial(destinatario, marco, dados)
    if (!this.provider) {
      console.warn(`[email] Nenhum provider configurado — alerta de trial (${marco}) NÃO enviado para ${destinatario}.`)
      return
    }
    await this.provider.enviar(mensagem, opcoes)
  }

  // Convite de acesso self-service (ver controllers/usuarios.ts) — mesmo
  // padrão best-effort de enviarBoasVindas/enviarRedefinicaoSenha: sem
  // provider, só loga e resolve (nunca lança, nunca impede a criação do
  // convite em si). Nunca loga o token, mesmo raciocínio do e-mail de
  // redefinição de senha.
  async enviarConviteUsuario(destinatario: string, dados: DadosConviteUsuario, opcoes?: EnviarOpcoes): Promise<void> {
    const mensagem = montarEmailConviteUsuario(destinatario, dados)
    if (!this.provider) {
      console.warn(`[email] Nenhum provider configurado — convite de acesso NÃO enviado para ${destinatario}.`)
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
