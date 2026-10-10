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
import { StatusCodes } from 'http-status-codes'

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
    if (
      !type ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)
    ) {
      return res.status(400).json({ msg: 'Fichier non valide (type interdit)' })
    }

    // 2) Vérifier que l’image est décodable
    try {
      await sharp(buffer).metadata()
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

export const submitCustomerForm = async (req, res, next) => {
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

    let attachments = []
    let filePath = null

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

      fs.writeFileSync(filePath, cleanImage)

      attachments.push({
        filename: fileName,
        path: filePath,
      })
    }

    // Vérification reCAPTCHA
    const googleVerify = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
          response: captchaToken,
        },
      },
    )

    if (!googleVerify.data.success) {
      return res.status(400).json({ error: 'CAPTCHA invalide' })
    }

    await sendEmail({
      to: process.env.GMAIL_USER,
      subject: `Nouveau message de ${name}`,
      html: `
        <h2>Nouveau message du formulaire</h2>
        <p><strong>Nom :</strong> ${name}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${phone}</p>
        <p><strong>Message :</strong><br>${message}</p>
      `,
      attachments,
    })

    return res.status(200).json({
      msg: 'Formulaire soumis avec succès. Nous vous contacterons dès que possible. Merci pour votre confiance !',
    })
  } catch (error) {
    console.error('Erreur lors de la soumission du formulaire:', error)
    res.status(500).json({
      error:
        'Une erreur est survenue lors de la soumission du formulaire. Veuillez réessayer plus tard.',
    })
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
    const files = req.files
    // Aucun fichier envoyé → continuer
    if (!files || files.length === 0) return next()

    for (const file of files) {
      const buffer = file.buffer

      // 1) Vérifier le type MIME réel
      const type = await fileTypeFromBuffer(buffer)
      if (!type || !['image/jpeg', 'image/png'].includes(type.mime)) {
        return res.status(400).json({
          msg: `Fichier ${file.originalname} non valide (type interdit)`,
        })
      }

      // 2) Vérifier que l’image est décodable par PDFKit
      try {
        if (type.mime === 'image/jpeg') {
          const decoded = jpeg.decode(buffer, { useTArray: true })
          if (!decoded || !decoded.width) throw new Error('Invalid JPEG')
        }

        if (type.mime === 'image/png') {
          PNG.sync.read(buffer) // throws si PNG invalide
        }

        // 3) Vérifier la taille
        if (file.size > 2 * 1024 * 1024) {
          return res.status(400).json({
            msg: `L'image ${file.originalname} dépasse 2 Mo`,
          })
        }
      } catch (err) {
        return res.status(400).json({
          msg: `Image ${file.originalname} corrompue ou non décodable`,
        })
      }
    }
    next()
  } catch (error) {
    console.error(error)
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
  const userId = req.user.userId
  const products = req.body.products || '[]'
  const shipping = req.body.shipping || '{}'
  const photos = req.files || []
  const user = req.user?.name || 'client'
  const username = req.user.username

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
    return res.status(403).json({
      message:
        "Vous avez épuisé tous vos jetons d'impression. Veuiller recharger votre compte",
    })
  }

  // Génération PDF
  try {
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
    console.error('Erreur PDF:', error)

    // 4) ROLLBACK jeton si erreur
    await JetonImpression.updateOne(
      { userId },
      { $inc: { jetons_restants: +1 } },
    )
    return res.status(500).json({
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
  user,
}) => {
  try {
    console.log('VEHICULES', vehicles)
    console.log('SHIPPING', shipping)
    console.log('PRODUCTS', products)

    if (products.length > 0) {
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
      return fullProductPDF
    }

    if (vehicles.length > 0) {
      console.log('PDF pour véhicules')
      const avdData = await computeAvdVehicle(vehicles, shipping) // avdData est une Promise
      console.log('AVD VEHICLE =', avdData)
      try {
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
      } catch (error) {
        console.error('❌ Erreur génération PDF:', error)
        res
          .status(500)
          .json({ error: 'Erreur génération PDF', details: error.message })
      }
    }
  } catch (error) {
    console.error(error)
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
    const userId = req.user.userId

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
 * Genère la liste des produits et calcul l'attestation de validation documentaire
 * @param {*} req
 * @param {*} res
 */
export const createVehicleListAndAVD = async (req, res) => {
  try {
    // vehicles sont optionnels
    const vehicles = req.body.vehicles || '[]'
    const shipping = req.body.shipping || '{}'
    const photos = req.files || []
    const user = req.user?.name || 'client'
    const userId = req.user.userId
    const username = req.user.username

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
      return res.status(403).json({
        message:
          "Vous avez épuisé tous vos jetons d'impression. Veuiller recharger votre compte",
      })
    }

    // const mergePdf = await generatePDF(req)
    const pdf = await generatePDF({
      vehicles,
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
  } catch (error) {}
}
