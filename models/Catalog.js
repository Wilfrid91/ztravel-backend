// models/Catalog.js
import mongoose from 'mongoose'

const imageItemSchema = new mongoose.Schema({
  url: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: String, default: '' },
  reference: { type: String, default: '' },
})

const catalogSchema = new mongoose.Schema(
  {
    categorie: { type: String, required: true },
    menu: {
      type: String,
      required: false,
    },
    name: {
      type: String,
      required: true,
    },
    image: {
      type: [imageItemSchema], // ✅ tableau d'objets avec les champs ci-dessus
      required: true,
      default: [],
    },
    catalogue: {
      type: String, // chemin vers le PDF (optionnel)
      required: false,
    },
    totalProducts: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      default: 'catalog',
    },
    catalogPath: {
      type: String, // chemin racine des images (optionnel)
      required: false,
    },
  },
  { timestamps: true },
)

export default mongoose.model('Catalog', catalogSchema)
