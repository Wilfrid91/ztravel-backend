import mongoose from 'mongoose'

const FedaPayTransactionSchema = new mongoose.Schema(
  {
    transactionId: { type: Number, required: true, unique: true },
    paymentUrl: { type: String },
    referenceId: { type: String },
    customerId: { type: String },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'canceled', 'declined'],
      default: 'pending',
    },
    customerEmail: String,
    customerName: String,
    brand: { type: String },
    number: { type: String }, // numéro de téléphone
    country: { type: String },
    method: { type: String },
    ip: { type: String },
    channel: { type: String },
    region: { type: String },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },

  { timestamps: true },
)
// Crée un modèle nommé Transaction” basé sur le schéma FedaPayTransactionSchema
export default mongoose.model('FedaPayTransaction', FedaPayTransactionSchema)
