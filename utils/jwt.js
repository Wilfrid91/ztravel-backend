import jwt from 'jsonwebtoken'

// Vérification que JWT_SECRET est défini
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be defined in environment variables')
}

if (!process.env.GUEST_SECRET) {
  throw new Error('GUEST_SECRET must be defined in environment variables')
}

export const createJWT = ({ payload, expiresIn }) => {
  try {
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn, // createJWT doit recevoir la durée, pas la décider
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

export const attachCookiesToResponse = ({ res, user }) => {
  try {
    // Durées en millisecondes
    const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes
    const isProd = process.env.NODE_ENV === 'production'
    const accessTokenJWT = createJWT({ payload: { user }, expiresIn: '7d' }) // plus tard expiresIn: '7d' au lieu de 15m }) // une semaine, disons

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
      expires: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    })

    // Optionnel: retourner quelque chose pour debugging
    return { accessTokenJWT }
  } catch (error) {
    throw new Error(`Error attaching cookies: ${error.message}`)
  }
}

export const attachCookiesToResponseWithRefreshToken = ({
  res,
  user,
  refreshToken,
}) => {
  try {
    // Durées en millisecondes
    const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours
    const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours

    const isProd = process.env.NODE_ENV === 'production'

    const accessTokenJWT = createJWT({ payload: { user }, expiresIn: '15m' })

    const refreshTokenJWT = createJWT({
      payload: { user, refreshToken },
      expiresIn: '30d',
    })

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
      expires: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    })

    // RefreshToken (longue durée)
    // Durée : 30 jours
    // Usage : renouveler l’accessToken
    // Risque : très faible (httpOnly + secure + rotation possible)
    res.cookie('refreshToken', refreshTokenJWT, {
      ...cookieOptions,
      expires: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })

    // Optionnel: retourner quelque chose pour debugging
    return { accessTokenJWT, refreshTokenJWT }
  } catch (error) {
    throw new Error(`Error attaching cookies: ${error.message}`)
  }
}

export const signAnonymous = (payload) => {
  try {
    const token = jwt.sign(payload, process.env.GUEST_SECRET, {
      expiresIn: '24h', // Optionnel: expiration intégrée
    })
    return token
  } catch (error) {
    throw new Error(`Error creating Guess Token: ${error.message}`)
  }
}

export const attachAnonymousCookie = ({ res, token }) => {
  try {
    const isProd = process.env.NODE_ENV === 'production'
    const oneDay = 1 * 24 * 60 * 60 * 1000 // 24 heures

    // Configuration commune des cookies
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      signed: true, // ==> signifie que le cookie est stocké dans : req.signedCookies
      sameSite: isProd ? 'None' : 'Lax', // DEV = Lax, PROD = None
      path: '/',
    }

    // Durée : 30 minutes
    // Usage : authentification rapide
    // Risque : faible (expire vite)

    res.cookie('anonymousToken', token, {
      ...cookieOptions,
      expires: new Date(Date.now() + oneDay),
    })
  } catch (error) {
    throw new Error(`Error attaching cookies: ${error.message}`)
  }
}

// Exports nommés
export default {
  createJWT,
  isTokenValid,
  attachCookiesToResponse,
  signAnonymous,
  attachAnonymousCookie,
}
