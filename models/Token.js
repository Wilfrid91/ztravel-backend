import mongoose from 'mongoose'
/* The goal of this file is to generate a token to be sent to the user when he has forgotten his password */
const TokenSchema = new mongoose.Schema(
  {
    refreshToken: { type: String, required: true },
    ip: { type: String, required: true },
    userAgent: { type: String, required: true },
    isValid: { type: Boolean, default: true },
    user: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
)

const Token = mongoose.model('Token', TokenSchema)

export default Token
