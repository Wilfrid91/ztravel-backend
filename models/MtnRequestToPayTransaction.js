// models/Transaction.js
import mongoose from 'mongoose'

const transactionSchema = new mongoose.Schema(
  {
    referenceId: { type: String, required: true, index: true },
    financialTransactionId: { type: String },
    externalId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'EUR' },
    phone: { type: String },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESSFUL', 'FAILED'],
      default: 'PENDING',
    },
    method: { type: String, default: 'MTN_MOMO' },
    rawResponse: { type: Object },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optionnel
  },
  { timestamps: true },
)

export default mongoose.model('Transaction', transactionSchema)
