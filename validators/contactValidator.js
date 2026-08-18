import { body } from 'express-validator'

export const contactValidator = [
  // NOM
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/)
    .withMessage('Le nom contient des caractères invalides'),

  // EMAIL
  body('email')
    .trim()
    .notEmpty()
    .withMessage('L’email est requis')
    .isEmail()
    .withMessage('Veuillez fournir un email valide')
    .isLength({ max: 100 })
    .withMessage('L’email ne doit pas dépasser 100 caractères')
    .normalizeEmail(),

  // TÉLÉPHONE
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Le numéro de téléphone est requis')
    .isLength({ min: 6, max: 15 })
    .withMessage('Le numéro doit contenir entre 6 et 15 chiffres')
    .matches(/^[0-9+\s-]+$/)
    .withMessage('Le numéro contient des caractères invalides'),

  // MESSAGE
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Le message est requis')
    .isLength({ min: 10, max: 500 })
    .withMessage('Le message doit contenir entre 10 et 500 caractères'),

  // CAPTCHA
  body('g-recaptcha-response').notEmpty().withMessage('Captcha manquant'),

  // PHOTO (optionnelle)
  body('productPhoto').custom((value, { req }) => {
    if (!req.file) return true // pas de fichier → OK
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(req.file.mimetype)) {
      throw new Error('Le fichier doit être une image (jpg, png, webp)')
    }
    if (req.file.size > 2 * 1024 * 1024) {
      throw new Error('La photo ne doit pas dépasser 2 Mo')
    }
    return true
  }),
]
