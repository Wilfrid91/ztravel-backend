import { Router } from 'express'
import { validateUploadedPhoto } from '../controllers/businessAppController.js'
import { validate } from '../middleware/validate.js'
import { contactValidator } from '../validators/contactValidator.js'
import multer from 'multer' // Express ne sait pas lire le FormData tout seul => utilise multer

// Multer en mémoire (pas d’écriture disque avant validation)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 Mo max
})

// Pour le formulaire de contact. Doit correspondre exactement au name de votre <input type="file"> .
//export const uploadSecure = upload.single('productPhoto')
export const uploadSecure = upload.single('productPhoto')

const router = Router()

import {
  registerGuest,
  NonAuthCustomerForm,
} from '../controllers/unAuthenticatedUser.js'

// Register
router.post('/unregister', registerGuest)
router.post(
  '/unreg-form',
  uploadSecure, // Check taille du fichier
  validateUploadedPhoto, // Check format du fichier
  contactValidator, // Regex caractères invalides
  validate,
  NonAuthCustomerForm,
) //  SoumissionFormulaire,

export default router
