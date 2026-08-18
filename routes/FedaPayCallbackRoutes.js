import { Router } from 'express'

import {
  fedaPaySaleCallback,
  fedaPayRefundCallback,
} from '../controllers/authorizationController.js' // N'oublie pas l'extension .js
const router = Router()
import express from 'express'

/*
import {
  saleValidator,
} from '../validators/authenticationValidator.js'

import { validate } from '../middleware/validate.js'
*/

// Middleware pour capturer le raw body
router.all('/callback/sale', fedaPaySaleCallback)
router.all('/callback/refund', fedaPayRefundCallback)

export default router
