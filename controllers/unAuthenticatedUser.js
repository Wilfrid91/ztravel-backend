import { StatusCodes } from 'http-status-codes'
import FreeSimulation from '../models/freeSimulation.js'
import { attachAnonymousCookie, signAnonymous } from '../utils/jwt.js'
import crypto from 'crypto'

/**
 * Ne doit JAMAIS créer de record consommable si l'IP en a déjà un
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
export const registerGuest = async (req, res, next) => {
  try {
    if (req.user) {
      // Un utilisateur connecté n'est pas un invité : rien à faire
      return res.status(StatusCodes.OK).json({ anonymous: false })
    }
    // Empreinte IP (anti-triche partielle)
    const ip = req.ip || req.socket.remoteAddress
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex')

    /**
    La présence du token ne prouve PAS que la simulation a été consommée ! Le token est posé dès l'arrivée sur la page, et l'utilisateur n'a peut-être jamais simulé. Avec cette règle, dès la deuxième visite de la page (token déjà en cookie), il reçoit « déjà utilisée » même sans avoir simulé. La bonne vérification est en base, sur le flag :
     */

    // Anti-triche : cette IP a-t-elle déjà consommé sa gratuite ?
    const consumed = await FreeSimulation.findOne({
      ipHash,
      freeSimulationUsed: true,
    })
    if (consumed) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error:
          'Votre simulation gratuite a déjà été utilisée. Créez un compte pour continuer.',
      })
    }

    // Réutiliser le record existant plutôt qu'en créer un par visite :
    let record = await FreeSimulation.findOne({
      ipHash,
      freeSimulationUsed: false,
    })
    console.log('RECORD=============', record)

    if (!record) {
      const anonymId = crypto.randomUUID()
      await FreeSimulation.create({ anonymId, ipHash })
      record = { anonymId }
    }

    const accessAnonymousToken = signAnonymous({
      guest: true,
      anonymId: record.anonymId,
    })
    attachAnonymousCookie({ res, token: accessAnonymousToken })

    return res.status(StatusCodes.OK).json({ anonymous: true })
  } catch (error) {
    console.log(error)
    next(error)
  }
}

/*export const simulate = async (req, res, next) => {
  // Dans le contrôleur de simulation, après le calcul :
  console.log(req)
  if (req.guestId) {
    await FreeSimulation.updateOne(
      { anonymId: req.guestId },
      { $set: { freeSimulationUsed: true } },
    )
  */
