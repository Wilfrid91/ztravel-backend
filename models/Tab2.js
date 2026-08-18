import mongoose from 'mongoose'
const { Schema } = mongoose

// Schéma pour les sous-éléments de liste
const SubItemSchema = new Schema({
  text: {
    type: String,
    required: true,
  },
})

// Schéma pour les éléments de liste (peut contenir des sous-éléments)
const ListItemSchema = new Schema({
  item: {
    type: String,
  },
  subItems: {
    type: [SubItemSchema],
    default: [],
  },
})

// Schéma pour les détails des remarques
const RemarkDetailSchema = new Schema({
  title: {
    type: String,
  },
  list: {
    type: [ListItemSchema],
    default: [],
  },
})

// Schéma pour une remarque
const RemarkSchema = new Schema({
  type: {
    type: String,
    enum: ['info', 'warning', 'success'],
    default: 'info',
  },
  text: {
    type: String,
    required: true,
  },
  details: {
    type: RemarkDetailSchema,
  },
})

// Schéma pour un chapitre
const ChapterSchema = new Schema({
  image: {
    type: String,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  images: {
    type: [String],
    default: [],
  },
  remark: {
    type: [RemarkSchema],
    default: [],
  },
})

// Schéma principal pour la liste de chapitres
const Tab2Schema = new Schema({
  chapters: {
    type: [ChapterSchema],
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

// Middleware pour mettre à jour updatedAt
Tab2Schema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

// Exporte le modèle
export default mongoose.model('Departure', Tab2Schema)
