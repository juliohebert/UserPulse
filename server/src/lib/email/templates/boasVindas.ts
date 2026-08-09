import type { EmailMessage } from '../EmailProvider'

// Dados que o template precisa — sempre valores já resolvidos pelo chamador
// (nunca lidos de novo aqui, nunca uma segunda fonte de verdade sobre plano/
// trial). Mesma convenção de "backend decide, template só formata" do resto
// do cadastro público (ver auth.ts).
export interface DadosBoasVindas {
  nomeResponsavel: string
  diasTrial: number
  limiteCampanhas: number | null
  limiteTours: number | null
  limiteJornadas: number | null
  urlProduto: string
}

function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function beneficiosTexto(dados: DadosBoasVindas): string[] {
  const itens: string[] = []
  itens.push(dados.limiteCampanhas != null ? `Até ${contagem(dados.limiteCampanhas, 'campanha', 'campanhas')} ativas` : 'Campanhas ilimitadas')
  itens.push(dados.limiteTours != null ? `${contagem(dados.limiteTours, 'tour guiado', 'tours guiados')} ativo(s)` : 'Tours guiados ilimitados')
  itens.push(dados.limiteJornadas != null ? `${contagem(dados.limiteJornadas, 'jornada', 'jornadas')} ativa(s)` : 'Jornadas ilimitadas')
  return itens
}

// Sem travessão/em dash em nenhum texto (regra explícita da tarefa) — só
// vírgula e ponto final.
export function montarEmailBoasVindas(destinatario: string, dados: DadosBoasVindas): EmailMessage {
  const subject = 'Bem-vindo ao UserPulse'
  const beneficios = beneficiosTexto(dados)

  const text = [
    `Olá, ${dados.nomeResponsavel}.`,
    '',
    'Bem-vindo ao UserPulse. Você já pode criar campanhas, tours guiados e jornadas dentro do seu produto, sem instalar nada além do widget.',
    '',
    `Seu teste grátis começou e vale por ${contagem(dados.diasTrial, 'dia', 'dias')}. Durante esse período você pode explorar:`,
    ...beneficios.map(b => `- ${b}`),
    '',
    `Acesse o UserPulse: ${dados.urlProduto}`,
    '',
    'Qualquer dúvida, é só responder este e-mail.',
  ].join('\n')

  const itensHtml = beneficios.map(b => `<li style="margin:0 0 6px;">${b}</li>`).join('')
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;color:#0a1317;">
  <h1 style="font-size:20px;margin:0 0 16px;">Olá, ${dados.nomeResponsavel}.</h1>
  <p style="font-size:15px;line-height:22px;margin:0 0 16px;">
    Bem-vindo ao UserPulse. Você já pode criar campanhas, tours guiados e jornadas dentro do seu produto,
    sem instalar nada além do widget.
  </p>
  <p style="font-size:15px;line-height:22px;margin:0 0 8px;">
    Seu teste grátis começou e vale por ${contagem(dados.diasTrial, 'dia', 'dias')}. Durante esse período você pode explorar:
  </p>
  <ul style="font-size:15px;line-height:22px;margin:0 0 24px;padding-left:20px;">${itensHtml}</ul>
  <p style="margin:0 0 24px;">
    <a href="${dados.urlProduto}" style="background:#0064e0;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
      Acessar o UserPulse
    </a>
  </p>
  <p style="font-size:13px;color:#444950;margin:0;">Qualquer dúvida, é só responder este e-mail.</p>
</div>`.trim()

  return { to: destinatario, subject, html, text }
}
