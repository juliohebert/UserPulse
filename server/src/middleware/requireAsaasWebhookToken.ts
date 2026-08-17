import { Request, Response, NextFunction } from 'express'

// Header enviado pelo Asaas em toda chamada de webhook, configurado no
// painel deles (Configurações > Webhooks > Token de autenticação) — nunca
// confundir com o header `access_token` que O SERVIDOR usa pra CHAMAR o
// Asaas (ver asaasFetch em services/asaasClient.ts). São dois segredos
// diferentes, de propósito: ASAAS_WEBHOOK_TOKEN nunca é a ASAAS_API_KEY.
const HEADER_TOKEN_WEBHOOK = 'asaas-access-token'

// Rota pública (Asaas chama server-to-server, sem sessão/cookie admin) —
// esta é a ÚNICA proteção da rota. Sem token configurado, recusa tudo (nunca
// aceita um webhook "por engano" em um ambiente sem ASAAS_WEBHOOK_TOKEN
// definido).
export function requireAsaasWebhookToken(req: Request, res: Response, next: NextFunction): void {
  const tokenConfigurado = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!tokenConfigurado) {
    console.error('ASAAS_WEBHOOK_TOKEN não configurado — recusando webhook do Asaas.')
    res.status(503).json({ erro: 'Webhook Asaas não configurado neste ambiente.' })
    return
  }

  const tokenRecebido = req.header(HEADER_TOKEN_WEBHOOK)
  if (!tokenRecebido || tokenRecebido !== tokenConfigurado) {
    res.status(401).json({ erro: 'Token de webhook inválido ou ausente.' })
    return
  }

  next()
}
