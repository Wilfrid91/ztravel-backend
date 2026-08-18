import mongoose from 'mongoose'

const FedapayRefundSchema = new mongoose.Schema(
  {
    // UUID interne généré par toi pour identifier le refund
    refundReferenceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ID du payout retourné par FedaPay
    fedapayPayoutId: {
      type: Number,
      default: null,
      index: true,
    },

    // ID du customer FedaPay (obligatoire pour refund)
    customerId: {
      type: Number,
      required: true,
    },

    // Montant remboursé
    amount: {
      type: Number,
      required: true,
    },

    // Devise (XOF, EUR…)
    currency: {
      type: String,
      default: 'XOF',
    },

    // Message envoyé au client
    payerMessage: {
      type: String,
      default: '',
    },

    // Statut du refund
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'],
      default: 'PENDING',
    },

    // Réponse brute FedaPay (utile pour audit / PDF)
    fedapayRawResponse: {
      type: Object,
      default: {},
    },

    // Lien avec ta transaction interne (UUID du paiement initial)
    originalPaymentUUID: {
      type: String,
      required: true,
      index: true,
    },

    // Lien avec ton user interne
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
)

export default mongoose.model('FedapayRefund', FedapayRefundSchema)
