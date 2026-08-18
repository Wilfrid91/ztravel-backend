import mongoose from 'mongoose'

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED'], default: 'ACTIVE' },
  },
  { timestamps: true },
)

export default mongoose.model('Subscription', subscriptionSchema)
