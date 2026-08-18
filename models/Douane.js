import mongoose from 'mongoose'

// ============================
// 🔹 Remarques
// ============================
const RemarkDetailsSchema = new mongoose.Schema(
  {
    title: { type: String },
    list: [{ type: String }],
  },
  { _id: false },
)

const RemarkSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['warning', 'info', 'success'],
      required: true,
    }, // ✅ AJOUT success
    text: { type: String, required: true },
    details: { type: RemarkDetailsSchema },
  },
  { _id: false },
)

// ============================
// 🔹 Scénarios (pour l'étape 5)
// ============================
const ScenarioSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    steps: [{ type: String }],
  },
  { _id: false },
)

// ============================
// 🔹 Étapes
// ============================
const StepSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    title: { type: String, required: true },

    // Peut être : string, { item, subItems }, ou simple chaîne
    instructions: [{ type: mongoose.Schema.Types.Mixed }],
    description: [{ type: mongoose.Schema.Types.Mixed }],

    // ✅ AJOUT scenarios
    scenarios: [ScenarioSchema],
  },
  { _id: false },
)

// ============================
// 🔹 TABLEAU MARCHANDISES DIVERSES (tax_table)
// ============================
const TaxTableItemSchema = new mongoose.Schema(
  {
    code: { type: String },
    signification: { type: String },
    depend_du_produit: { type: Boolean },
    notes: { type: String },
  },
  { _id: false },
)

// ============================
// 🔹 TABLEAU VÉHICULES (vehicle_tax_tables)
// ============================
const VehicleTaxItemSchema = new mongoose.Schema(
  {
    taxe: { type: String },
    taux: { type: String },
    applicable: { type: Boolean },
    notes: { type: String },
  },
  { _id: false },
)

const VehicleTaxTablesSchema = new mongoose.Schema(
  {
    neuf: {
      title: { type: String },
      taxes: [VehicleTaxItemSchema],
    },
    occasion: {
      title: { type: String },
      taxes: [VehicleTaxItemSchema],
    },
  },
  { _id: false },
)

// ============================
// 🔹 Sous‑sections
// ============================
const SubsectionSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, required: true },
    anchor: { type: String, required: true },
    description: { type: String },

    remark: [RemarkSchema],
    steps: [StepSchema],
    tax_table: [TaxTableItemSchema],
    vehicle_tax_tables: VehicleTaxTablesSchema,

    // 🔹 Ajout éventuel d'images et items
    images: [{ type: String }],
    items: [{ type: String }],
  },
  { _id: false },
)

// ============================
// 🔹 Sections
// ============================
const SectionSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, required: true },
    anchor: { type: String, required: true },
    description: { type: String },

    remark: [RemarkSchema],
    subsections: [SubsectionSchema],
    steps: [StepSchema],
  },
  { _id: false },
)

// ============================
// 🔹 Guide complet
// ============================
const GuideDouaneSchema = new mongoose.Schema({
  image: { type: String },
  title: { type: String, required: true },
  anchor: { type: String, required: true },
  sections: { type: [SectionSchema], required: true },
})

export default mongoose.model('GuideDouane', GuideDouaneSchema)
