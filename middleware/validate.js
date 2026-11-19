// middlewares/validate.js
import { validationResult } from 'express-validator'

/**
 * Le middleware validate sert à vérifier le résultat de express-validator (validationResult(req)).
 * Or, sur la route /refresh, Il n'y a aucun validateur (body(...), cookie(...), param(...), etc.) avant validate.
 * Donc validationResult(req) sera toujours vide
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    console.log('❌ Validation errors:', errors.array())
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    })
  }
  next()
}
