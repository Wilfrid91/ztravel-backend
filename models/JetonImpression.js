import mongoose from 'mongoose'
const JetonImpressionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    jetons_total: { type: Number, required: true },
    jetons_restants: { type: Number, required: true },
    nbre_impressions: { type: Number, required: true, default: 0 }, // si nbre_impressions est ajoué aprrès créatioon de la DB
  },
  { timestamps: true },
)

export default mongoose.model('JetonImpression', JetonImpressionSchema)
