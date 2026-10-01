// validators/productValidator.js
import { body } from 'express-validator'

const toFloat = (v) => {
  if (v === undefined || v === null) return 0
  const parsed = parseFloat(v)
  return isNaN(parsed) ? 0 : parsed
}

const toInt = (v) => {
  if (v === undefined || v === null) return 0
  const parsed = parseInt(v, 10)
  return isNaN(parsed) ? 0 : parsed
}

// Shipping Validator avec otherCharges à zéro par défaut
export const shippingValidator = [
  body('shipping')
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch (e) {
          return value
        }
      }
      return value
    }),

  body('shipping.oceanFreight')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 0 })
    .withMessage('Le fret maritime doit être un nombre positif')
    .toFloat()
    .default(0),

  body('shipping.insurance')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 0 })
    .withMessage("L'assurance doit être un nombre positif")
    .toFloat()
    .default(0),

  // ✅ otherCharges inclus et initialisé à 0 par défaut
  body('shipping.otherCharges')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 0 })
    .withMessage('Les autres frais doivent être un nombre positif')
    .toFloat()
    .default(0), // ← Forcé à 0 si non fourni

  body('shipping.devise')
    .optional()
    .isIn(['EUR', 'USD', 'CAD', 'CHF', 'GBP', 'XOF', 'XAF'])
    .withMessage('Devise invalide')
    .default('EUR'),

  body('shipping.incoterm')
    .optional()
    .isIn(['EXW', 'FOB', 'CIF', 'CFR'])
    .withMessage('Incoterm invalide')
    .default('EXW'),

  // Calcul automatique du FOB et totalOperatingCost avec otherCharges
  body('shipping').custom((shipping, { req }) => {
    const products = req.body.products || []

    // Calculer le total des produits
    const totalProducts = products.reduce((acc, product) => {
      const prixTotal = product.prixTotal || product.prix * product.quantity
      return acc + toFloat(prixTotal)
    }, 0)

    // S'assurer que otherCharges est défini (0 par défaut)
    if (shipping.otherCharges === undefined || shipping.otherCharges === null) {
      shipping.otherCharges = 0
    }

    // Définir les valeurs calculées
    shipping.freeOnBoardFromOriginatePort = totalProducts
    shipping.totalOperatingCost =
      totalProducts +
      toFloat(shipping.oceanFreight) +
      toFloat(shipping.insurance) +
      toFloat(shipping.otherCharges)

    return true
  }),
]
