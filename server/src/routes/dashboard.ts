import { Router } from 'express'
import * as dashboard from '../controllers/dashboard'

const router = Router()

router.get('/campanhas/:id', dashboard.buscarDashboard)

export default router
