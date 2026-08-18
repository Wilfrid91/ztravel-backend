import Catalog from '../models/Catalog.js'
import { StatusCodes } from 'http-status-codes'
// exports is not defined in ES module scope
// Before: exports.getAllCatalog = async (req, res) => {
export const getAllCatalog = async (req, res) => {
  try {
    const catalog = await Catalog.find()
    res.json(catalog)
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message })
  }
}
export default { getAllCatalog }
