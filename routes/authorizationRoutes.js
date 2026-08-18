import { Router } from 'express'
import { authenticateUser } from '../middleware/authentication.js'
import {
  momoAuthorizationRequest,
  createFedaPayTransaction,
  getRequestToPayTransactionStatus,
  getSubscriptionStatus,
  generateMomoMchtAndCustCopy,
  sendEmailToCustomer,
  checkFedaPayTransactionStatus,
  getUserPaymentData,
  getUserPrintingToken,
  printFedapayReceipt,
} from '../controllers/authorizationController.js' // N'oublie pas l'extension .js
const router = Router()
/*
import {
  saleValidator,
} from '../validators/authenticationValidator.js'

import { validate } from '../middleware/validate.js'
*/

/**
 * MTN MOMO payment
 */
router.post(
  '/collection/requestToPay',
  authenticateUser,
  momoAuthorizationRequest,
)
/**
 * GET MOMO transaction status
 */
router.get(
  '/collection/transaction/status/:referenceId',
  authenticateUser,
  getRequestToPayTransactionStatus,
)

/**
 * GET ID to print the tickets
 */
router.get(
  '/collection/transaction/status/pdf/:referenceId',
  authenticateUser,
  generateMomoMchtAndCustCopy,
)

/**
 * Get Fedapay transaction
 */
router.get(
  '/fedapay/:transactionId',
  authenticateUser,
  checkFedaPayTransactionStatus,
)

/**
 * Subscription - abonnement
 */
router.get(
  '/collection/subscription/status',
  authenticateUser,
  getSubscriptionStatus,
)

router.post(
  '/credit-card/fedapay/create',
  authenticateUser,
  createFedaPayTransaction,
)

/* Récupère les transactions quelque soit la méthode de paiement */
router.get('/users/:userId/transactions', authenticateUser, getUserPaymentData)

/* Récupère les jetons*/
router.get('/users/:userId/tokens', authenticateUser, getUserPrintingToken)

router.post('/send-email', authenticateUser, sendEmailToCustomer)

//<Print Fedapay receipt
router.post(
  '/credit-card/fedapay/print/:referenceId',
  authenticateUser,
  printFedapayReceipt,
)

export default router
