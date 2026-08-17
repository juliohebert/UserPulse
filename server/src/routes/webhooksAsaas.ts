import { Router } from 'express'
import { requireAsaasWebhookToken } from '../middleware/requireAsaasWebhookToken'
import * as webhooksAsaas from '../controllers/webhooksAsaas'

const router = Router()

router.post('/', requireAsaasWebhookToken, webhooksAsaas.receberWebhook)

export default router
