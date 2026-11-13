import jwt from 'jsonwebtoken'
import { StatusCodes } from 'http-status-codes'

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

  const guestToken = req.signedCookies.anonymousToken
  // accessToken: s:eyJhbGciOiJIUzI1Ni... => Le préfixe s: indique que le cookie est signé.
  const { accessToken } = req.signedCookies

  try {
    if (accessToken) {
      const payload = jwt.verify(accessToken, process.env.JWT_SECRET)
      req.user = payload.user
      req.isGuest = false // c'est un objet existant ou c'est moi qui l'ajoute
      console.log('user', req.user)
      return next()
    }

    if (guestToken) {
      const payload = jwt.verify(guestToken, process.env.GUEST_SECRET)
      req.guest = payload
      req.isGuest = true
      return next()
    }

    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: 'Utilisateur non authentifié' })
  } catch (error) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: 'Utilisateur non authentifié' })
  }
}

/**
 * Pour les utilisateurs non authentifiés
 */
export const optionalAuthenticateUser = (req, res, next) => {
  const { accessToken } = req.signedCookies

  // Aucun utilisateur connecté :
  // on laisse quand même passer le tracking
  if (!accessToken) {
    req.user = null
    return next()
  }

  try {
    const payload = jwt.verify(accessToken, process.env.JWT_SECRET)

    req.user = payload.user

    console.log('OPTIONAL AUTH USER:', req.user)

    return next()
  } catch (err) {
    // Token expiré/invalide :
    // le tracking doit quand même fonctionner comme visiteur anonyme
    req.user = null

    console.log('OPTIONAL AUTH : token absent/invalide, tracking anonyme')

    return next()
  }
}

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    /* Si router.get('/admin/transactions',...) -> authorizeRoles('admin') fait que roles vaut: ['admin']
    roles.includes(req.user.role) -> ['admin'].includes(req.user.role), donc si req.user.role === 'admin' => True -> next() → accès autorisé.
    */
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Accès refusé' })
    }
    next()
  }
}
