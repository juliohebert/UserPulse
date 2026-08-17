import type { EmailMessage } from '../EmailProvider'

// Dados sempre já resolvidos pelo chamador (nunca lidos de novo aqui) —
// mesma convenção de boasVindas.ts. urlRedefinicao já vem pronta (com o
// token na query string), o template nunca monta a URL sozinho.
export interface DadosRedefinicaoSenha {
  nomeResponsavel: string
  urlRedefinicao: string
  validadeMinutos: number
}

// Sem travessão/em dash em nenhum texto (regra explícita da tarefa) — só
// vírgula e ponto final. Nunca inclui o token cru fora da URL (não repete o
// valor em nenhum outro lugar do corpo).
export function montarEmailRedefinicaoSenha(destinatario: string, dados: DadosRedefinicaoSenha): EmailMessage {
  const subject = 'Redefinir sua senha do UserPulse'

  const text = [
    `Olá, ${dados.nomeResponsavel}.`,
    '',
    'Recebemos uma solicitação para redefinir a senha da sua conta no UserPulse.',
    '',
    `Este link é válido por ${dados.validadeMinutos} minutos. Depois disso, você precisa solicitar um novo.`,
    '',
    `Redefinir minha senha: ${dados.urlRedefinicao}`,
    '',
    'Se você não solicitou essa alteração, pode ignorar este e-mail com segurança. Sua senha continua a mesma.',
  ].join('\n')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;color:#0a1317;">
  <h1 style="font-size:20px;margin:0 0 16px;">Olá, ${dados.nomeResponsavel}.</h1>
  <p style="font-size:15px;line-height:22px;margin:0 0 16px;">
    Recebemos uma solicitação para redefinir a senha da sua conta no UserPulse.
  </p>
  <p style="margin:0 0 20px;">
    <a href="${dados.urlRedefinicao}" style="background:#0064e0;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
      Redefinir minha senha
    </a>
  </p>
  <p style="font-size:14px;line-height:20px;color:#444950;margin:0 0 16px;">
    Este link é válido por ${dados.validadeMinutos} minutos. Depois disso, você precisa solicitar um novo.
  </p>
  <p style="font-size:13px;color:#444950;margin:0;">
    Se você não solicitou essa alteração, pode ignorar este e-mail com segurança. Sua senha continua a mesma.
  </p>
</div>`.trim()

  return { to: destinatario, subject, html, text }
}
