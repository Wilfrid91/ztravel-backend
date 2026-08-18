// models/Image.js
import mongoose from 'mongoose'

const imageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number },
  uploadDate: { type: Date, default: Date.now },
})

const Image = mongoose.model('Image', imageSchema)

export default Image
