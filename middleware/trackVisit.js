import VisitTracker from '../models/VisitTracker.js'

/**
 * Enregistrer une visite
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
export const trackVisit = async (req, res) => {
  try {
    console.log('========== TRACK VISIT ==========')

    console.log('HEADERS:', {
      visitorId: req.headers['x-visitor-id'],
      contentType: req.headers['content-type'],
    })

    console.log('BODY:', req.body)

    console.log('USER:', req.user)

    const visitorId = req.headers['x-visitor-id']
    const { path } = req.body || {}

    console.log('visitorId =', visitorId)
    console.log('path =', path)

    if (!visitorId || !path) {
      console.log('❌ TRACK REFUSÉ : visitorId ou path manquant')

      return res.status(400).json({
        success: false,
        message: 'visitorId et path sont requis',
        debug: {
          visitorId,
          path,
        },
      })
    }

    const userId = req.user?.userId || null

    console.log('Création de la visite...', {
      visitorId,
      userId,
      path,
    })

    const visit = await VisitTracker.create({
      visitorId,
      userId,
      path,
      timestamp: new Date(),
    })

    console.log('✅ VISITE ENREGISTRÉE:', {
      id: visit._id,
      visitorId: visit.visitorId,
      userId: visit.userId,
      path: visit.path,
      timestamp: visit.timestamp,
    })

    return res.status(200).json({
      success: true,
      visit,
    })
  } catch (error) {
    console.error('❌ Erreur trackVisit:', error)

    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}
