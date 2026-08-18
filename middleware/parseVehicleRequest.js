// middleware/parseVehicleRequest.js
export const parseVehicleRequest = (req, res, next) => {
  try {
    console.log('🔄 ParseVehicleRequest - Types reçus:')
    console.log('  vehicles type:', typeof req.body.vehicles)
    console.log('  shipping type:', typeof req.body.shipping)

    // ⭐ Ne parser que si c'est une string
    if (req.body.vehicles && typeof req.body.vehicles === 'string') {
      req.body.vehicles = JSON.parse(req.body.vehicles)
      console.log('✅ Vehicles parsé (était string)')
    }

    if (req.body.shipping && typeof req.body.shipping === 'string') {
      req.body.shipping = JSON.parse(req.body.shipping)
      console.log('✅ Shipping parsé (était string)')
    }

    if (req.body.avdData && typeof req.body.avdData === 'string') {
      req.body.avdData = JSON.parse(req.body.avdData)
      console.log('✅ AVD Data parsé (était string)')
    }

    // Pour backward compatibility, créer les champs plats
    if (
      req.body.vehicles &&
      Array.isArray(req.body.vehicles) &&
      req.body.vehicles.length > 0
    ) {
      const firstVehicle = req.body.vehicles[0]
      Object.keys(firstVehicle).forEach((key) => {
        req.body[key] = firstVehicle[key]
      })
      console.log('✅ Flat fields created from first vehicle')
    }

    next()
  } catch (error) {
    console.error('❌ Erreur dans parseVehicleRequest:', error)
    return res.status(400).json({
      error: 'Invalid request data',
      details: error.message,
    })
  }
}
