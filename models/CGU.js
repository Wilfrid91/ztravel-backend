import mongoose from 'mongoose'

const cguSchema = new mongoose.Schema(
  {
    cgu: {
      type: String,
      required: true,
    },
    version: {
      type: String,
      default: '1.0',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: 'cgu' },
)

export default mongoose.model('CGU', cguSchema)
