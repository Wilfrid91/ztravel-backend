import jwt from 'jsonwebtoken'

// Vérification que JWT_SECRET est défini
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be defined in environment variables')
}

export const createJWT = ({ payload }) => {
  try {
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h', // Optionnel: expiration intégrée
    })
    return token
  } catch (error) {
    throw new Error(`Error creating JWT: ${error.message}`)
  }
}

export const isTokenValid = ({ token }) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET)
  } catch (error) {
    throw new Error(`Invalid token: ${error.message}`)
  }
}

export const attachCookiesToResponse = ({ res, user, refreshToken }) => {
  try {
    const isProd = process.env.NODE_ENV === 'production'
    const accessTokenJWT = createJWT({ payload: { user } })
    const refreshTokenJWT = createJWT({ payload: { user, refreshToken } })

    // Durées en millisecondes
    const thirtyMinutes = 60 * 60 * 1000 // 60 minutes
    const oneDay = 1 * 24 * 60 * 60 * 1000 // 24 heures

    // Configuration commune des cookies
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      signed: true,
      sameSite: isProd ? 'None' : 'Lax', // DEV = Lax, PROD = None
      path: '/',
    }

    // Durée : 30 minutes
    // Usage : authentification rapide
    // Risque : faible (expire vite)
    res.cookie('accessToken', accessTokenJWT, {
      ...cookieOptions,
      expires: new Date(Date.now() + thirtyMinutes),
    })

    // RefreshToken (longue durée)
    // Durée : 30 jours
    // Usage : renouveler l’accessToken
    // Risque : très faible (httpOnly + secure + rotation possible)
    res.cookie('refreshToken', refreshTokenJWT, {
      ...cookieOptions,
      expires: new Date(Date.now() + oneDay),
    })

    // Optionnel: retourner quelque chose pour debugging
    return { accessTokenJWT, refreshTokenJWT }
  } catch (error) {
    throw new Error(`Error attaching cookies: ${error.message}`)
  }
}

// Exports nommés
export default { createJWT, isTokenValid, attachCookiesToResponse }
