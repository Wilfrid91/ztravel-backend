// middlewares/validate.js
import { validationResult } from 'express-validator'

/**
 * le middleware qui renvoie les erreurs
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
