import mongoose from 'mongoose'

const cguConsentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    accepted: {
      type: Boolean,
      default: false,
    },
    acceptedAt: {
      type: Date,
      default: Date.now,
    },
    version: {
      type: String,
      default: '1.0',
    },
  },
  { collection: 'cgu_consent' },
)

export default mongoose.model('CGUConsent', cguConsentSchema)
