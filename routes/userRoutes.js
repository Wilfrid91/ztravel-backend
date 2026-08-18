import express from 'express'
const router = express.Router()

import { authenticateUser } from '../middleware/authentication.js'
import { showCurrentUser } from '../controllers/userController.js'

router.route('/showMe').get(authenticateUser, showCurrentUser)

export default router
