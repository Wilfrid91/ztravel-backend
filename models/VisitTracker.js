import mongoose from 'mongoose'

const visitTrackerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerDataBase',
      default: null,
      index: true,
    },

    visitorId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    sessionId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },

    path: {
      type: String,
      required: true,
      trim: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
)

const VisitTracker = mongoose.model('VisitTracker', visitTrackerSchema)

export default VisitTracker
