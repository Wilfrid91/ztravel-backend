import mongoose from 'mongoose'

const MTNRefundSchema = new mongoose.Schema(
  {
    // Référence initiale du paiement MTN (ex: 700536632)
    paymentFinancialTransactionId: {
      type: String,
      required: true,
      index: true,
    },

    // Référence du refund (UUID X-Reference-Id)
    refundReferenceId: {
      type: String,
      required: true,
      unique: true,
    },

    // Référence interne du paiement original (ton referenceId)
    referenceIdToRefund: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      required: true,
      default: 'EUR',
    },

    externalId: {
      type: String,
      required: true,
    },

    payerMessage: {
      type: String,
      default: '',
    },

    payeeNote: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['PENDING', 'SUCCESSFUL', 'FAILED'],
      default: 'PENDING',
    },

    // Réponse MTN du refund (pas du paiement)
    refundRawResponse: {
      type: Object,
      default: {},
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
)

export default mongoose.model('MTNRefund', MTNRefundSchema)
