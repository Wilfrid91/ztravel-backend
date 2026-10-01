import { Router } from 'express'
import {
  authenticateUser,
  authorizeRoles,
  optionalAuthenticateUser,
} from '../middleware/authentication.js'
import {
  login,
  logout,
  register,
  verifyEmail,
} from '../controllers/userAuthentication.js'

import {
  adminDashboard,
  getUserBySearch,
  getAllPaymentData,
  refundMomoMTN,
  getRefundMomoMTNStatus,
  printRefundReceipt,
  refundFedaPay,
  getAllRefundData,
  getRefundFedapayStatus,
  disableUser,
  checkUserCgu,
  getVisitTracker,
} from '../controllers/adminController.js'

import {
  loginValidator,
  registerValidator,
  verifyEmailValidator,
} from '../validators/authenticationValidator.js'

import { validate } from '../middleware/validate.js'

import { loginLimiter, registerLimiter } from '../middleware/rateLimiter.js'

import { trackVisit } from '../middleware/trackVisit.js'

const router = Router()

// Register
router.post('/register', registerLimiter, registerValidator, validate, register)

// Login
router.post('/login', loginLimiter, loginValidator, validate, login)

// Logout
router.delete('/logout', authenticateUser, logout)

// Verify email
router.post('/verify-email', verifyEmailValidator, validate, verifyEmail)

/**
 * Enregistrer une visite
 * /track doit accepter un visiteur non connecté, alors que /admin/tracker doit être réservé à l'admin.
 *  path => /api/v1/auth/track
 */
console.log('TRACK ROUTE REGISTERED')
router.post('/track', optionalAuthenticateUser, trackVisit)

router.post('/track', (req, res) => {
  console.log('===== TRACK ROUTE REÇUE =====')
  console.log('BODY:', req.body)
  console.log('HEADERS:', req.headers)

  res.status(200).json({
    success: true,
    message: 'TRACK fonctionne',
  })
})

// Used to access admin page
router.get(
  '/admin/users',
  authenticateUser,
  authorizeRoles('admin'),
  adminDashboard,
)

router.get(
  '/admin/user',
  authenticateUser,
  authorizeRoles('admin'),
  getUserBySearch,
)

// get all transactions including momo and Fedapay
router.get(
  '/admin/transactions',
  authenticateUser,
  authorizeRoles('admin'),
  getAllPaymentData,
)

// get momo and Fedapay refund
router.get(
  '/admin/refund',
  authenticateUser,
  authorizeRoles('admin'),
  getAllRefundData,
)

router.get(
  '/admin/user/cgu',
  authenticateUser,
  authorizeRoles('admin'),
  checkUserCgu,
)

// POST momo refund data
router.post(
  '/admin/disbursement/refund/mtn-momo',
  authenticateUser,
  authorizeRoles('admin'),
  refundMomoMTN,
)

/**
 * GET MOMO transaction status
 */
router.get(
  '/admin/disbursement/status/:refundReferenceId',
  authenticateUser,
  authorizeRoles('admin'),
  getRefundMomoMTNStatus,
)

router.get(
  '/admin/disbursement/status/pdf/:refundReferenceId',
  authenticateUser,
  authorizeRoles('admin'),
  printRefundReceipt,
)

// POST Fedapay refund data
router.post(
  '/admin/refund/fedapay',
  authenticateUser,
  authorizeRoles('admin'),
  refundFedaPay,
)

// Get Fedapay refund status
router.get(
  '/admin/refund/fedapay/status/:payoutId',
  authenticateUser,
  authorizeRoles('admin'),
  getRefundFedapayStatus,
)

/**
 * Consulter les visites — ADMIN uniquement
 * path => /api/v1/auth/admin/tracker
 */
router.get(
  '/admin/tracker',
  authenticateUser,
  authorizeRoles('admin'),
  getVisitTracker,
)

// Disable user
router.delete(
  '/admin/disable/:selectedId',
  authenticateUser,
  authorizeRoles('admin'),
  disableUser,
)

export default router
