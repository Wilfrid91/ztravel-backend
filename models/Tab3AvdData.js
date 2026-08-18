import mongoose from 'mongoose'

//
// 🔹 Sous‑schémas
//

// Remarques simples
const RemarkSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['info', 'warning', 'success'],
      required: true,
    },
    text: { type: String, required: true },
  },
  { _id: false },
)

// Étapes
const StepSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    title: { type: String, required: true },
    instructions: [{ type: String, required: true }],
  },
  { _id: false },
)

// Chapitre
const ChapterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },

    images: [{ type: String }],

    remark: [RemarkSchema],

    steps: [StepSchema],

    quote: { type: String },
    table: { type: String },
    video: { type: String },
    code: { type: String },
  },
  { _id: false },
)

//
// 🔹 Schéma principal
//

const VehicleUserGuideSchema = new mongoose.Schema(
  {
    chapters: {
      type: [ChapterSchema],
      required: true,
    },
  },
  { timestamps: true },
)

export default mongoose.model('VehicleUserGuide', VehicleUserGuideSchema)
