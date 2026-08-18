import mongoose from 'mongoose'

const StepSchema = new mongoose.Schema({
  number: { type: Number },
  title: { type: String },
  instructions: [{ type: String }],
})

const GuideAvantDePartirSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    remark: [{ type: String }],
    category: { type: String },
    images: [{ type: String }],
    items: [{ type: String }],
    steps: { type: [StepSchema], required: false, default: [] },
  },
  { timestamps: true },
  { collection: 'GuideAvantDePartir' },
)

export default mongoose.model('GuideAvantDePartir', GuideAvantDePartirSchema)
