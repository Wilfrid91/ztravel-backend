const mongoose = require('mongoose')

const travelCardsSchema = new mongoose.Schema(
  {
    bigTitle: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: [true, 'image must be provided'] },
  },
  { timestamps: true } /* when it was created and when it was modified */,
  { collection: 'Cards' } // <-- nom explicite de la collection
)

module.exports = mongoose.model('Cards', travelCardsSchema)
