import mongoose from 'mongoose'

const ContactSchema = new mongoose.Schema(
  {
    // use dynamic html loaded from server side
    contact: { type: String, required: true },
    //email: { type: String, required: true },
    //message: { type: String, required: true },
    //captcha: { type: String }, // si tu veux stocker le code entré
  },
  { timestamps: true },
)

export default mongoose.model('Contact', ContactSchema)
