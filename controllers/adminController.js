import { StatusCodes } from 'http-status-codes'
import axios from 'axios'
import User from '../models/User.js'
import Transaction from '../models/MtnRequestToPayTransaction.js'
import MTNRefund from '../models/MTNRefund.js'
import FedapayRefund from '../models/FedapayRefund.js'
import FedaPayTransaction from '../models/FedaPay.js'
import VisitTracker from '../models/VisitTracker.js'
import { getMomoToken } from './authorizationController.js'

import fs from 'fs'
import crypto from 'crypto'
import QRCode from 'qrcode'
import { generateMTNMomoRefundPDF } from '../utils/pdf/fullPDFHandler.js'
import { FedaPay, Payout } from 'fedapay'

export const adminDashboard = async (req, res) => {
  // Ici tu es sûr que :
  // - l'utilisateur est authentifié
  // - l'utilisateur est admin
  // - req.user contient { nom, prenom, email, userId, role }
  const users = await User.find({}).select('-password')

  res.status(StatusCodes.OK).json({
    users,
    count: users.length,
  })
}

export const getUserBySearch = async (req, res) => {
  const { search = '' } = req.query // search est uns strign

  if (!search || typeof search !== 'string') {
    return res.status(400).json({ msg: 'Paramètre search invalide' })
  }
  try {
    // Recherche partielle (regex) => search=zin trouve aussi “Zinsou”
    // 'i': "insensitive", c’est‑à‑dire insensible à la casse. => ignore la différence entre majuscules et minuscules
    const user = await User.findOne({
      $or: [
        { email: { $regex: search, $options: 'i' } },
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } },
      ],
    }).select('-password')

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur introuvable' })
    }

    res.status(200).json({ user })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      msg: 'Erreur serveur',
      error: error.message,
    })
  }
}

/**
 * Return all the payments
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const getAllPaymentData = async (req, res) => {
  try {
    const [fedapayTx, momoTx] = await Promise.all([
      FedaPayTransaction.find({}).lean(),
      Transaction.find({}).lean(),
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
    //console.log(normalizedTransactions)
    return res.status(200).json(normalizedTransactions)
  } catch (error) {
    console.log(error)
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 * @returns
 */
export const refundMomoMTN = async (req, res) => {
  const { payload } = req.body
  if (!payload) {
    return res.status(400).json({ error: 'payload manquant' })
  }
  console.log(payload)
  const userId = req.user.userId

  try {
    // 1 - Generation du UUID
    const referenceId = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
    const refundReferenceId = referenceId()

    // 2 Obtention du token MTN momo
    const tokenData = await getMomoToken(
      'disbursement',
      process.env.MTN_MOMO_DISBURSEMENT_SUB_KEY_REST,
    )

    if (!tokenData.success) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Impossible d'obtenir le token MTN",
        details: tokenData.details,
      })
    }
    const accessToken = tokenData.accessToken
    console.log(accessToken)

    // destructuration
    const {
      amount,
      currency,
      payer,
      payerMessage,
      payeeNote,
      financialTransactionId,
    } = payload

    // recupère la reference initiale du paiement en DB
    const tx = await Transaction.findOne({
      financialTransactionId,
    })
    if (!tx) {
      {
        return res.status(404).json({
          success: false,
          message: 'Transaction introuvable',
        })
      }
    }

    console.log({ tx })
    // Verifier s'il a dejà été remboursé
    const existingRefund = await MTNRefund.findOne({
      paymentFinancialTransactionId: tx.paymentFinancialTransactionId,
    })

    if (existingRefund) {
      return res.status(400).json({
        success: false,
        message: 'Ce paiement MTN MoMo a déjà été remboursé.',
      })
    }

    // 3 Preparation de la requête
    const externalId = `${userId}-${Date.now()}`

    const mtnResponse = await axios.post(
      `${process.env.MTN_MOMO_BASE_URL}/disbursement/v1_0/refund`,
      {
        currency,
        amount: amount.toString(),
        payer,
        externalId,
        payerMessage,
        payeeNote,
        referenceIdToRefund: tx.referenceId, // => "UUID-REQUEST-TO-PAY"
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Reference-Id': refundReferenceId,
          'X-Target-Environment': 'sandbox',
          'Ocp-Apim-Subscription-Key':
            process.env.MTN_MOMO_DISBURSEMENT_SUB_KEY_REST,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'PostmanRuntime/7.32.2', // contourne le firewall
          'Cache-Control': 'no-cache',
        },
      },
    )

    // MTN a besoin de temps pour traiter la transaction
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // refundReferenceId (UUID du refund)
    // referenceIdToRefund (UUID(reference) du paiement initial)
    // paymentFinancialTransactionId (ID MTN du paiement initial)
    await MTNRefund.create({
      refundReferenceId,
      referenceIdToRefund: tx.referenceId,
      paymentFinancialTransactionId: tx.financialTransactionId,
      amount,
      currency,
      externalId,
      payerMessage,
      payeeNote,
      status: 'PENDING',
      userId,
    })

    return res.status(StatusCodes.OK).json({
      success: true,
      refundReferenceId,
      mtnResponse: mtnResponse.data,
    })
  } catch (error) {
    console.log('error.message =', error.message)
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du requestToPay',
      details: error.response?.data || error.message,
    })
  }
}

// Appel server to server
export const getRefundMomoMTNStatus = async (req, res) => {
  // reference du refund
  const { refundReferenceId } = req.params

  try {
    // 3) Charger le refund existant
    const refundDoc = await MTNRefund.findOne({ refundReferenceId })
    if (!refundDoc) {
      return res.status(404).json({
        success: false,
        message: 'Refund introuvable',
      })
    }
    console.log('xxxxxxxxxxx=', refundDoc.referenceIdToRefund)

    // 4) Charger la transaction initiale - récupérer le paiement initial
    const tx = await Transaction.findOne({
      referenceId: refundDoc.referenceIdToRefund,
    })

    const tokenData = await getMomoToken(
      'disbursement',
      process.env.MTN_MOMO_DISBURSEMENT_SUB_KEY_REST,
    )
    if (!tokenData.success) {
      return res.status(500).json({
        success: false,
        message: "Impossible d'obtenir le token MTN",
      })
    }

    const accessToken = tokenData.accessToken

    const mtnRefundResponse = await axios.get(
      `${process.env.MTN_MOMO_BASE_URL}/disbursement/v1_0/refund/${refundReferenceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Target-Environment': 'sandbox',
          'Ocp-Apim-Subscription-Key':
            process.env.MTN_MOMO_DISBURSEMENT_SUB_KEY_REST,
        },
      },
    )

    const refund = await MTNRefund.findOneAndUpdate(
      { refundReferenceId },
      {
        refundReferenceId,
        referenceIdToRefund: tx.referenceId,
        paymentFinancialTransactionId: tx.financialTransactionId, // la ref initiale
        externalId: mtnRefundResponse.data.externalId,
        amount: Number(mtnRefundResponse.data.amount),
        currency: mtnRefundResponse.data.currency,
        status: mtnRefundResponse.data.status,
        refundRawResponse: mtnRefundResponse.data, // réponse du refund
        userId: req.user.userId,
      },
      { upsert: true, new: true },
    )

    return res.json({
      success: true,
      status: mtnRefundResponse.data.status,
      raw: mtnRefundResponse.data,
      refund,
    })
  } catch (error) {
    console.error(
      'Erreur checkMtnMomoRefundStatus:',
      error.response?.data || error,
    )
    console.log('ERREUR MTN MOMO REFUND =', error.response?.data)

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

export const printRefundReceipt = async (req, res) => {
  const { refundReferenceId } = req.params

  if (!refundReferenceId) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Reference ID manquant',
    })
  }

  try {
    // 3) Charger le refund existant
    const refundDoc = await MTNRefund.findOne({ refundReferenceId })
    if (!refundDoc) {
      return res.status(404).json({
        success: false,
        message: 'Refund introuvable',
      })
    }
    console.log('xxxxxxxxxxx=', refundDoc.referenceIdToRefund)

    // 4) Charger la transaction initiale - récupérer le paiement initial
    const tx = await Transaction.findOne({
      referenceId: refundDoc.referenceIdToRefund,
    })

    const tokenData = await getMomoToken(
      'disbursement',
      process.env.MTN_MOMO_DISBURSEMENT_SUB_KEY_REST,
    )
    if (!tokenData.success) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: 'Token MTN invalide' })
    }

    const accessToken = tokenData.accessToken

    const mtnRefundResponse = await axios.get(
      `${process.env.MTN_MOMO_BASE_URL}/disbursement/v1_0/refund/${refundReferenceId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Target-Environment': 'sandbox',
          'Ocp-Apim-Subscription-Key':
            process.env.MTN_MOMO_DISBURSEMENT_SUB_KEY_REST,
        },
      },
    )

    const refund = await MTNRefund.findOneAndUpdate(
      { refundReferenceId },
      {
        refundReferenceId,
        referenceIdToRefund: tx.referenceId,
        paymentFinancialTransactionId: tx.financialTransactionId, // la ref initiale
        externalId: mtnRefundResponse.data.externalId,
        amount: Number(mtnRefundResponse.data.amount),
        currency: mtnRefundResponse.data.currency,
        status: mtnRefundResponse.data.status,
        refundRawResponse: mtnRefundResponse.data, // réponse du refund
        userId: req.user.userId,
      },
      { upsert: true, new: true },
    )

    const qrPayload = {
      id: refund.id,
      amount: refund.amount,
      date: refund.createdAt,
      status: refund.status,
      type: 'REFUND_DATA',
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

      const qrString = JSON.stringify(qrObject)
      const qrcode = await QRCode.toBuffer(qrString, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: 'M',
      })

      // Vérification que c'est un buffer valide
      if (!qrcode || qrcode.length < 100) {
        throw new Error('QR code généré est vide ou trop petit')
      }

      // print the client receipt along with the QR code- The Ticket component will render the ticket on client side
      const pdfBuffer = await generateMTNMomoRefundPDF(refund, 'client', qrcode)

      if (!pdfBuffer) {
        throw new Error('PDF non généré')
      }

      fs.writeFileSync('test.pdf', pdfBuffer)
      // RefundMTnForm.jsx
      return res
        .status(StatusCodes.OK)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=recu.pdf',
        })
        .end(pdfBuffer)
    } catch (qrError) {
      console.error('Erreur pendant la génération QR code:', qrError)
      // Fallback: QR code simple avec juste l'ID
      const fallbackData = {
        id: refund.id,
        signature: signature,
        timestamp: Date.now(),
      }

      const fallbackQR = await QRCode.toBuffer(JSON.stringify(fallbackData), {
        width: 200,
        margin: 1,
      })

      console.log('QR code fallback généré, taille:', fallbackQR.length)

      const pdfBuffer = await generateMTNMomoRefundPDF(refund, 'client', qrcode)
      // Envoyer le PDF (en dehors du bloc try/catch)
      if (!pdfBuffer) {
        throw new Error('Impossible de générer le PDF')
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Ticket_client_${refund._id}.pdf`,
      )

      return res.status(StatusCodes.OK).json({
        status: 'SUCCESS',
        message: 'PDF envoyé au client',
        pdfBase64: pdfBuffer.toString('base64'), // Le client pourra décoder
        pdfSize: pdfBuffer.length,
      })
    }
  } catch (error) {
    console.error('Erreur MTN refund response:', error.response?.data || error)
    console.log('ERREUR MTN REFUND RESPONSE  =', error.response?.data)

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
 * Pour faire un payout FedaPay, tu dois connaître :
 * customer.id (le client FedaPay)
 * amount (montant à rembourser)
 * currency (XOF)
 * description (ex: "Refund transaction 449695")
 * @param {*} req
 * @param {*} res
 */
export const refundFedaPay = async (req, res) => {
  try {
    const userId = req.user.userId
    const refundReferenceId = crypto.randomUUID() // ou votre fonction referenceId()
    const { amount, payerMessage, transactionId, currency } = req.body.payload

    if (!amount || !transactionId) {
      return res.status(400).json({
        success: false,
        message: 'amount et transactionId sont obligatoires',
      })
    }

    const tx = await FedaPayTransaction.findOne({ transactionId })
    if (!tx) {
      return res.status(404).json({
        success: false,
        message: 'Transaction introuvable',
      })
    }

    // Initialisation FedaPay
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment(process.env.FEDAPAY_ENV || 'sandbox')

    // Récupération de la balance XOF pour obtenir son ID (optionnel)
    // Si vous n'avez qu'une seule balance, ce paramètre n'est pas obligatoire
    const balances = await axios.get(
      `${process.env.FEDAPAY_API_URL || 'https://sandbox-api.fedapay.com'}/v1/balances`,
      {
        headers: { Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}` },
      },
    )

    const xofBalance = balances.data.data?.find(
      (b) => b.currency?.iso === 'XOF',
    )

    if (!xofBalance && process.env.FEDAPAY_ENV === 'live') {
      return res.status(400).json({
        success: false,
        message:
          'Aucune balance XOF disponible. Vérifiez votre compte FedaPay.',
      })
    }

    // Création du payout avec balance_id si disponible
    const payoutParams = {
      amount: Math.round(amount),
      currency: { iso: currency?.toUpperCase() || 'XOF' },
      mode: 'mtn_bj', // ou 'mtn_open'
      description:
        payerMessage || `Remboursement pour la transaction ${transactionId}`,
      callback_url: `${process.env.BASE_URL || process.env.NGROK_URL}/api/fedapay/callback/refund`,
      customer: {
        id: tx.customerId,
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
        phone_number: {
          number: '+22966000001',
          country: 'BJ',
        },
      },
    }

    // Ajout du balance_id si trouvé
    if (xofBalance) {
      payoutParams.balance_id = xofBalance.id
    }

    const payoutRes = await axios.post(
      `${process.env.FEDAPAY_API_URL || 'https://sandbox-api.fedapay.com'}/v1/payouts`,
      payoutParams,
      {
        headers: {
          Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    )

    const payout = payoutRes.data

    await FedapayRefund.create({
      refundReferenceId,
      fedapayPayoutId: payout.id,
      customerId: tx.customerId,
      amount,
      currency,
      payerMessage,
      status: 'PENDING',
      userId,
      originalPaymentUUID: tx.referenceId,
    })

    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'Remboursement initié avec succès',
      payout: {
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency_id,
        status: payout.status,
        customerId: payout.customer_id,
        description: payout.description,
      },
    })
  } catch (error) {
    console.error(
      'Erreur complète FedaPay:',
      error.response?.data || error.message,
    )
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du remboursement',
      details: error.response?.data,
    })
  }
}

export const getRefundFedapayStatus = async (req, res) => {
  const { payoutId } = req.params
  try {
    // Appel FedaPay pour vérifier le statut
    const payout = await Payout.retrieve(payoutId)

    return res.json({
      status: payout.status,
    })
  } catch (error) {
    return res.status(500).json({ status: 'FAILED' })
  }
}

export const getAllRefundData = async (req, res) => {
  try {
    const [fedapayRfd, momoRfd] = await Promise.all([
      FedapayRefund.find({}).lean(),
      MTNRefund.find({}).lean(),
    ])

    console.log([fedapayRfd, momoRfd])
    const normalizedTransactions = [
      ...fedapayRfd.map((tx) => ({
        id: tx._id.toString(),
        provider: 'FEDAPAY',
        createdAt: tx.createdAt || tx.updatedAt || null,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        reference: tx.refundReferenceId,
        originalPaymentId: tx.originalPaymentUUID,
        raw: tx.fedapayRawResponse,
      })),

      ...momoRfd.map((tx) => ({
        id: tx._id.toString(),
        provider: 'MTN_MOMO',
        createdAt: tx.createdAt || tx.updatedAt || null,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        reference: tx.refundReferenceId,
        originalPaymentId: tx.referenceIdToRefund,
        raw: tx.refundRawResponse,
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

export const disableUser = async (req, res) => {
  try {
    const userId = req.params.selectedId
    const deletedUser = await User.findByIdAndDelete(userId)
    if (!deletedUser) {
      return res.status(404).json({ message: 'Utilisateur introuvable' })
    }
    res
      .status(StatusCodes.OK)
      .json({ message: 'Utilisateur supprimé avec succès' })
  } catch (error) {
    res
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Erreur lors de la suppression',
      error: error.message,
    })
  }
}

export const checkUserCgu = async (req, res) => {
  try {
    const { search } = req.query

    if (!search) {
      return res.status(400).json({ msg: 'Paramètre search invalide' })
    }

    const user = await User.findOne({ email: search })

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur introuvable' })
    }

    return res.status(200).json({
      email: user.email,
      cguAccepted: user.cguAccepted || false,
      cguAcceptedAt: user.cguAcceptedAt || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const getVisitTracker = async (req, res) => {
  try {
    const pagesPerUser = await VisitTracker.aggregate([
      // 1. Exclure les endpoints techniques
      {
        $match: {
          path: {
            $nin: [
              '/track',
              '/api/v1/auth/login',
              '/api/v1/auth/admin/analytics',
            ],
          },
        },
      },

      // 2. Trier chronologiquement
      {
        $sort: {
          timestamp: 1,
        },
      },

      // 3. UN SEUL GROUPE PAR VISITEUR
      {
        $group: {
          _id: '$visitorId',

          // Toutes les pages visitées
          pages: {
            $addToSet: '$path',
          },

          // Nombre total d'événements
          visits: {
            $sum: 1,
          },

          // Première visite
          firstVisit: {
            $first: '$timestamp',
          },

          // Dernière visite
          lastVisit: {
            $last: '$timestamp',
          },

          // On conserve les userId rencontrés dans l'ordre
          userIds: {
            $push: '$userId',
          },
        },
      },

      // 4. Récupérer le dernier userId non null
      {
        $addFields: {
          validUserIds: {
            $filter: {
              input: '$userIds',
              as: 'userId',
              cond: {
                $ne: ['$$userId', null],
              },
            },
          },
        },
      },

      // 5. Prendre le dernier userId connu
      {
        $addFields: {
          userId: {
            $arrayElemAt: ['$validUserIds', -1],
          },
        },
      },

      // 6. Calculs
      {
        $addFields: {
          distinctPages: {
            $size: '$pages',
          },

          isLoggedUser: {
            $ne: ['$userId', null],
          },

          visitedHome: {
            $in: ['/', '$pages'],
          },
        },
      },

      // 7. Recherche de l'utilisateur
      {
        $lookup: {
          from: 'CustomerDataBase',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },

      // 8. Déplier user
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },

      // 9. Réponse finale
      {
        $project: {
          _id: 0,

          visitorId: '$_id',

          userId: 1,

          nom: '$user.nom',
          prenom: '$user.prenom',
          email: '$user.email',

          visits: 1,
          pages: 1,
          distinctPages: 1,
          visitedHome: 1,
          isLoggedUser: 1,

          firstVisit: 1,
          lastVisit: 1,
        },
      },

      // 10. Les plus récents en premier
      {
        $sort: {
          lastVisit: -1,
        },
      },
    ])

    /*console.log(
      'VISITEURS AGRÉGÉS:',
      pagesPerUser.map((v) => ({
        visitorId: v.visitorId,
        userId: v.userId,
        visits: v.visits,
        distinctPages: v.distinctPages,
      })),
    )*/

    return res.status(200).json({
      success: true,
      totalVisitors: pagesPerUser.length,
      visitors: pagesPerUser,
    })
  } catch (error) {
    console.error('Erreur getVisitTracker:', error)

    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}
