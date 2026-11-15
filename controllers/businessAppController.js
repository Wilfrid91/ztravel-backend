import Tab2DataModel from '../models/Tab2.js'
import Tab3DataModel from '../models/Douane.js'
import Tab2AvdDataModel from '../models/Tab2AvdData.js'
import Tab3AvdDataModel from '../models/Tab3AvdData.js'
import AVDSimulatorModel from '../models/AVDSimulator.js'
import Catalog from '../models/Catalog.js'
import CGU from '../models/CGU.js'
import JetonImpression from '../models/JetonImpression.js'
import UserGuideAVD from '../models/UserGuideAVD.js'
import CheckList from '../models/Checklist.js' // replace "avantDePartir.js" model
import FreeSimulation from '../models/freeSimulation.js'
import { StatusCodes } from 'http-status-codes'
import { findBestCodeSH } from '../utils/pdfService.js'

import dotenv from 'dotenv'
dotenv.config()

import User from '../models/User.js'
import { computeAVD, computeAvdVehicle } from '../utils/pdfService.js'

import {
  generateProductFullPDF,
  generateVehicleFullPDF,
} from '../utils/pdf/fullPDFHandler.js'

import { sendEmail } from '../utils/mailer.js'
import axios from 'axios'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import console from 'console'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2 Mo

export const getBeforeLeaving = async (req, res, next) => {
  try {
    const tableOfContent = await CheckList.find().sort({ _id: 1 })
    if (!tableOfContent || tableOfContent.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'TAB1 non trouvée' })
    }

    res.status(StatusCodes.OK).json({
      guide: tableOfContent,
    })
  } catch (error) {
    console.log(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

export const getTab2Data = async (req, res, next) => {
  try {
    // ✅ Utilise findOne() pour récupérer UN SEUL document
    // le plus ancien avec .sort({ _id: 1 })).
    const tab2Document = await Tab2DataModel.findOne().sort({ _id: 1 }).lean()
    /**
     * res.status.json
     * API propre, codes HTTP, réponses structurées
     */
    if (!tab2Document) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Aucun document Tab2 trouvé.',
      })
    }
    return res.status(StatusCodes.OK).json(tab2Document.chapters || [])
  } catch (error) {
    console.log(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

export const GetCustomerCatalog = async (req, res, next) => {
  try {
    const cards = await Catalog.find().sort({ _id: 1 })
    /**
     * res.status.json
     * API propre, codes HTTP, réponses structurées
     */
    if (!cards || cards.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'CGU non trouvée' })
    }

    console.log({ cards })

    return res.status(StatusCodes.OK).json({
      cards,
    })
  } catch (error) {
    console.log(error)
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: error.message })
  }
}
// Customer form generated from Server and to Client with Captcha

export const validateUploadedPhoto = async (req, res, next) => {
  try {
    const file = req.file
    // Aucun fichier envoyé → continuer
    if (!file) return next()
    console.log('1. file.buffer:', file.buffer?.length) // Vérifier que buffer existe

    const buffer = file.buffer

    console.log('Fichier reçu:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    })

    console.log('Données formulaire:', req.body)

    // 1) Vérifier le type MIME réel
    const type = await fileTypeFromBuffer(buffer)

    console.log('2. type détecté:', type) // Voir ce que fileType renvoie

    if (
      !type ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)
    ) {
      return res.status(400).json({ msg: 'Fichier non valide (type interdit)' })
    }

    // 2) Vérifier que l’image est décodable
    try {
      console.log('3. Avant sharp...')
      await sharp(buffer).metadata()
      console.log('4. Sharp OK')
    } catch (err) {
      return res.status(400).json({ msg: 'Image corrompue ou non décodable' })
    }

    // 3) Scanner antivirus
    //  On ajoutera un scan cloud plus tard si tu veux
    /*const clamscan = await new NodeClam().init({
      removeInfected: true,
      quarantineInfected: false,
    })

    const { isInfected } = await clamscan.scanBuffer(buffer)
    if (isInfected) {
      return res.status(400).json({ msg: 'Fichier infecté (virus détecté)' })
    }*/

    next()
  } catch (error) {
    console.error('Erreur validation upload:', error)
    res.status(500).json({ msg: 'Erreur lors de la validation du fichier' })
  }
}

export const submitCustomerForm = async (req, res) => {
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

/**
 * Validate the PDF file
 * @param {} req
 * @param {*} res
 * @param {*} next
 */
export const validateUploadedProductPhoto = async (req, res, next) => {
  try {
    // files => On peut avoir une liste de produits, donc plusieurs images
    const files = req.files
    // Aucun fichier envoyé → continuer
    if (!files?.length) {
      return next()
    }

    for (const file of files) {
      // const { buffer, size, originalname } = file equivalent à :
      // const buffer = file.buffer;
      // const size = file.size
      // const originalname = file.originalname
      const { buffer, size, originalname } = file

      if (size > MAX_IMAGE_SIZE) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          msg: `L'image ${originalname} dépasse 2 Mo`,
        })
      }

      // 1) Vérifier le type MIME réel
      const type = await fileTypeFromBuffer(buffer)
      if (!type || !ALLOWED_MIME_TYPES.has(type.mime)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          msg: `Fichier ${originalname} non valide`,
        })
      }

      try {
        switch (type.mime) {
          case 'image/jpeg':
            jpeg.decode(buffer, { useTArray: true })
            break

          case 'image/png':
            PNG.sync.read(buffer)
            break

          default:
            throw new Error('Unsupported image type')
        }
      } catch (error) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          msg: `Image ${originalname} corrompue ou non décodable`,
        })
      }
    }
    next()
  } catch (error) {
    console.error(error)
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: 'Erreur lors de la validation des images',
    })
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
export const getCustomsData = async (req, res, next) => {
  try {
    const tab3Document = await Tab3DataModel.findOne().sort({ _id: 1 }).lean()
    if (!tab3Document) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Aucun document Tab3 trouvé.',
      })
    }
    return res.status(StatusCodes.OK).json(tab3Document)
  } catch (error) {
    console.log(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

/**
 * Genère la liste des produits et calcul l'attestation de validation documentaire
 * @param {*} req
 * @param {*} res
 */
export const createProductListAndAVD = async (req, res) => {
  // vaut undefined si l'utilisateur n'est pas authentifié
  let userId = null
  let user = 'Invité'
  let username = 'guest'
  try {
    // products est attendu comme une liste (0, 1, plusieurs véhicules/produits)
    //  → le fallback est un tableau vide []
    const products = Array.isArray(req.body.products) ? req.body.products : []
    // shipping est attendu comme un objet unique (un seul ensemble de données : incoterm, fret, assurance, CIF, devise)
    //  → le fallback est un objet vide {} (ou '{}' bugué).
    const shipping =
      req.body.shipping &&
      typeof req.body.shipping === 'object' &&
      !Array.isArray(req.body.shipping)
        ? req.body.shipping
        : {}

    const photos = req.files || []

    /*
    console.log('IS GUEST IN PRODUCT: ', req.isGuest)
    if (req.isGuest) {
      const simulation = await FreeSimulation.findOne({
        anonymId: req.guest.anonymId,
      })
      console.log('Simulation trouvée', simulation)
      console.log(
        'Simulation value: ',
        !simulation || simulation.freeSimulationUsed,
      )
      if (!simulation || simulation.freeSimulationUsed) {
        return res.status(StatusCodes.FORBIDDEN).json({
          error: 'Simulation gratuite déjà utilisée',
        })
      }
      simulation.freeSimulationUsed = true
      console.log('Simulation mise à jour')
      await simulation.save()
      console.log('Simulation data', simulation)*/

    console.log('IS GUEST IN PRODUCT: ', req.guestSimulation)
    //  Consommation atomique
    if (req.guestSimulation) {
      const result = await FreeSimulation.updateOne(
        { _id: req.guestSimulation._id, freeSimulationUsed: false }, // ne consomme QUE si pas déjà consommé
        { $set: { freeSimulationUsed: true } },
      )
      if (result.modifiedCount === 0) {
        // Consommé entre-temps (double onglet, requête parallèle...) → refuser
        return res.status(StatusCodes.FORBIDDEN).json({
          error:
            'Simulation gratuite déjà utilisée. Créez un compte pour continuer.',
        })
      }
    } else {
      userId = req.user?.userId
      user = req.user?.name || 'client'
      username = req.user.username
      if (!userId) {
        return res
          .status(StatusCodes.UNAUTHORIZED)
          .json({ message: 'Authentification requise' })
      }
      const jeton = await JetonImpression.findOneAndUpdate(
        {
          userId,
          jetons_restants: { $gt: 0 }, // Vérifie qu'il reste un jeton
        },
        {
          $inc: { jetons_restants: -1, nbre_impressions: 1 },
        },
        { new: true },
      )

      if (!jeton) {
        return res.status(StatusCodes.FORBIDDEN).json({
          message:
            "Vous avez épuisé tous vos jetons d'impression. Veuiller recharger votre compte",
        })
      }
    } // fin else
    const pdf = await generatePDF({
      products,
      shipping,
      photos,
      user,
    })
    // 3. Envoyer le PDF fusionné
    return res
      .status(StatusCodes.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=AVD_${username}.pdf`,
      })
      .end(pdf)
  } catch (error) {
    console.error("Erreur PDF pendant la génération de l'AVD:", error)

    // ROLLBACK jeton si erreur
    await JetonImpression.updateOne(
      { userId },
      { $inc: { jetons_restants: +1 } },
    )
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message:
        "Erreur lors de la génération du PDF. Aucun jeton n'a été consommé.",
    })
  }
}

/**
 * products et vehicles sont optionnels
 * Le contrôleur extrait ce qu’il faut selon la route
 */
const generatePDF = async ({
  products = [],
  vehicles = [],
  shipping = {},
  photos = [],
}) => {
  try {
    console.log('VEHICULES', vehicles)
    //log('SHIPPING', shipping)
    //console.log('PRODUCTS', products)

    if (products.length > 0) {
      // Verifier si les devises  des autres produits sont identiques à la premiere devise séléctionnée
      const deviseReference = products[0].devise
      // every() : Vérifie qu'une condition est vraie pour tous les éléments :
      const memeDevise = products.every(
        (product) => product.devise === deviseReference,
      )
      if (!memeDevise) {
        throw new Error('Tous les produits doivent avoir la même devise')
      }

      console.log('PDF pour produits')
      // 2) Calcul métier AVD
      const avdData = await computeAVD(products, shipping) // avdData est une Promise
      console.log('AVD PRODUCT =', avdData)

      const fullProductPDF = await generateProductFullPDF(
        products,
        photos,
        shipping,
        avdData,
      )
      if (!fullProductPDF || fullProductPDF.length === 0) {
        throw new Error('Buffer PDF vide')
      }
      return fullProductPDF
    }

    if (vehicles.length > 0) {
      console.log('PDF pour véhicules')

      // Verifier si les devises  des autres produits sont identiques à la premiere devise séléctionnée
      const deviseReference = vehicles[0].devise
      // every() : Vérifie qu'une condition est vraie pour tous les éléments :
      const memeDevise = vehicles.every(
        (vehicle) => vehicle.devise === deviseReference,
      )
      if (!memeDevise) {
        throw new Error('Tous les vehicles doivent avoir la même devise')
      }

      const avdData = await computeAvdVehicle(vehicles, shipping) // avdData est une Promise

      console.log('AVD VEHICLE =', avdData)
      console.log('📄 Appel de generateVehicleFullPDF')

      const fullVehiclePDF = await generateVehicleFullPDF(
        vehicles,
        photos,
        shipping,
        avdData,
      )
      console.log(`📄 PDF reçu: ${fullVehiclePDF.length} bytes`)
      // Vérifiez que le buffer n'est pas vide
      if (!fullVehiclePDF || fullVehiclePDF.length === 0) {
        throw new Error('Buffer PDF vide')
      }
      return fullVehiclePDF
    }
  } catch (error) {
    console.error('❌ Erreur génération PDF:', error)
    throw error
  }
}

/**
 * Genère la liste des produits et calcul l'attestation de validation documentaire
 * @param {*} req
 * @param {*} res
 */
export const createVehicleListAndAVD = async (req, res) => {
  let userId = null
  let user = 'Invité'
  let username = 'guest'
  try {
    // vehicles sont optionnels
    const vehicles = Array.isArray(req.body.vehicles) ? req.body.vehicles : []
    const shipping =
      req.body.shipping &&
      typeof req.body.shipping === 'object' &&
      !Array.isArray(req.body.shipping)
        ? req.body.shipping
        : {}
    const photos = req.files || []

    //console.log('SHIPPING', Object.keys(req.body.shipping))
    console.log('IS GUEST IN VEHICLE: ', req.isGuest)
    /*if (req.isGuest) {
      **
       * simulation = {
          anonymId: '123',
          freeSimulationUsed: false
          }

      const simulation = await FreeSimulation.findOne({
        anonymId: req.guest.anonymId,
      })

      console.log('Simulation trouvée', simulation)

      // simulation || simulation.freeSimulationUsed => True || false => true
      // Pas encore simulé
      if (!simulation || simulation.freeSimulationUsed) {
        return res.status(StatusCodes.FORBIDDEN).json({
          error: 'Simulation gratuite déjà utilisée',
        })
      }
      simulation.freeSimulationUsed = true
      console.log('Simulation mise à jour')
      await simulation.save()
      console.log('Simulation data', simulation)
    }*/
    console.log('IS GUEST IN VEHICLE: ', req.guestSimulation)
    if (req.guestSimulation) {
      const result = await FreeSimulation.updateOne(
        { _id: req.guestSimulation._id, freeSimulationUsed: false }, // ne consomme QUE si pas déjà consommé
        { $set: { freeSimulationUsed: true } },
      )
      if (result.modifiedCount === 0) {
        // Consommé entre-temps (double onglet, requête parallèle...) → refuser
        return res.status(StatusCodes.FORBIDDEN).json({
          error:
            'Simulation gratuite déjà utilisée. Créez un compte pour continuer.',
        })
      }
    } else {
      console.log('req.user=', req.user)
      console.log('req.guest=', req.guest)

      userId = req.user?.userId
      user = req.user?.name || 'client'
      username = req.user.username
      if (!userId) {
        return res
          .status(StatusCodes.UNAUTHORIZED)
          .json({ message: 'Authentification requise' })
      }

      // Trouve un document correspondant à userId dans la collection JetonImpression et mets-le à jour en même temps.
      const jeton = await JetonImpression.findOneAndUpdate(
        {
          userId,
          // $gt = “greater than” → “strictement supérieur à 0” => Vérifie qu'il reste un jeton
          // Trouve le document du user X qui a encore des jetons disponibles.
          jetons_restants: { $gt: 0 },
        },
        {
          // $inc : incrémente/décrémente des champs numériques.
          // On décrémente jetons_restants de 1 → on consomme un jeton.
          // On incrémente nbre_impressions de 1 → on compte une impression de plus.
          $inc: { jetons_restants: -1, nbre_impressions: 1 },
        },
        {
          // Renvoie-moi le document après la mise à jour.
          // Donc jeton contient les valeurs à jour (jetons_restants décrémenté, nbre_impressions incrémenté).
          new: true,
        },
      )

      if (!jeton) {
        return res.status(StatusCodes.FORBIDDEN).json({
          message:
            "Vous avez épuisé tous vos jetons d'impression. Veuiller recharger votre compte",
        })
      }
    }

    const pdf = await generatePDF({
      vehicles,
      shipping,
      photos,
      user,
    })
    //console.log('PDF DATA', pdf)
    // 3. Envoyer le PDF fusionné
    return res
      .status(StatusCodes.OK)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=AVD_${username}.pdf`,
      })
      .end(pdf)
  } catch (err) {
    console.error(
      "Erreur lors de Genèration PDF, etc... de l'attestation de validation documentaire:",
      err,
    )
    // 4.) ROLLBACK jeton si erreur
    await JetonImpression.updateOne(
      { userId },
      { $inc: { jetons_restants: +1 } },
    )
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message:
        "Erreur lors de la génération du PDF. Aucun jeton n'a été consommé.",
    })
  }
}

/**
 *
 */
export const generateCGU = async (req, res, next) => {
  try {
    const data = await CGU.find().sort({ _id: 1 })
    if (!data || data.length === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'CGU non trouvée' })
    }

    // On renvoie directement le premier document
    return res.status(StatusCodes.OK).json(data[0])
  } catch (error) {
    console.log(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

/**
 *  See const handleSubmitCGU = async () => {} in react
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const submitJacceptCheckedStatus = async (req, res) => {
  try {
    const userId = req.user?.userId

    // attend un filtre + un update
    const acknowledge = await User.findByIdAndUpdate(
      userId,
      {
        cguAccepted: true,
        cguAcceptedAt: new Date(),
      },
      { new: true },
    )

    if (!acknowledge) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Utilisateur introuvable',
      })
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      email: acknowledge.email,
      cguAccepted: acknowledge.cguAccepted,
      cguAcceptedAt: acknowledge.cguAcceptedAt,
    })
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: error.message })
  }
}

/**
 * see useEffect line 493
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const isCustomerConsent = async (req, res) => {
  //console.log("J'ACCEPTE CHECKED>>>>>>>>>>>>")
  const user = await User.findById(req.user.userId)

  return res.json({
    accepted: user.cguAccepted === true,
    version: user.cguVersion || null,
  })
}

export const getUserGuide = async (req, res) => {
  try {
    // findOne() ne renvoie qu’un seul document
    const userGuideData = await UserGuideAVD.findOne().sort({ _id: 1 }).lean()

    if (!userGuideData) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Aucun document UserGuideAVD trouvé.',
      })
    }
    console.log('USERGUIDE', userGuideData)

    return res.status(StatusCodes.OK).json(userGuideData.chapters || [])
  } catch (error) {
    console.error(error)
  }
}

/**
 * Page "Avant de commencer" du simulateur
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const simulatorPage = async (req, res) => {
  try {
    const incotermData = await AVDSimulatorModel.findOne()
      .sort({ _id: 1 })
      .lean()
    if (!incotermData) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Aucun document simulatorPage trouvé.',
      })
    }
    return res.status(StatusCodes.OK).json(incotermData.chapters || [])
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

/**
 *  Get TAB 2 DATA
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
export const getSimulatorTab2 = async (req, res, next) => {
  try {
    const simulatorData = await Tab2AvdDataModel.findOne()
      .sort({ _id: 1 })
      .lean()
    if (!simulatorData) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Aucun document Tab2AvdDataModel trouvé.',
      })
    }

    return res.status(StatusCodes.OK).json(simulatorData.chapters || [])
  } catch (error) {
    console.log(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

/**
 *  Get TAB 3 DATA / VEHICULE USER GUIDE
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
export const getSimulatorTab3 = async (req, res, next) => {
  try {
    const simulatorData = await Tab3AvdDataModel.findOne()
      .sort({ _id: 1 })
      .lean()
    if (!simulatorData) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: 'Aucun document Tab3AvdDataModel trouvé.',
      })
    }

    return res.status(StatusCodes.OK).json(simulatorData.chapters || [])
  } catch (error) {
    console.log(error)
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}

/**
 * Get the available token for printing purpose.
 * When the token is null, customer should pay again
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
export const checkCustomerToken = async (req, res) => {
  const userId = req.user?.userId
  try {
    if (!userId) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ error: 'Utilisateur non authentifié' })
    }
    // consultation de la base de données
    //let jeton = await JetonImpression.findOne({ userId })

    const jeton = await JetonImpression.findOne({
      userId,
      jetons_restants: { $gt: 0 }, // Vérifie qu'il reste un jeton
    })

    console.log('Nombre de jetons disponible=', jeton)

    if (!jeton) {
      return res.status(StatusCodes.FORBIDDEN).json({
        message:
          "Vous avez épuisé tous vos jetons d'impression. Veuiller recharger votre compte",
      })
    }

    return res.status(StatusCodes.OK).json({
      message: 'Jeton disponible. Vous pouvez imprimer',
      jeton,
    })
  } catch (error) {
    console.error('checkCustomerToken :', error)
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Erreur lors de la vérification des jetons' })
  }
}

/* Architecture recommandée
Debounce : ne chercher qu'après une pause de saisie (~300-400 ms).
Longueur minimum : ne chercher qu'à partir de 3-4 caractères.
Requête allégée pour le lookup : le scoring complet (Jaro-Winkler mot à mot + IDF) est trop lourd pour de la saisie. Utilise une version rapide (match par préfixe/inclusion de tokens) pour les suggestions, et garde findBestCodeSH complet pour la validation finale à la sortie du champ.
Annulation : si l'utilisateur continue de taper, annule la requête en cours (AbortController côté API, ou simple vérification de fraîcheur côté front). */
export const searchCodeSH = async (req, res) => {
  try {
    const { description } = req.body
    if (!description?.trim()) return res.json(null)

    const best = await findBestCodeSH(description) // sans await, tu renvoies une Promise au lieu du résultat réel.
    console.log('BEST :', best, '| description reçue :', description)

    return res.status(StatusCodes.OK).json(best)
  } catch (error) {
    console.error(error)
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'Erreur recherche code SH' })
  }
}
