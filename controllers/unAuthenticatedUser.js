import { StatusCodes } from 'http-status-codes'
import FreeSimulation from '../models/freeSimulation.js'
import { attachAnonymousCookie, signAnonymous } from '../utils/jwt.js'
import crypto from 'crypto'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { sendEmail } from '../utils/mailer.js'

/**
 * Ne doit JAMAIS créer de record consommable si l'IP en a déjà un
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
export const registerGuest = async (req, res, next) => {
  try {
    if (req.user) {
      // Un utilisateur connecté n'est pas un invité : rien à faire
      return res.status(StatusCodes.OK).json({ anonymous: false })
    }
    // Empreinte IP (anti-triche partielle)
    const ip = req.ip || req.socket.remoteAddress
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex')

    /**
    La présence du token ne prouve PAS que la simulation a été consommée ! Le token est posé dès l'arrivée sur la page, et l'utilisateur n'a peut-être jamais simulé. Avec cette règle, dès la deuxième visite de la page (token déjà en cookie), il reçoit « déjà utilisée » même sans avoir simulé. La bonne vérification est en base, sur le flag :
     */

    // Anti-triche : cette IP a-t-elle déjà consommé sa gratuite ?
    const consumed = await FreeSimulation.findOne({
      ipHash,
      freeSimulationUsed: true,
    })
    if (consumed) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error:
          'Votre simulation gratuite a déjà été utilisée. Créez un compte pour continuer.',
      })
    }

    // Réutiliser le record existant plutôt qu'en créer un par visite :
    let record = await FreeSimulation.findOne({
      ipHash,
      freeSimulationUsed: false,
    })
    console.log('RECORD=============', record)

    if (!record) {
      const anonymId = crypto.randomUUID()
      await FreeSimulation.create({ anonymId, ipHash })
      record = { anonymId }
    }

    const accessAnonymousToken = signAnonymous({
      guest: true,
      anonymId: record.anonymId,
    })
    attachAnonymousCookie({ res, token: accessAnonymousToken })

    return res.status(StatusCodes.OK).json({ anonymous: true })
  } catch (error) {
    console.log(error)
    next(error)
  }
}

export const NonAuthCustomerForm = async (req, res) => {
  let filePath = null
  try {
    const {
      name,
      email,
      phone,
      message,
      'g-recaptcha-response': captchaToken,
    } = req.body

    if (!name || !email || !message || !phone || !captchaToken) {
      return res
        .status(400)
        .json({ error: 'Tous les champs sont obligatoires.' })
    }

    // Double vérification (ceinture + bretelles)
    if (!message || message.trim().length < 10) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: 'Le message doit contenir au moins 10 caractères',
      })
    }

    if (message.length > 500) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: 'Le message ne doit pas dépasser 500 caractères',
      })
    }

    // Tronquer pour l'email si nécessaire (sécurité supplémentaire)
    const safeMessage = message.slice(0, 500)

    let attachments = []

    const productPhoto = req.file

    if (productPhoto) {
      const cleanImage = await sharp(productPhoto.buffer)
        .jpeg({ quality: 90 })
        .toBuffer()

      const fileName = `photo_${Date.now()}_${productPhoto.originalname}.jpg`
      filePath = path.join('uploads/private', fileName)

      const uploadDir = path.join('uploads/private')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      // Gestion des fichiers temporaires : sauvegarde de l'image :
      fs.writeFileSync(filePath, cleanImage)

      attachments.push({
        filename: fileName,
        path: filePath,
      })
    }

    // Vérification reCAPTCHA
    try {
      const googleVerify = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify`,
        null,
        {
          params: {
            secret: process.env.RECAPTCHA_SECRET_KEY,
            response: captchaToken,
          },
        },
      )

      if (!googleVerify.data.success) {
        return res
          .status(400)
          .json({ success: false, message: 'CAPTCHA invalide' })
      }
    } catch (err) {
      console.error(
        'reCAPTCHA verify failed:',
        err?.response?.data || err.message,
      )
      return res.status(503).json({
        message: 'Service CAPTCHA momentanément indisponible.',
      })
    }

    await sendEmail({
      to: process.env.GMAIL_USER,
      subject: `Nouveau message de ${name}`,
      html: `
        <h2>Nouveau message du formulaire</h2>
        <p><strong>Nom :</strong> ${name}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${phone}</p>
        <p><strong>Message :</strong><br>${safeMessage}</p>
      `,
      attachments,
    })

    return res.status(200).json({
      message:
        'Formulaire soumis avec succès. Nous vous contacterons dès que possible. Merci pour votre confiance !',
    })
  } catch (error) {
    console.error('Erreur lors de la soumission du formulaire:', error)
    res.status(500).json({
      error:
        'Une erreur est survenue lors de la soumission du formulaire. Veuillez réessayer plus tard.',
    })
  } finally {
    // Si sendEmail() échoue, le fichier reste dans uploads/private et ne sera jamais supprimé => Il serait préférable d'ajouter un nettoyage.
    // Le finally s'exécute toujours, même s'il y a un return res.status(...).
    if (filePath) {
      try {
        // Utiliser les méthodes asynchrones de Node, ce qui évite de bloquer l'event loop.
        await fs.promises.unlink(filePath)
      } catch (err) {
        console.error(
          'Erreur lors de la suppression du fichier temporaire:',
          err,
        )
      }
    }
  }
}
