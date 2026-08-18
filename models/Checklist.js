import mongoose from 'mongoose'

// Schéma pour une étape (ex: "Télécharger Astrill")
const StepSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  instructions: {
    type: [String],
    default: [],
  },
})

// Schéma pour une sous-section (ex: "Installer, configurer et tester votre VPN")
const SubsectionSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  anchor: {
    type: String,
    required: true,
    unique: true, // Assure que chaque ancre est unique
  },
  description: {
    type: String,
  },
  remark: {
    type: [String],
    default: [],
  },
  images: {
    type: [String],
    default: [],
  },
  steps: {
    type: [StepSchema],
    default: [],
  },
  items: {
    type: [String],
    default: [],
  },
})

// Schéma pour une section (ex: "Préparer son téléphone et Internet")
const SectionSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  anchor: {
    type: String,
    required: true,
    unique: true,
  },
  content: {
    type: String,
  },
  subsections: {
    type: [SubsectionSchema],
    default: [],
  },
})

// Schéma principal pour la table des matières
const TableOfContentsSchema = new mongoose.Schema({
  image: { type: String },
  title: {
    type: String,
    required: true,
  },
  sections: {
    type: [SectionSchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Met à jour la date de modification avant chaque sauvegarde
TableOfContentsSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

// Exporte le modèle
export default mongoose.model('TableOfContents', TableOfContentsSchema)
