import mongoose from 'mongoose'

const FreeSimulationSchema = new mongoose.Schema({
  anonymId: { type: String, required: true },
  // Pour un flag d'état initial, c'est toujours default qu'on veut
  freeSimulationUsed: { type: Boolean, default: false },
  ipHash: { type: String },
  creatAt: { type: Date, default: Date.now },
})
/**
 * loggez toute écriture sur le flag
 */
// Dans le schéma FreeSimulation
FreeSimulationSchema.post('findOneAndUpdate', (doc) => {
  console.log(
    '📝 UPDATE FreeSimulation:',
    doc?._id,
    '→ used:',
    doc?.freeSimulationUsed,
  )
})
FreeSimulationSchema.post('save', (doc) => {
  console.log(
    '📝 SAVE FreeSimulation:',
    doc._id,
    '→ used:',
    doc.freeSimulationUsed,
  )
})

export default mongoose.model('FreeSimulation', FreeSimulationSchema)
