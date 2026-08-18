import mongoose from 'mongoose'

const ImpressionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      unique: true, // 1 seul compteur par utilisateur
    },

    impressions: {
      type: Number,
      default: 0,
    },

    limit: {
      type: Number,
      default: 3, // Faire des offres premiums
    },

    lastResetAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

export default mongoose.model('Impression', ImpressionSchema)
