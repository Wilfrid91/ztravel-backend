import jwt from 'jsonwebtoken'
import { asyncWrapper } from './async.js'
import { createCustomError } from '../errors/custom-api.js'
import User from '../models/User.js'

export const authenticateUser = (req, res, next) => {
  /**
   * Toutes les routes busineapp sont protégées. Elles sont appelées automatiquement le frontend (React) au chargement de la page
👉 Donc même si tu vas sur /register, ton frontend fait encore :
    GET /business-app-data
    GET /customs-data
    GET /get-form 
    => Solution -> Ne jamais appeler les routes business si l’utilisateur n’est pas connecté
    => if (user) {...}
   */
  const { refreshToken, accessToken } = req.signedCookies

  if (!accessToken) {
    return res.status(401).json({ error: 'Utilisateur non authentifié' })
  }

  try {
    const payload = jwt.verify(accessToken, process.env.JWT_SECRET)
    req.user = payload.user
    console.log('user', req.user)
    return next()
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' })
  }
}

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Accès refusé' })
    }
    next()
  }
}
