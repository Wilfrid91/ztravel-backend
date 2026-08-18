import { StatusCodes } from 'http-status-codes'
import axios from 'axios'
import Transaction from '../models/MtnRequestToPayTransaction.js'
import FedaPayTransaction from '../models/FedaPay.js'
import Subscription from '../models/SubscriptionBusinessModel.js'
import PaymentMethod from '../models/PaymentMethods.js'
import JetonImpression from '../models/JetonImpression.js'

import { generateMchtAndCustCopy } from '../utils/pdfService.js'
import { sendEmail } from '../utils/mailer.js'
import crypto from 'crypto'
import QRCode from 'qrcode'
import fs from 'fs'
import { Webhook } from 'fedapay'
import FedapayRefund from '../models/FedapayRefund.js'
import { resolve } from 'dns'
import { PDFDocument as PDFLibDocument } from 'pdf-lib'
import { PassThrough } from 'stream'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PDFDocumentWithTables } = require('pdfkit-table') // Classe étendue de pdfkit

// MTN MoMo limite les tokens.
let momoToken = null
let momoTokenExpiresAt = 0

// Handle client receipt in Hetzner
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
const s3 = new S3Client({
  region: 'eu-central', // Hetzner n’utilise pas vraiment les régions, mais mets une valeur
  endpoint: process.env.HETZNER_ENDPOINT,
  credentials: {
    accessKeyId: process.env.HETZNER_ACCESS_KEY,
    secretAccessKey: process.env.HETZNER_SECRET_KEY,
  },
})

/**
 * 1) INIT PAYMENT (requestToPay)
 * This is asynchronous, the transaction status is sent later in getStatus()
 */
export const momoAuthorizationRequest = async (req, res) => {
  const { payload } = req.body
  if (!payload) {
    return res.status(400).json({ error: 'payload manquant' })
  }

  const userId = req.user.userId
  const type = 'MTN_MOMO'

  try {
    // 1) Ajouter la carte
    const paymentMethod = await PaymentMethod.findOneAndUpdate(
      { userId }, // critère
      {
        type,
      },
      { new: true, upsert: true }, // upsert = update + insert - Si aucun document ne correspond → MongoDB crée un nouveau document
    )

    const referenceId = generateUUID()
    // 1️⃣ Token MTN
    const tokenData = await getMomoToken(
      'collection',
      process.env.MTN_MOMO_SUB_KEY_REST,
    )
    if (!tokenData.success) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Impossible d'obtenir le token MTN",
        details: tokenData.details,
      })
    }
    const accessToken = tokenData.accessToken

    const { amount, currency, payer, payerMessage, payeeNote } = payload

    /*const payerMessage =
      paymentType === 'IMPRESSION_PAYMENT'
        ? 'Paiement pour débloquer les impressions'
        : 'Veuillez payer 5999 FCFA'

    const payeeNote =
      paymentType === 'IMPRESSION_PAYMENT'
        ? `Reset impressions for user ${userId}`
        : 'Paiement normal'

    const externalId =
      paymentType === 'IMPRESSION_PAYMENT'
        ? `IMPRESSION_PAYMENT-${userId}-${Date.now()}`
        : `NORMAL_PAYMENT-${userId}-${Date.now()}`*/

    const externalId = `${userId}-${Date.now()}`

    // 2️⃣  Payment Request to MOMO
    const mtnResponse = await axios.post(
      `${process.env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay`,
      {
        currency,
        amount: amount.toString(),
        payer,
        externalId,
        payerMessage,
        payeeNote,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': 'sandbox',
          'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_SUB_KEY_REST,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'PostmanRuntime/7.32.2', // contourne le firewall
          'Cache-Control': 'no-cache',
        },
      },
    )
    // IMPORTANT: Attendre 2-3 secondes avant de vérifier le statut
    // MTN a besoin de temps pour traiter la transaction
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // 3️⃣ Response sent to PaymentForm
    return res.status(StatusCodes.OK).json({
      success: true,
      referenceId,
    })
  } catch (error) {
    console.log('❌ REQUESTTOPAY ERROR FULL DUMP ================')

    console.log('➡️ error.message =', error.message)
    console.log('➡️ error.code =', error.code)
    console.log('➡️ error.response?.status =', error.response?.status)
    console.log('➡️ error.response?.data =', error.response?.data)
    console.log('➡️ error.response?.headers =', error.response?.headers)
    console.log('➡️ error.config?.headers =', error.config?.headers)
    console.log('➡️ error.config?.data =', error.config?.data)

    return res.status(500).json({
      success: false,
      message: 'Erreur lors du requestToPay',
      details: error.response?.data || error.message,
    })
  }
}

/**
 * 2) GET MTN TOKEN
 */
export const getMomoToken = async (tender, tenderKey) => {
  if (momoToken && Date.now() < momoTokenExpiresAt) {
    return { success: true, accessToken: momoToken }
  }
  try {
    const basicAuth = Buffer.from(
      `${process.env.MTN_MOMO_API_USER}:${process.env.MTN_MOMO_API_KEY}`,
    ).toString('base64')

    const response = await axios.post(
      `${process.env.MTN_MOMO_BASE_URL}/${tender}/token/`,
      {},
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Ocp-Apim-Subscription-Key': tenderKey,
        },
      },
    )
    momoToken = response.data.access_token
    momoTokenExpiresAt = Date.now() + response.data.expires_in * 1000

    return {
      success: true,
      accessToken: momoToken,
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type,
    }
  } catch (error) {
    console.error('Erreur OAuth:', error.response?.data || error)
    return {
      success: false,
      message: "Impossible d'obtenir le token OAuth",
      details: error.response?.data,
    }
  }
}

/**
 * 3) CHECK PAYMENT STATUS
 */
export const getRequestToPayTransactionStatus = async (req, res) => {
  const { referenceId } = req.params
  const userId = req.user.userId

  if (!req.user) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: 'Utilisateur non authentifié' })
  }
  if (!referenceId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Reference ID manquant',
    })
  }

  try {
    const tokenData = await getMomoToken(
      'collection',
      process.env.MTN_MOMO_SUB_KEY_COLLECTION,
    )
    if (!tokenData.success) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: 'Token MTN invalide' })
    }
    const accessToken = tokenData.accessToken

    const response = await axios.get(
      `${process.env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Target-Environment': 'sandbox',
          'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_SUB_KEY_REST,
        },
      },
    )

    const transaction = await Transaction.findOneAndUpdate(
      { referenceId },
      {
        referenceId,
        financialTransactionId: response.data.financialTransactionId,
        externalId: response.data.externalId,
        amount: Number(response.data.amount),
        currency: response.data.currency,
        phone: response.data.payer?.partyId,
        status: response.data.status,
        method: 'MTN_MOMO',
        rawResponse: response.data,
        userId: req.user.userId,
      },
      { upsert: true, new: true },
    )

    if (response.data.status === 'SUCCESSFUL') {
      // Ajouter les jetons
      let jeton = await JetonImpression.findOne({ userId })
      if (!jeton) {
        // Premier paiement → initialisation
        jeton = await JetonImpression.create({
          userId,
          jetons_total: 3,
          jetons_restants: 3,
        })
      } else {
        jeton.jetons_total += 3
        jeton.jetons_restants += 3
        await jeton.save()
      }
      console.log('🎉 Jetons ajoutés avec succès !')
      return res.json({
        success: true,
        status: response.data.status,
        raw: response.data,
        transaction,
      })
    } else {
      console.log('TODO')
    }
  } catch (error) {
    console.error('Erreur checkPaymentStatus:', error.response?.data || error)
    console.log('ERREUR MTN REQUESTTOPAY =', error.response?.data)

    if (error.response?.data?.code === 'RESOURCE_NOT_FOUND') {
      return res.status(200).json({
        status: 'PENDING',
        message: 'Transaction not yet available',
      })
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la vérification du statut',
      details: error.response?.data,
    })
  }
}

/**
 * Print the MOMO MTN PDF receipt
 * @param {} req
 * @param {*} res
 * @returns
 */
export const generateMomoMchtAndCustCopy = async (req, res) => {
  const { referenceId } = req.params

  console.log('USENAME>>>>>>>>>>>>>', req.user)

  const client = req.user.nom
  console.log('REFERENCE ID REÇU DU FRONT REACT =', referenceId)

  if (!req.user) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: 'Utilisateur non authentifié' })
  }
  if (!referenceId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Reference ID manquant',
    })
  }

  // 🟩 MODE NORMAL (APPEL MTN)
  try {
    const tokenData = await getMomoToken(
      'collection',
      process.env.MTN_MOMO_SUB_KEY_REST,
    )
    if (!tokenData.success) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: 'Token MTN invalide' })
    }

    const accessToken = tokenData.accessToken

    console.log(`Appel MTN pour referenceId: ${referenceId}`)

    const response = await axios.get(
      `${process.env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Target-Environment': 'sandbox',
          'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_SUB_KEY_REST,
        },
      },
    )

    console.log('MOMO RESPONSE = >>>>>>>>>>>', response.data)

    const transaction = await Transaction.findOneAndUpdate(
      { referenceId },
      {
        referenceId,
        financialTransactionId: response.data.financialTransactionId,
        externalId: response.data.externalId,
        amount: Number(response.data.amount),
        currency: response.data.currency,
        phone: response.data.payer?.partyId,
        status: response.data.status,
        method: 'MTN_MOMO',
        rawResponse: response.data,
        user: req.user.userId,
      },
      { upsert: true, new: true },
    )

    const qrPayload = {
      id: transaction.id,
      amount: transaction.amount,
      date: transaction.createdAt,
      status: transaction.status,
      type: 'PAYMENT_DATA',
    }

    // Vérifiez que les données sont sérialisables
    try {
      const signature = crypto
        .createHmac('sha256', process.env.QR_SIGNING_SECRET)
        .update(JSON.stringify(qrPayload))
        .digest('base64')

      const qrObject = {
        data: qrPayload,
        signature,
      }
      // Vérifiez que toBuffer existe
      console.log('QRCode.toBuffer existe:', typeof QRCode.toBuffer)

      const qrString = JSON.stringify(qrObject)

      const qrcode = await QRCode.toBuffer(qrString, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: 'M',
      })

      console.log('QR code généré, taille:', qrcode.length)

      // Vérification que c'est un buffer valide
      if (!qrcode || qrcode.length < 100) {
        throw new Error('QR code généré est vide ou trop petit')
      }

      // print the client receipt along with the QR code- The Ticket component will render the ticket on client side
      const pdfBuffer = await generateMchtAndCustCopy(
        transaction,
        'client',
        qrcode,
      )

      //console.log('PDF BUFFER=', pdfBuffer.length)
      //console.log(Buffer.isBuffer(pdfBuffer))
      //fs.writeFileSync('test.pdf', pdfBuffer)

      /*const upload = await s3.send(
        new PutObjectCommand({
          Bucket: process.env.HETZNER_BUCKET,
          Key: `receipts/${transaction.id}.pdf`,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
          ACL: 'public-read', // si tu veux un lien public
        }),
      )
      console.log(upload)*/

      // BusinessMainApp, line 427
      return res
        .status(StatusCodes.OK)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=recu.pdf',
        })
        .end(pdfBuffer)
    } catch (qrError) {
      console.error('Erreur génération QR code:', qrError)
      // Fallback: QR code simple avec juste l'ID
      const fallbackData = {
        id: transaction.id,
        signature: signature,
        timestamp: Date.now(),
      }

      const fallbackQR = await QRCode.toBuffer(JSON.stringify(fallbackData), {
        width: 200,
        margin: 1,
      })

      console.log('QR code fallback généré, taille:', fallbackQR.length)

      const pdfBuffer = await generateMchtAndCustCopy(
        transaction,
        'client',
        fallbackQR,
      )
      // Envoyer le PDF (en dehors du bloc try/catch)
      if (!pdfBuffer) {
        throw new Error('Impossible de générer le PDF')
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Ticket_client_${transaction._id}.pdf`,
      )

      return res.status(StatusCodes.OK).json({
        status: 'SUCCESS',
        message: 'PDF envoyé au client',
        pdfBase64: pdfBuffer.toString('base64'), // Le client pourra décoder
        pdfSize: pdfBuffer.length,
      })
    }
  } catch (error) {
    console.error('Erreur checkPaymentStatus:', error.response?.data || error)
    console.log('ERREUR MTN REQUESTTOPAY =', error.response?.data)

    if (error.response?.data?.code === 'RESOURCE_NOT_FOUND') {
      return res.status(200).json({
        status: 'PENDING',
        message: 'Transaction not yet available',
      })
    }

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la vérification du statut',
      details: error.response?.data,
    })
  }
}
/**
 * UTILS
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/* Create mtn order, return the created order once successful*/
export const mtnSaleCallback = async (req, res, next) => {
  //todo
  const data = req.body
}

export const mtnRefundCallback = async (req, res, next) => {
  //todo
  const data = req.body
}

export const createFedaPayTransaction = async (req, res) => {
  const { payload } = req.body
  //console.log('PAYLOAD =>>>>>>>>', payload)
  const { amount, description, firstname, lastname, email, phone } = payload

  // Get client IP
  const clientIp =
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress

  const userId = req.user.userId
  const type = 'MOMO_TEST'
  try {
    // 1) Ajouter la carte
    const paymentMethod = await PaymentMethod.create({
      userId,
      type,
    })

    try {
      console.log(
        'CALLBACK_URL:',
        `${process.env.FEDAPAY_BASE_URL_BACK}/api/fedapay/callback/sale`,
      )
      console.log(
        'WEBHOOK_URL:',
        `${process.env.NGROK_URL}/api/fedapay/callback/sale`,
      )
      console.log(
        'RETURN_URL:',
        `${process.env.FEDAPAY_BASE_URL_FRONT}/payment/success`,
      )

      const response = await axios.post(
        'https://sandbox-api.fedapay.com/v1/transactions',
        {
          amount,
          description,
          callback_url: `${process.env.FEDAPAY_BASE_URL_BACK}/api/fedapay/callback/sale`, // utilisé pour le retour utilisateur .
          webhook_url: `${process.env.NGROK_URL}/api/fedapay/callback/sale`, // utilisé par FedaPay pour notifier ton backend
          return_url: `${process.env.FEDAPAY_BASE_URL_FRONT}/payment/success`, // Redirection frontend après paiement validé
          cancel_url: `${process.env.FEDAPAY_BASE_URL_FRONT}/payment/failed`, // Redirection frontend après paiement échoué
          currency: { iso: 'XOF' },
          customer: {
            firstname,
            lastname,
            email,
            phone_number: {
              number: phone,
              country: 'BJ',
            },
          },
          custom_metadata: {
            userId: userId,
          },

          mode: 'mtn_bj', //  ou mode: 'moov_bj' todo : in production change to 'live'
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      )

      const transaction = response.data['v1/transaction']
      //console.log('TRANSACTION FEDAPAY =', transaction)

      await FedaPayTransaction.create({
        paymentUrl: transaction.payment_url,
        transactionId: transaction.id,
        referenceId: transaction.reference,
        customerId: transaction.customer_id,
        amount,
        status: 'pending',
        customerEmail: email,
        customerName: `${firstname} ${lastname}`,
        userId,
      })

      return res.json({
        success: true,
        paymentUrl: transaction.payment_url,
        transactionId: transaction.id,
        referenceId: transaction.reference,
        customerId: transaction.customer_id,
      })
    } catch (error) {
      console.log(
        `Échec avec URL ${url}:`,
        error.response?.status,
        error.response?.data?.message,
      )
    }
  } catch (error) {
    console.error('=== ERREUR FEDAPAY ===')
    console.error('=== ERREUR COMPLÈTE ===')
    console.error('Message:', error.message)
    console.error('Status:', error.response?.status)
    console.error('Data:', error.response?.data)

    // Afficher la requête qui a échoué
    if (error.config) {
      console.error('URL:', error.config.url)
      console.error('Méthode:', error.config.method)
      console.error('Headers:', error.config.headers)
      console.error('Body:', error.config.data)
    }
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la transaction',
      details: error.response?.data,
    })
  }
}

/* Fedapay callback WEBHOOK POST (serveur → serveur) appelé en live pas en Sandbox*/
export const fedaPaySaleCallback = async (req, res) => {
  try {
    // Ton callback GET est appelé AVANT que ta transaction soit enregistrée en DB.
    // Donc quand tu fais la redirection GET → tu n’as pas encore le statut → tu rediriges vers /payment-error

    if (req.method === 'GET') {
      console.log('GET reçu (retour utilisateur)')

      // FedaPay renvoie souvent ?id=xxxx ou ?reference=xxxx
      const transactionId = req.query.id // FedaPay envoie TOUJOURS ?id=xxxx
      console.log("(req.method === 'GET'): ", transactionId)

      // Toujours rediriger vers une page "processing"
      return res.redirect(
        `${process.env.BASE_URL_FRONT}/payment-processing?transactionId=${transactionId}`,
      )
    }

    // WEBHOOK POST
    const signature = req.headers['x-fedapay-signature']
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET

    const event = Webhook.constructEvent(req.body, signature, secret)

    // transaction.created : contient : custom_metadata.userId ← le seul endroit où il existe
    // On stocke juste userId pour fetcher les jetons
    if (event.name === 'transaction.created') {
      console.log('Webhook FedaPay vérifié :', event.name)

      const metadata = event.entity.custom_metadata || {}
      const userId = metadata.userId
      if (userId) {
        await FedaPayTransaction.findOneAndUpdate(
          { transactionId: event.entity.id },
          { userId },
        )
      }
      return res.status(StatusCodes.OK).json({ received: true })
    }

    // On ne traite que les paiements approuvés
    if (event.name !== 'transaction.approved') {
      console.log('Événement ignoré :', event.name)
      // Même si tu as une erreur interne (tu logs, mais tu renvoies 200)
      // Parce que si tu ne renvoies pas 200, FedaPay considère que le webhook a échoué, je dois le renvoyer.”
      return res.status(200).json({ received: true })
    }

    //const psp = event.entity?.mode // mtn_bj, moov_bj, card
    const transactionId = event.entity?.id
    const referenceId = event.entity?.reference
    const metadata = event.entity.custom_metadata || {}
    const userId = metadata.userId
    const paymentMethod = event.entity?.payment_method
    const paymentSource = event.entity?.payment_source
    console.log(transactionId)

    //console.log('ISSUER ID METADATA=', transactionId)

    if (!userId) {
      console.log(
        "❌ Aucun userId dans metadata → impossible d'ajouter des jetons",
      )
      return res.status(400).json({ error: 'Missing userId in metadata' })
    }

    // 🟩 ENREGISTRER LA TRANSACTION DANS LA DB
    await FedaPayTransaction.findOneAndUpdate(
      { transactionId: event.entity.id },
      {
        referenceId,
        transactionId,
        status: 'approved',
        amount: event.entity.amount,
        mode: event.entity.mode,
        userId,
        brand: paymentMethod.brand,
        number: paymentMethod.number,
        country: paymentMethod.country,
        method: paymentMethod.method,
        ip: paymentSource.ip,
        channel: paymentSource.channel,
        region: paymentSource.region,
      },
      { upsert: true, new: true },
    )

    console.log('Paiement validé pour userId:', userId)

    // Vérification du statut réel MTN MoMo
    //const status = await checkFedaPayStatus(transactionId)
    // Ajouter les jetons
    let jeton = await JetonImpression.findOne({ userId })

    if (!jeton) {
      // Premier paiement → initialisation
      jeton = await JetonImpression.create({
        userId,
        jetons_total: 3,
        jetons_restants: 3,
      })
    } else {
      jeton.jetons_total += 3
      jeton.jetons_restants += 3
      await jeton.save()
    }

    console.log('🎉 Jetons ajoutés avec succès !')

    return res.status(200).json({ received: true })
  } catch (error) {
    console.log('❌ Erreur webhook :', error)
    return res.status(400).send(`Webhook Error: ${error.message}`)
  }
}

/* Fedapay callback WEBHOOK POST (serveur → serveur) appelé en live pas en Sandbox*/
export const fedaPayRefundCallback = async (req, res) => {
  try {
    // WEBHOOK POST
    const signature = req.headers['x-fedapay-signature']
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET

    // Vérification cryptographique
    const event = Webhook.constructEvent(req.body, signature, secret)
    console.log('📩 Webhook FedaPay vérifié :', event.type)

    // On ne traite que les payouts
    if (event.object !== 'payout') {
      return res.status(200).send('Ignored')
    }

    const payout = event.data

    // 1) payout.processing
    if (event.type === 'payout.processing') {
      await FedapayRefund.findOneAndUpdate(
        { fedapayPayoutId: payout.id },
        { status: 'PROCESSING', fedapayRawResponse: payout },
      )
    }

    // 2) payout.failed
    if (event.type === 'payout.failed') {
      await FedapayRefund.findOneAndUpdate(
        { fedapayPayoutId: payout.id },
        { status: 'FAILED', fedapayRawResponse: payout },
      )
    }

    // 3) payout.completed
    if (event.type === 'payout.completed') {
      await FedapayRefund.findOneAndUpdate(
        { fedapayPayoutId: payout.id },
        { status: 'SUCCESSFUL', fedapayRawResponse: payout },
      )
    }

    return res.status(200).json({ received: true })
  } catch (error) {}
}
/**
 * No more used for the moment
 */
export const checkFedaPayStatus = async (transactionId) => {
  try {
    const response = await axios.get(
      `${process.env.FEDAPAY_SANDBOX_URL}/v1/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
        },
      },
    )

    const tx = response.data['v1/transaction']

    if (tx.status === 'approved') {
      console.log('Paiement validé via GET status !')

      await FedaPayTransaction.findOneAndUpdate(
        { transactionId },
        { status: 'approved' },
        { new: true },
      )
    }

    return tx.status
  } catch (error) {
    console.log('❌ Erreur GET status :')

    if (error.response) {
      console.log('Status HTTP :', error.response.status)
      console.log('Réponse FedaPay :', error.response.data)
    } else {
      console.log(error.message)
    }

    return null
  }
}

export const checkFedaPayTransactionStatus = async (req, res) => {
  const { transactionId } = req.params
  console.log(transactionId)

  if (!transactionId) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Reference manquante' })
  }
  try {
    const tx = await FedaPayTransaction.findOne({ transactionId })

    if (!tx) {
      return res.status(200).json({ status: 'pending' })
    }

    return res.status(200).json({
      status: tx.status, // approved, failed, pending
      amount: tx.amount,
      method: tx.method,
      referenceId: tx.referenceId,
    })
  } catch (error) {
    console.error('Erreur getPaymentStatus:', error)
    return res.status(500).json({ status: 'error' })
  }
}

export const sendEmailToCustomer = async (req, res) => {
  console.log('Je suis dans sendEmailToCustomer')

  try {
    const { referenceId } = req.body
    if (!referenceId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'referenceId manquant',
      })
    }

    // 1. Récupérer la transaction
    const transaction = await Transaction.findOne({ referenceId })

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction introuvable',
      })
    }

    const qrPayload = {
      id: transaction.id,
      amount: transaction.amount,
      date: transaction.createdAt,
      status: transaction.status,
      type: 'AVD_Certificate',
    }
    try {
      const signature = crypto
        .createHmac('sha256', process.env.QR_SIGNING_SECRET)
        .update(JSON.stringify(qrPayload))
        .digest('base64')

      const qrObject = {
        data: qrPayload,
        signature,
      }
      // Vérifiez que toBuffer existe
      console.log('QRCode.toBuffer existe:', typeof QRCode.toBuffer)

      const qrString = JSON.stringify(qrObject)

      const qrcode = await QRCode.toBuffer(qrString, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: 'M',
      })

      console.log('QR code généré, taille:', qrcode.length)

      // Vérification que c'est un buffer valide
      if (!qrcode || qrcode.length < 100) {
        throw new Error('QR code généré est vide ou trop petit')
      }

      // 2. Générer le PDF (ou utiliser ton générateur existant)
      const pdfBuffer = await generateMchtAndCustCopy(
        transaction,
        'client',
        qrcode,
      )

      console.log('PDF BUFFER TYPE =', Buffer.isBuffer(pdfBuffer))
      console.log('PDF BUFFER LENGTH =', pdfBuffer?.length)

      // 3. Envoyer l’email
      await sendEmail({
        to: req.user.email,
        subject: 'Votre reçu MTN MoMo',
        text: "Veuillez trouver ci-joint votre reçu de paiement pour la simulation de l'attestation de verification documentaire.",
        attachments: [
          {
            filename: `Recu-${referenceId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      })

      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Email envoyé',
        pdfBase64: pdfBuffer.toString('base64'), // Le client pourra décoder
        pdfSize: pdfBuffer.length,
      })
    } catch (error) {
      console.log(error)
    }
  } catch (error) {
    console.error('Erreur sendEmailToCustomer:', error)
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi de l'email",
      error: error.message,
    })
  }
}

/**
 *  get all the user payment Data
 * @param {*} req
 * @param {*} res
 */

export const getUserPaymentData = async (req, res) => {
  try {
    const { userId } = req.params

    const [fedapayTx, momoTx] = await Promise.all([
      FedaPayTransaction.find({ userId }).lean(),
      // { _id: ..., jetons_total: 72, jetons_restants: 72 }
      Transaction.find({ userId }).lean(),
    ])

    const normalizedTransactions = [
      ...momoTx.map((tx) => ({
        id: tx._id.toString(),
        createdAt:
          tx.createdAt || tx.created_at || tx.timestamp || tx.updatedAt || null,
        transactionId: tx.referenceId || null,
        amount: tx.amount || null,
        status: tx.status || null,
        method: tx.method || 'mtn_momo',
        brand: 'mtn_momo',
        country: 'BJ',
        number: tx.phone || null,
        customerEmail: null,
        ip: null,
        region: null,
      })),

      ...fedapayTx.map((tx) => ({
        id: tx._id.toString(),
        createdAt:
          tx.createdAt || tx.created_at || tx.timestamp || tx.updatedAt || null,
        transactionId: tx.transactionId || null,
        amount: tx.amount || null,
        status: tx.status || null,
        method: tx.method || null,
        brand: tx.brand || null,
        country: tx.country || null,
        number: tx.number || null,
        customerEmail: tx.customerEmail || null,
        ip: tx.ip || null,
        region: tx.region || null,
      })),
    ]

    normalizedTransactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    )

    console.log(normalizedTransactions)
    return res.status(200).json(normalizedTransactions)
  } catch (error) {
    console.error('Erreur getUserPaymentData:', error)
    res.status(500).json({ error: error.message })
  }
}
/**
 * Renvoie le nombre d'impressions ainsi que les jetons restants
 * Voir la mathode export const createProductListAndAVD = async (req, res) => {
 */
export const getUserPrintingToken = async (req, res) => {
  try {
    const { userId } = req.params
    // { _id: ..., jetons_total: 72, jetons_restants: 72 }
    let jetons = await JetonImpression.findOne({ userId }).lean() // findOne()  car JetonImpression est un objet, pas un tableau

    return res.status(200).json({ jetons })
  } catch (error) {
    console.error(error)
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.userId
    // -1 = tri décroissant, donc le plus récent abonnement (celui qui expire le plus tard) arrive en premier
    const sub = await Subscription.findOne({ userId }).sort({ endDate: -1 })

    if (!sub) {
      return res.json({ status: 'NONE' })
    }

    if (sub.endDate < new Date()) {
      return res.json({ status: 'EXPIRED', endDate: sub.endDate })
    }

    return res.json({
      status: 'ACTIVE',
      endDate: sub.endDate,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const printFedapayReceipt = async (req, res) => {
  let qrcode = null
  try {
    const { referenceId } = req.params

    // 🟩 Recupérer la transaction dans la DB pour impression
    const transactionDb = await FedaPayTransaction.findOne({ referenceId })
    if (!transactionDb) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'Reference non trouvée' })
    }
    // Impression du ticket
    //console.log(transactionDb)

    // --- Vérification du montant ---
    const amount = Number(transactionDb.amount)
    if (isNaN(amount) || amount <= 0) {
      console.error(
        'Montant invalide dans la transaction :',
        transactionDb.amount,
      )
      return res.status(400).json({ error: 'Montant invalide' })
    }
    const safeAmount = amount

    const qrPayload = {
      id: transactionDb._id,
      amount: safeAmount,
      date: transactionDb.createdAt,
      status: transactionDb.status,
      method: transactionDb.method,
      ip: transactionDb.ip,
      country: transactionDb.country,
      type: 'AVD_Certificate',
    }

    try {
      const signature = crypto
        .createHmac('sha256', process.env.QR_SIGNING_SECRET)
        .update(JSON.stringify(qrPayload))
        .digest('base64')

      const qrObject = {
        data: qrPayload,
        signature,
      }
      // Vérifiez que toBuffer existe
      console.log('QRCode.toBuffer existe:', typeof QRCode.toBuffer)

      const qrString = JSON.stringify(qrObject)

      qrcode = await QRCode.toBuffer(qrString, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: 'M',
      })

      console.log('QR code généré, taille:', qrcode.length)

      // Vérification que c'est un buffer valide
      if (!qrcode || qrcode.length < 100) {
        throw new Error('QR code généré est vide ou trop petit')
      }
    } catch (error) {
      console.log(error)
    }

    const pdfBuffer = await new Promise((resolve, reject) => {
      try {
        const now = new Date()
        const doc = new PDFDocumentWithTables()
        const stream = new PassThrough()
        const chunks = []

        doc.pipe(stream)

        stream.on('data', (chunk) => chunks.push(chunk))
        // le buffer final n’est renvoyé que quand le stream émet end.
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)

        // HEADER LOGO
        console.log('Logo existe:', fs.existsSync('assets/logo.png'))

        doc.image('assets/logo.png', 40, 20, { width: 70 })
        doc.moveDown(1)

        doc
          .fontSize(10)
          .text('6 cours de la marne, 33800 Bordeaux', { align: 'center' })
        doc.text('+33 0559040100', { align: 'center' })
        doc.text('Numéro IFU: 06466570485', { align: 'center' })
        doc.text(`Date: ${now.toLocaleDateString()}`, { align: 'center' })
        doc.text(`Heure: ${now.toLocaleTimeString()}`, { align: 'center' })
        doc.moveDown(2)

        doc.fontSize(14).text('RECU CLIENT', {
          align: 'left',
        })
        doc.moveDown(3)

        // --- MARGES (UNE SEULE FOIS) ---
        const leftMargin = doc.page.margins?.left ?? 72
        const rightMargin = doc.page.margins?.right ?? 72
        const pageWidth = doc.page.width - leftMargin - rightMargin

        // --- TABLEAU PRODUIT ---
        doc.fontSize(12)

        const startX = leftMargin
        let currentY = doc.y

        const colItem = startX
        const colQty = startX + 80
        const colPrix = startX + 140
        const colTva = startX + 200
        const colMontant = startX + 260

        doc.text('Item', colItem, currentY)
        doc.text('Qty', colQty, currentY)
        doc.text('Prix', colPrix, currentY)
        doc.text('TVA', colTva, currentY)
        doc.text('Montant XOF', colMontant, currentY)

        // --- TRAIT SOUS LES EN-TÊTES ---
        const lineY = currentY + 15
        doc
          .moveTo(leftMargin, lineY)
          .lineTo(leftMargin + pageWidth, lineY)
          .stroke()

        currentY = lineY + 10

        doc.text('100', colItem, currentY)
        doc.text('1', colQty, currentY)
        doc.text(safeAmount.toFixed(2), colPrix, currentY)
        doc.text('18%', colTva, currentY)
        doc.text((safeAmount * 0.18).toFixed(2), colMontant, currentY)

        doc.moveDown(2)

        // --- TOTAL À PAYER ---
        const totalLabel = 'Total à payer:'
        const totalAmount = `${safeAmount.toFixed(2)} XOF`
        const totalWidth = doc.widthOfString(totalAmount)

        // --- PAYÉ AVEC ---
        const rawMethod = transactionDb.method
        const psp =
          rawMethod && rawMethod !== 'NaN' ? String(rawMethod) : 'Inconnu'

        //const psp = `${transactionDb.method}`

        let y = doc.y

        // --- TOTAL À PAYER ---
        doc.text(totalLabel, leftMargin, y)
        doc.text(totalAmount, leftMargin + pageWidth - totalWidth, y)

        doc.moveDown(2)

        // --- PAYÉ PAR ---
        doc.text('Payé par :', leftMargin)
        doc.moveDown(1)

        // --- PSP + MONTANT ---
        y = doc.y
        doc.text(psp, leftMargin, y)
        doc.text(totalAmount, leftMargin + pageWidth - totalWidth, y)

        doc.moveDown(2)

        // --- IDENTIFIANT CLIENT FEDAPAY ---
        const idLabel = 'Identifiant client Fedaypay:'
        const idValueRaw = transactionDb.transactionId
        const idValue = idValueRaw ? String(idValueRaw) : 'N/A'

        //const idValue = transactionDb.transactionId ?? ''
        const idWidth = doc.widthOfString(idValue)

        y = doc.y
        doc.text(idLabel, leftMargin, y)
        doc.text(idValue, leftMargin + pageWidth - idWidth, y)

        doc.moveDown(2)

        // --- TYPE ---
        y = doc.y

        const typeLabel = 'Type'
        const typeValue = 'BIENS & SERVICES'
        const typeWidth = doc.widthOfString(typeValue)

        doc.text(typeLabel + ':', leftMargin, y)
        doc.text(typeValue, leftMargin + pageWidth - typeWidth, y)

        doc.moveDown(2)

        // IMPORTANT : réinitialiser X
        doc.x = leftMargin

        // --- STATUT ---
        doc
          .fontSize(12)
          .text('PAIEMENT ACCEPTE', { align: 'left', underline: true })
        doc.moveDown(2)

        // --- DESCRIPTION ---
        doc.text(
          'Achat d’un pack de 3 jetons destinés à la génération d’attestations de vérification documentaire (AVD) sur zTravel Consulting ©. Scannez ce reçu pour en vérifier l’authenticité.',
          { align: 'left' },
        )
        doc.moveDown(1)

        const qrSize = 140
        const qrX = leftMargin + (pageWidth - qrSize) / 2

        // VÉRIFICATION CRITIQUE avant d'ajouter l'image
        console.log('qrcode global:', qrcode ? 'OK' : 'NULL')

        if (!qrcode || !Buffer.isBuffer(qrcode) || qrcode.length === 0) {
          console.error("QR Code invalide, impossible d'ajouter l'image")
          // Option 1: Ajouter un texte d'erreur
          doc.text('QR Code indisponible', { align: 'center' })
          doc.end()
          return
        }

        console.log('Insertion du QR code dans le PDF…')

        doc.image(qrcode, qrX, doc.y, {
          width: qrSize,
          height: qrSize,
        })
        doc.end()
        console.log('PDF terminé')
      } catch (error) {
        console.error('🔥 ERREUR DANS LE PDF :', error)
        reject(error)
      }
    })

    // Envoyer le PDF au client
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=reçu_${referenceId}.pdf`,
    )
    // Save the transaction within Hetzne
    /*const upload = await s3.send(
      new PutObjectCommand({
        Bucket: process.env.HETZNER_BUCKET,
        Key: `receipts/${transactionDb._id}.pdf`,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        ACL: 'public-read', // si tu veux un lien public
      }),
    )*/

    res.send(pdfBuffer)
  } catch (error) {
    console.error('🔥 ERREUR PDF :', error)
    res.status(500).json({ error: error.message || 'Erreur inconnue' })
  }
}

function isOfflineMode() {
  return process.env.MOMO_OFFLINE_MODE === 'true'
}

function simulateStatus(referenceId) {
  const now = Date.now()

  // On stocke l'heure de création si pas encore stockée
  if (!global._fakePayments) global._fakePayments = {}

  if (!global._fakePayments[referenceId]) {
    global._fakePayments[referenceId] = {
      createdAt: now,
      amount: 1500,
      currency: 'XOF',
      phone: '22961000000',
      userId: '69bec946fa3a8bbdaea6e13b',
    }
  }

  const payment = global._fakePayments[referenceId]
  const elapsed = now - payment.createdAt

  let status = 'PENDING'

  if (elapsed > 5000 && elapsed < 10000) {
    status = 'SUCCESSFUL'
  }

  if (elapsed > 10000) {
    status = 'FAILED'
  }

  return {
    status,
    raw: {
      amount: payment.amount.toString(),
      currency: payment.currency,
      externalId: `ORDER-${payment.createdAt}`,
      payer: { partyId: payment.phone },
      status,
    },
    transaction: {
      referenceId,
      financialTransactionId: status === 'SUCCESSFUL' ? '9876543210' : null,
      externalId: `ORDER-${payment.createdAt}`,
      amount: payment.amount,
      currency: payment.currency,
      phone: payment.phone,
      status,
      method: 'MTN_MOMO',
      user: payment.userId,
    },
  }
}
