import { Router } from 'express'
const router = Router()
import { registerGuest } from '../controllers/unAuthenticatedUser.js'
import { authenticateUser } from '../middleware/authentication.js'

// Register
router.post('/unregister', registerGuest)

export default router
