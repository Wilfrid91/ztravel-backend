import mongoose from 'mongoose'

const PaymentMethodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    type: {
      type: String,
      enum: [
        'VISA',
        'MASTERCARD',
        'AMEX',
        'MTN_MOMO',
        'MOOV_MONEY',
        'MOMO_TEST',
      ],
      required: true,
    },

    last4: {
      type: String,
      required: false,
    },

    token: {
      type: String,
      required: false,
    },

    statut: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'],
      default: 'ACTIVE',
    },

    expiration: {
      month: Number,
      year: Number,
    },

    jetons_par_carte: {
      type: Number,
      default: 3,
    },
  },
  { timestamps: true },
)

export default mongoose.model('PaymentMethod', PaymentMethodSchema)
