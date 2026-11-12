import FreeSimulation from '../models/freeSimulation.js'
import { StatusCodes } from 'http-status-codes'

export const consumeGuestSimulation = async (req, res, next) => {
  // Si pas guest
  if (!req.isGuest) return next()

  const simulation = await FreeSimulation.findOne({
    anonymId: req.guest.anonymId,
  })
  // simulation = {
  //        anonymId: '123',
  //        freeSimulationUsed: false
  //      }
  // !simulation || simulation.freeSimulationUsed => true || false => true
  if (!simulation || simulation.freeSimulationUsed) {
    return res.status(StatusCodes.FORBIDDEN).json({
      error:
        'Simulation gratuite déjà utilisée. Créez un compte pour continuer.',
    })
  }
  // continue vers la simulation
  req.guestSimulation = simulation // on ne consomme PAS ici
  next()
}
