import { Request, Response } from 'express'
import { tratarWebhookAsaas } from '../services/asaasClient'

// Controller fino — toda a lógica (idempotência, mapeamento de evento,
// efeito no Tenant) vive em tratarWebhookAsaas (services/asaasClient.ts).
// Sempre 2xx quando tratarWebhookAsaas resolve (processado, duplicado ou sem
// tenant vinculado são todos "aceito" pro Asaas — só um erro inesperado leva
// a um status não-2xx, evitando reentrega infinita por eventos que nunca vão
// ter efeito nenhum, ex.: tenant não vinculado).
export async function receberWebhook(req: Request, res: Response) {
  try {
    const resultado = await tratarWebhookAsaas(req.body)
    res.status(200).json(resultado)
  } catch (err) {
    console.error('Erro ao processar webhook Asaas:', err)
    res.status(400).json({ erro: 'Não foi possível processar o webhook.' })
  }
}
