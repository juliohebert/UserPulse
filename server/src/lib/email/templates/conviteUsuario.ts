import type { EmailMessage } from '../EmailProvider'

// Dados sempre já resolvidos pelo chamador (nunca lidos de novo aqui) —
// mesma convenção de redefinirSenha.ts/boasVindas.ts. urlConvite já vem
// pronta (com o token na query string), o template nunca monta a URL
// sozinho e nunca repete o token cru fora dela.
export interface DadosConviteUsuario {
  tenantNome: string
  convidadoPorNome: string
  urlConvite: string
  validadeDias: number
}

// Sem travessão/em dash em nenhum texto (mesma regra de redefinirSenha.ts) —
// só vírgula e ponto final.
export function montarEmailConviteUsuario(destinatario: string, dados: DadosConviteUsuario): EmailMessage {
  const subject = `Convite para acessar o UserPulse (${dados.tenantNome})`

  const text = [
    `Olá.`,
    '',
    `${dados.convidadoPorNome} convidou você para acessar o UserPulse da equipe ${dados.tenantNome}.`,
    '',
    `Este link é válido por ${dados.validadeDias} dias. Depois disso, peça um novo convite.`,
    '',
    `Aceitar convite: ${dados.urlConvite}`,
    '',
    'Se você não esperava este convite, pode ignorar este e-mail com segurança.',
  ].join('\n')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;color:#0a1317;">
  <h1 style="font-size:20px;margin:0 0 16px;">Você foi convidado.</h1>
  <p style="font-size:15px;line-height:22px;margin:0 0 16px;">
    ${dados.convidadoPorNome} convidou você para acessar o UserPulse da equipe ${dados.tenantNome}.
  </p>
  <p style="margin:0 0 20px;">
    <a href="${dados.urlConvite}" style="background:#0064e0;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
      Aceitar convite
    </a>
  </p>
  <p style="font-size:14px;line-height:20px;color:#444950;margin:0 0 16px;">
    Este link é válido por ${dados.validadeDias} dias. Depois disso, peça um novo convite.
  </p>
  <p style="font-size:13px;color:#444950;margin:0;">
    Se você não esperava este convite, pode ignorar este e-mail com segurança.
  </p>
</div>`.trim()

  return { to: destinatario, subject, html, text }
}
