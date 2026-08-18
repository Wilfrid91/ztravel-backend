import { Router } from 'express'
import {
  authenticateUser,
  authorizeRoles,
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
} from '../controllers/adminController.js'

import {
  loginValidator,
  registerValidator,
  verifyEmailValidator,
} from '../validators/authenticationValidator.js'

import { validate } from '../middleware/validate.js'

import { loginLimiter, registerLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Register
router.post('/register', registerLimiter, registerValidator, validate, register)

// Login
router.post('/login', loginLimiter, loginValidator, validate, login)

// Logout
router.delete('/logout', authenticateUser, logout)

// Verify email
router.post('/verify-email', verifyEmailValidator, validate, verifyEmail)

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

// get momo and Fedapay transactions
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

// Disable user
router.delete(
  '/admin/disable/:selectedId',
  authenticateUser,
  authorizeRoles('admin'),
  disableUser,
)

export default router
