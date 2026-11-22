import User from '../models/User.js'
import { StatusCodes } from 'http-status-codes'
import Token from '../models/Token.js'
import crypto from 'crypto'
import createTokenUser from '../utils/createTokenUser.js'
import { sendEmail } from '../utils/mailer.js'
import {
  isTokenValid,
  attachCookiesToResponseWithRefreshToken,
} from '../utils/jwt.js'

export const register = async (req, res) => {
  try {
    //console.log(req.body)
    const { nom, prenom, email, password, repassword } = req.body
    if (!nom || !prenom || !email || !password || !repassword) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: 'Veuillez remplir tous les champs' })
    }

    // Check for same passwords
    if (password !== repassword) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: 'Les mots de passe ne correspondent pas' })
    }

    // Vérification unicité email
    const emailAlreadyExists = await User.findOne({ email })

    if (emailAlreadyExists) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: 'Un compte utilisant cette adresse e‑mail existe déjà',
      })
    }

    // Détermination du rôle
    // ATTENTION : ceci n'est pas totalement sûr en cas de créations simultanées
    const userCount = await User.countDocuments()
    const role = userCount === 0 ? 'admin' : 'user'

    const verificationToken = crypto.randomBytes(20).toString('hex')

    // Création utilisateur
    const user = await User.create({
      nom,
      prenom,
      email,
      password,
      role,
      verificationToken,
    })
    const verificationLink = `${process.env.BASE_URL_FRONT}/verify-email?token=${user.verificationToken}&email=${user.email}`
    const message = `Cliquez ci-dessous pour vérifier que l'adresse e-mail enregistrée pour vous est correcte. : ${verificationLink}`

    const html = `
        <p>Hi ${user.prenom},</p>
        <p>Merci d'avoir crée votre compte sur Simudouane.com</p>
        <p>Cliquez ci-dessous pour vérifier que l'adresse e-mail enregistrée pour vous est correcte. :</p>
        <p><a href="${verificationLink}" style="color:#007aff;font-weight:bold;">Confirmer mon adresse e‑mail</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e‑mail.</p>
      `

    await sendEmail({
      to: user.email,
      subject: 'Validation de votre adresse e‑mail',
      text: message,
      html: html,
    })

    return res.status(StatusCodes.CREATED).json({
      msg: ` Votre inscription a bien été prise en compte. Vous devez vérifier votre courriel ${email} pour activer votre compte`,
    })
  } catch (error) {
    console.error(error)
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Une erreur est survenue lors de l'inscription",
    })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: 'Veuillez fournir un email et un mot de passe' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ msg: 'Utilisateur introuvable' })
    }

    const isPasswordCorrect = await user.comparePassword(password)
    if (!isPasswordCorrect) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ msg: 'Email ou mot de passe incorrect' })
    }

    // L'utilisateur a recu le mail et a validé
    if (!user.isVerified) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ msg: 'Veuillez confirmer votre adresse e‑mail pour continuer' })
    }

    // Mise à jour de la dernière connexion
    user.lastLogin = new Date()
    await user.save()

    const tokenUser = createTokenUser(user)

    // Informations de session
    // Signature du navigateur / appareil du client =>  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    const userAgent = req.headers['user-agent']
    // Adresse IP du client qui fait la requête. app est derrière un proxy Nginx-> app.set('trust proxy', 1)
    const ip = req.ip

    // check for existing token
    const existingToken = await Token.findOne({ user: user._id })
    const refreshToken = crypto.randomBytes(40).toString('hex')

    // Second connexion...
    if (existingToken) {
      if (!existingToken.isValid) {
        existingToken.isValid = true
      }
      existingToken.ip = ip
      existingToken.userAgent = userAgent
      // Rotation du refresh token à chaque login. Même lors de la 2e connexion, tu génères un nouveau refresh token :
      existingToken.refreshToken = refreshToken
      existingToken.lastUsedAt = new Date()
      await existingToken.save()
    } else {
      // 1er connexion
      await Token.create({
        user: user._id,
        refreshToken,
        ip,
        userAgent,
        isValid: true,
      })
    }

    // L'utilisateur a un compte : on supprime toute trace d'invité
    res.clearCookie('anonymousToken')

    // Création du cookie JWT
    // attachCookiesToResponse({ res, user: tokenUser })
    attachCookiesToResponseWithRefreshToken({
      res,
      user: tokenUser, // signé -> accessToken
      refreshToken, // signé
    })
    return res.status(StatusCodes.OK).json({ user: tokenUser })
  } catch (error) {
    console.error(error)
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur serveur', error })
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
export const logout = async (req, res) => {
  try {
    res.clearCookie('accessToken', { path: '/' })
    res.clearCookie('refreshToken', {
      path: '/api/v1/auth/refresh',
    })

    await Token.findOneAndUpdate({ user: req.user.userId }, { isValid: false })

    return res.status(StatusCodes.OK).json({ msg: 'Deconnexion' })
  } catch (error) {
    console.error(error)
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur serveur', error })
  }
}

export const verifyEmail = async (req, res) => {
  try {
    const { email, verificationToken } = req.body

    console.log('🔑 Token reçu :', verificationToken)
    console.log('📧 Email reçu :', email)
    console.log('📦 Longueur token :', verificationToken?.length)

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(StatusCodes.FORBIDDEN).json({ msg: 'Email incorrect' })
    }

    // --- NOUVEAU : Gestion du cas déjà vérifié ---
    if (user.isVerified) {
      return res.status(StatusCodes.OK).json({
        msg: 'Compte déjà vérifié. Veuillez vous connecter.',
        alreadyVerified: true,
      })
    }

    if (user.verificationToken !== verificationToken) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: 'Le token de vérification est invalide ou expiré' })
    }
    user.isVerified = true
    user.verified = Date.now()
    user.verificationToken = ''
    await user.save()

    res.status(StatusCodes.OK).json({ msg: 'Email Verified!, Please login' })
  } catch (error) {
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur serveur', error })
  }
}

export const refreshTokenHandler = async (req, res) => {
  // Backend : route de refresh
  // const { refreshToken } = req.signedCookies
  // 1) cookie reçu
  try {
    const refreshTokenCookie = req.signedCookies.refreshToken

    if (!refreshTokenCookie) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        msg: 'Authentication invalid',
      })
    }

    let payload
    try {
      // 2) Decodage du cookie puis recherche dans la DB
      //payload = isTokenValid({ token: refreshTokenCookie })
      payload = isTokenValid(refreshTokenCookie)
      //console.log('payload', payload)
    } catch (error) {
      console.error(error)
      return res.status(StatusCodes.UNAUTHORIZED).json({
        msg: 'Authentication invalid',
      })
    }

    //console.log('payload.user.userId', payload.user.userId)
    //console.log('payload.refreshToken', payload.refreshToken)

    const tokenByUser = await Token.findOne({
      user: payload.user.userId,
    })

    console.log('tokenByUser', tokenByUser)

    // 3) on retrouve ABC123...
    const existingToken = await Token.findOne({
      user: payload.user.userId,
      refreshToken: payload.refreshToken,
    })

    console.log('existingToken', existingToken)

    if (!existingToken || !existingToken.isValid) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        msg: 'Authentication invalid',
      })
    }
    // Rotation du refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex')

    existingToken.refreshToken = newRefreshToken
    existingToken.ip = req.ip
    existingToken.userAgent = req.headers['user-agent']
    existingToken.lastUsedAt = new Date()

    await existingToken.save()

    const tokenUser = payload.user
    attachCookiesToResponseWithRefreshToken({
      res,
      user: tokenUser,
      refreshToken: newRefreshToken,
    })

    return res.status(StatusCodes.OK).json({
      user: tokenUser,
    })
  } catch (error) {
    console.error(error)
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Erreur serveur', error })
  }
}

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email })

    /**
     * Imagine qu'un attaquant teste des adresses e-mail : alice@gmail.com, bob@gmail.com, charlie@gmail.com ...
     * Si l'API répond: { "msg": "Veuillez créer un compte."}, alors l'attaquant sait immédiatement que cette adresse n'existe pas.
     * Et si pour une autre adresse tu réponds : { "msg": "Email envoyé." } il sait que cette adresse existe.
     * => L'attaquant peut automatiser des milliers de requêtes et
     * lancer des attaques de connexion sur ces comptes ;
     * cibler les utilisateurs avec du phishing ;
     * savoir qu'une personne est cliente/utilisatrice de ton service ;
     * revendre cette liste.
     */
    if (!user) {
      return res.status(200).json({
        // 404 permettrait encore de savoir si le compte existe, donc 200
        msg: 'Si le compte existe, un email a été envoyé', // On appelle cela une énumération de comptes (account enumeration).
      })
    }
    // passwordToken = 123
    const passwordToken = crypto.randomBytes(40).toString('hex')
    // hashedToken = CBA
    const hashedToken = crypto
      .createHash('sha256')
      .update(passwordToken)
      .digest('hex')

    const tenMinutes = 1000 * 60 * 10

    //user.passwordToken = passwordToken
    user.passwordToken = hashedToken //  user.passwordToken = CBA
    user.passwordTokenExpirationDate = new Date(Date.now() + tenMinutes)

    await user.save()

    const resetUrl = `${process.env.BASE_URL_FRONT}/reset-password?token=${user.passwordToken}&email=${user.email}`
    //console.log(resetUrl)

    const message = `Pour finaliser votre inscription, veuillez confirmer votre adresse e‑mail en cliquant sur le lien ci‑dessous : ${resetUrl}`

    const html = `
        <p>Hi ${user.prenom},</p>
        <p>Cliquez ci-dessous pour réinitialiser votre mot de passe :</p>
        <p><a href="${resetUrl}" style="color:#007aff;font-weight:bold;">Réinitialiser mon mot de passe</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e‑mail.</p> `

    await sendEmail({
      to: user.email,
      subject: 'Réinitialisation de mot de passe',
      text: message,
      html: html,
    })

    return res.status(StatusCodes.OK).json({ msg: 'Email envoyé' })
  } catch (error) {
    console.error(error)
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Une erreur est survenue lors de l'inscription",
    })
  }
}

export const resetPassword = async (req, res) => {
  try {
    const { token, email, password } = req.body
    const user = await User.findOne({
      email,
    })
    // Erreurs interne au serveur
    // Le throw est très utile si tu as un middleware global de gestion des erreurs :
    // throw new BadRequestError('Token invalide') , puis app.use(errorHandlerMiddleware)
    // où le middleware transforme automatiquement BadRequestError en 400 etc...
    if (!user) {
      return res.status(404).json({
        msg: 'Utilisateur introuvable',
      })
    }

    if (user.passwordToken !== token) {
      return res.status(400).json({
        msg: 'Token invalide',
      })
    }

    if (user.passwordTokenExpirationDate < new Date()) {
      return res.status(400).json({
        msg: 'Token expiré',
      })
    }

    user.password = password

    user.passwordToken = null
    user.passwordTokenExpirationDate = null

    await user.save()

    return res.status(StatusCodes.OK).json({ msg: 'Mot de passe modifié' })
  } catch (error) {
    console.error(error)
    //  await user.save() peut échouer si :
    // MongoDB est indisponible
    // la connexion est perdue
    // une exception est levée dans un middleware Mongoose
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Une erreur est survenue lors de l'inscription",
    })
  }
}

export default {
  register,
  login,
  logout,
  verifyEmail,
  refreshTokenHandler,
  forgotPassword,
  resetPassword,
}
