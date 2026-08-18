// validators/authentication.validator.js
import { body } from 'express-validator'

export const loginValidator = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Email invalide'),

  body('password').trim().notEmpty().withMessage('Mot de passe requis'),
]
// trim() → enlève les espaces
// escape() → protège contre XSS dans nom/prénom
// normalizeEmail() → nettoie l’email
// isEmail() → valide le format
// isLength() → limite la taille
// custom() → vérifie repassword

export const registerValidator = [
  body('nom')
    .trim()
    .escape()
    .isLength({ min: 2 })
    .withMessage('Le nom doit contenir au moins 2 caractères'),

  body('prenom')
    .trim()
    .escape()
    .isLength({ min: 2 })
    .withMessage('Le prénom doit contenir au moins 2 caractères'),

  body('email').trim().normalizeEmail().isEmail().withMessage('Email invalide'),

  body('password')
    .trim()
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères'),

  body('repassword')
    .trim()
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Les mots de passe ne correspondent pas'),
]

export const verifyEmailValidator = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Email invalide'),

  body('verificationToken').trim().notEmpty().withMessage('Token requis'),
]
