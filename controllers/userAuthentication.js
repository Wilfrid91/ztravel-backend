import User from '../models/User.js'
import { StatusCodes } from 'http-status-codes'
import Token from '../models/Token.js'
import crypto from 'crypto'
import createTokenUser from '../utils/createTokenUser.js'
import { sendEmail } from '../utils/mailer.js'
import { attachCookiesToResponse } from '../utils/jwt.js'

export const register = async (req, res, next) => {
  console.log(req.body)
  const { nom, prenom, email, password, repassword } = req.body
  if (!nom || !prenom || !email || !password || !repassword) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ msg: 'Veuillez remplir tous les champs' })
  }
  const emailAlreadyExists = await User.findOne({ email })

  if (emailAlreadyExists) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ msg: 'Un compte utilisant cette adresse e‑mail existe déjà' })
  }

  // Check for same passwords
  if (password != repassword) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ msg: 'Les mots de passe ne correspondent pas' })
  }

  // verrouillage de la création du premier admin avec une condition atomique :
  // au cas où Les deux requêtes arrivent avant que la base ne soit mise à jour
  const userCount = await User.countDocuments()
  const role = userCount === 0 ? 'admin' : 'user'

  //const isFirstAccount = (await User.countDocuments({})) === 0
  //const role = isFirstAccount ? 'admin' : 'user'

  const verificationToken = crypto.randomBytes(20).toString('hex')
  // The create function fires 'save' hooks.
  const user = await User.create({
    nom,
    prenom,
    email,
    password,
    role,
    verificationToken,
  })

  //const verifyEmail = `${process.env.BASE_URL_FRONT}/verify-email?token=${verificationToken}&email=${email}`

  const verificationLink = `${process.env.BASE_URL_FRONT}/verify-email?token=${user.verificationToken}&email=${user.email}`

  const message = `Pour finaliser votre inscription, veuillez confirmer votre adresse e‑mail en cliquant sur le lien ci‑dessous : ${verificationLink}`

  const html = `
  <p>Bonjour ${user.prenom},</p>
  <p>Merci de créer un compte sur zTravel consulting.</p>
  <p>Pour finaliser votre inscription, veuillez confirmer votre adresse e‑mail :</p>
  <p><a href="${verificationLink}" style="color:#007aff;font-weight:bold;">Confirmer mon adresse e‑mail</a></p>
  <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e‑mail.</p>
`

  await sendEmail({
    to: user.email,
    subject: 'Validation de votre adresse e‑mail',
    text: message,
    html: html,
  })

  return res.status(StatusCodes.OK).json({
    msg: ` Votre inscription a bien été prise en compte. Vous devez vérifier votre courriel ${email} pour activer votre compte`,
  })
}

export const login = async (req, res, next) => {
  const { email, password } = req.body
  console.log(req.body)

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
      .json({ msg: 'Le mot de passe saisi est incorrect' })
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
  /*   return { lastname: user.lastname, userId: user._id, role: user.role } */
  const tokenUser = createTokenUser(user)

  // create refresh token
  let refreshToken = ''
  // check for existing token
  const existingToken = await Token.findOne({ user: user._id })
  if (existingToken) {
    const { isValid } = existingToken
    if (!isValid) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ msg: 'Le jeton de vérification est invalide ou expiré' })
    }
  }

  refreshToken = crypto.randomBytes(30).toString('hex')
  // Signature du navigateur / appareil du client =>  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  const userAgent = req.headers['user-agent']
  // Adresse IP du client qui fait la requête. Si app est derrière un proxy (Nginx, Vercel, Render, Railway…), activer :
  // app.set('trust proxy', 1)
  const ip = req.ip
  const userToken = { refreshToken, ip, userAgent, user: user._id }
  await Token.create(userToken)

  console.log('TOKEN USER >>>>>>>>>>>', tokenUser)
  attachCookiesToResponse({ res, user: tokenUser, refreshToken })

  return res.status(StatusCodes.OK).json({ user: tokenUser })
}

/**
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
export const logout = async (req, res) => {
  try {
    res.status(StatusCodes.OK).json({ msg: 'Deconnexion' })
  } catch (error) {
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

export default { register, login, logout, verifyEmail }
