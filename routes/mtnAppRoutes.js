import { Router } from 'express'

import {
  mtnSaleCallback,
  mtnRefundCallback,
} from '../controllers/authorizationController.js' // N'oublie pas l'extension .js
const router = Router()
/*
import {
  saleValidator,
} from '../validators/authenticationValidator.js'

import { validate } from '../middleware/validate.js'
*/

router.post('/callback/sale', mtnSaleCallback)
router.post('/callback/refund', mtnRefundCallback)

export default router
