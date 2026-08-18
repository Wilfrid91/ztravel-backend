// middlewares/vehicleValidator.js
import { body } from 'express-validator'

export const vehicleValidator = [
  // Parser vehicles si nécessaire
  body('vehicles').customSanitizer((value) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch (e) {
        return value
      }
    }
    return value
  }),

  // Valider chaque véhicule dans le tableau
  // *: un wildcard express-validator, signifie « Valide ce champ pour tous les éléments du tableau vehicles ».
  body('vehicles.*.type')
    .isIn(['Neuf', 'Occasion'])
    .withMessage('Type invalide'),

  body('vehicles.*.marque')
    .isString()
    .trim()
    // .escape() -> Evite la conversion des apostrophes, quote, etc..
    .isLength({ min: 2, max: 100 })
    .withMessage('Marque invalide'),

  // ⭐ CORRECTION : Convertir les chaînes en nombres avant validation
  body('vehicles.*.kilometrage')
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 0, max: 1000000 })
    .withMessage('Kilométrage invalide')
    .toInt(),

  body('vehicles.*.puissanceFiscal')
    .optional()
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 1, max: 50 })
    .withMessage('Puissance fiscale invalide')
    .toInt(),

  body('vehicles.*.anneeFabrication')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
    .withMessage('Année invalide')
    .toInt(),

  body('vehicles.*.motorisation')
    .isIn(['Essence', 'Diesel', 'Hybride', 'Electrique'])
    .withMessage('Motorisation invalide'),

  body('vehicles.*.description').optional().isString().trim(),
  //.escape() -> Evite la conversion des apostrophes, quote, etc..

  // ⭐ CORRECTION CRUCIALE pour les dimensions
  body('vehicles.*.longueurCm')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 50, max: 2000 })
    .withMessage('Longueur invalide (50-2000 cm)')
    .toInt(),

  body('vehicles.*.largeurCm')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 50, max: 2000 })
    .withMessage('Largeur invalide (50-2000 cm)')
    .toInt(),

  body('vehicles.*.hauteurCm')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 50, max: 2000 })
    .withMessage('Hauteur invalide (50-2000 cm)')
    .toInt(),

  body('vehicles.*.poidsKg')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 100, max: 30000 })
    .withMessage('Poids invalide (100-30000 kg)')
    .toInt(),

  body('vehicles.*.quantity')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseInt(value, 10)
      return value
    })
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantité invalide (1-100)')
    .toInt(),

  body('vehicles.*.prix')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseFloat(value)
      return value
    })
    .isFloat({ min: 0 })
    .withMessage('Prix invalide')
    .toFloat(),

  body('vehicles.*.devise')
    .isIn(['EUR', 'USD', 'CAD', 'CHF', 'GBP', 'XOF', 'XAF'])
    .withMessage('Devise invalide'),

  body('vehicles.*.prixTotal')
    .customSanitizer((value) => {
      if (typeof value === 'string') return parseFloat(value)
      return value
    })
    .isFloat({ min: 0 })
    .withMessage('Prix total invalide')
    .toFloat(),

  // Validation optionnelle pour shipping
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
]
