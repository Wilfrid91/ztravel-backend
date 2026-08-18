const ArticleSchema = new mongoose.Schema({
  numero: Number,
  description: String,
  codeSH: String,
  quantite: Number,
  valeurUSD: Number,
  valeurCFA: Number,
  taux: Object,
  taxes: Object,
  totalTaxes: Number,
})

const AVDSchema = new mongoose.Schema({
  avdNumber: String,
  tauxChange: Number,
  cifTotalUSD: Number,
  valeurDouaneTotalCFA: Number,
  articles: [ArticleSchema],
})

export default mongoose.model('AVD', AVDSchema)
