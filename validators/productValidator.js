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

export const productValidator = [
  // Parser les produits
  body('products')
    .customSanitizer((value) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch (e) {
          return value
        }
      }
      return value
    })
    .isArray({ min: 1 })
    .withMessage('Au moins un produit est requis'),

  // Validation pour chaque produit
  body('products.*.nom')
    .notEmpty()
    .withMessage('Le nom du produit est requis')
    .isString()
    .trim()
    //.escape() -> Evite la conversion des apostrophes, quote, etc..
    .isLength({ min: 2, max: 200 })
    .withMessage('Le nom doit contenir entre 2 et 200 caractères'),

  body('products.*.description')
    .optional()
    .isString()
    .trim()
    //.escape() -> Evite la conversion des apostrophes, quote, etc..
    .isLength({ max: 500 })
    .withMessage('La description ne peut pas dépasser 500 caractères'),

  body('products.*.longueurCm')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 1, max: 2000 })
    .withMessage('La longueur doit être comprise entre 1 et 2000 cm')
    .toFloat(),

  body('products.*.largeurCm')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 1, max: 2000 })
    .withMessage('La largeur doit être comprise entre 1 et 2000 cm')
    .toFloat(),

  body('products.*.hauteurCm')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 1, max: 2000 })
    .withMessage('La hauteur doit être comprise entre 1 et 2000 cm')
    .toFloat(),

  body('products.*.poidsKg')
    .optional()
    .customSanitizer(toFloat)
    .isFloat({ min: 0.1, max: 30000 })
    .withMessage('Le poids doit être compris entre 0.1 et 30000 kg')
    .toFloat(),

  body('products.*.quantity')
    .customSanitizer(toInt)
    .isInt({ min: 1, max: 9999 })
    .withMessage('La quantité doit être comprise entre 1 et 9999')
    .toInt(),

  body('products.*.numberOfBox')
    .optional()
    .customSanitizer(toInt)
    .isInt({ min: 1, max: 9999 })
    .withMessage('Le nombre de colis doit être compris entre 1 et 9999')
    .toInt(),

  body('products.*.prix')
    .customSanitizer(toFloat)
    .isFloat({ min: 0.01 })
    .withMessage('Le prix unitaire doit être supérieur à 0')
    .toFloat(),

  body('products.*.devise')
    .isIn(['EUR', 'USD', 'CAD', 'CHF', 'GBP', 'XOF', 'XAF'])
    .withMessage('Devise invalide'),

  // Calcul automatique du prix total
  body('products.*.prixTotal')
    .optional()
    .customSanitizer(toFloat)
    .custom((value, { req, path }) => {
      const index = parseInt(path.split('.')[1])
      const product = req.body.products?.[index]
      if (product && (!value || value === 0)) {
        product.prixTotal = product.prix * product.quantity
      }
      return product?.prixTotal || value
    }),
]

// Shipping Validator avec otherCharges à zéro par défaut
export const productShippingValidator = [
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
