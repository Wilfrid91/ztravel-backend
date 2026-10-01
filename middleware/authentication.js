import jwt from 'jsonwebtoken'

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
