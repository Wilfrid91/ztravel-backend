import mongoose from 'mongoose'

const CodeSHSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  tauxDD: { type: Number, required: true }, // ex : 20
  tauxTVA: { type: Number, default: 18 }, // 18% par défaut
  tauxPCS: { type: Number, default: 0.8 },
  tauxPC: { type: Number, default: 0.5 },
  tauxPS: { type: Number, default: 0.2 },
  tauxRAU: { type: Number, default: 0.5 },
  tauxRS: { type: Number, default: 1 },
  tauxAIB: { type: Number, default: 1 },
})
//il prend le nom du modèle : "CodeSH", le met en minuscule, le met au pluriel => il cree la collection : codeshs
export default mongoose.model('CodeSH', CodeSHSchema)
