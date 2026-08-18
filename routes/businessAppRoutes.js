import { Router } from 'express'
import { authenticateUser } from '../middleware/authentication.js'
import multer from 'multer' // Express ne sait pas lire le FormData tout seul => utilise multer

// Multer en mémoire (pas d’écriture disque avant validation)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 Mo max
})
export const uploadSecure = upload.single('productPhoto')

// Pour le pdf à changer après
const uploadProductPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 Mo max
})
export const uploadPdfFiles = uploadProductPhoto.any()

import {
  getBeforeLeaving,
  getTab2Data,
  GetCustomerCatalog,
  getSimulatorTab2,
  getSimulatorTab3,
  submitCustomerForm,
  createProductListAndAVD,
  getCustomsData,
  generateCGU,
  submitJacceptCheckedStatus,
  isCustomerConsent,
  simulatorPage,
  getUserGuide,
  validateUploadedPhoto,
  validateUploadedProductPhoto,
  createVehicleListAndAVD,
} from '../controllers/businessAppController.js'

import { vehicleValidator } from '../validators/vehicleValidator.js'

import { validate } from '../middleware/validate.js'

import { parseVehicleRequest } from '../middleware/parseVehicleRequest.js'

import { productValidator } from '../validators/productValidator.js'

import { shippingValidator } from '../validators/shippingValidator.js'

import { parseProductRequest } from '../middleware/parseProductRequest.js'

import { contactValidator } from '../validators/contactValidator.js'

const router = Router()

//  BUSINESS APP LOGIC
router.get('/tab1-data', authenticateUser, getBeforeLeaving) // getInfoAvantDePartir,
router.get('/tab2-data', authenticateUser, getTab2Data) //  getAllCardsTab2,
router.get('/business-app-data', authenticateUser, GetCustomerCatalog) //    createCards,
router.get('/simulator-tab2', authenticateUser, getSimulatorTab2) //RecupererFormulaire,
router.get('/simulator-tab3', authenticateUser, getSimulatorTab3) //Recuperer user guide vehicule,
router.get('/customs-data', authenticateUser, getCustomsData) //RecupererFormulaire,
router.get('/get-cgu', authenticateUser, generateCGU) //  condition générale de vente,
router.post(
  '/post-form',
  uploadSecure,
  validateUploadedPhoto,
  contactValidator,
  validate,
  authenticateUser,
  submitCustomerForm,
) //  SoumissionFormulaire,
router.post(
  '/product/generatepdf',
  uploadPdfFiles,
  parseProductRequest,
  /*(req, res, next) => {
    console.log('=== DEBUG REQUEST ===')
    console.log('Body:', req.body)
    console.log('Files:', req.files?.length)
    console.log('Body keys:', Object.keys(req.body))

    // Afficher les champs vehicles s'ils existent
    if (req.body.vehicles) {
      console.log('Vehicles type:', typeof req.body.vehicles)
      console.log('Vehicles:', req.body.vehicles)
    }

    next()
  },
  (req, res, next) => {
    console.log('🔍 Description brute:', req.body.products?.[0]?.description)
    next()
  },*/
  validateUploadedProductPhoto,
  ...productValidator, // Décompose le tableau en fonctions individuelles =>  TABLEAU de fonctions middleware
  ...shippingValidator, // Décompose le tableau en fonctions individuelles =>  TABLEAU de fonctions middleware
  validate,
  authenticateUser,
  createProductListAndAVD,
) //  generatePdf,

/**
 * Vehicles type: string
 * * => Vehicles: [{"type":"Neuf", ...}], Mais express-validator cherche :
 * req.body.type
 * req.body.marque
 * req.body.kilometrage
 * => Qui n'existe pas
 */
router.post(
  '/vehicle/generatepdf',
  uploadPdfFiles, // Multer parse FormData
  parseVehicleRequest,
  (req, res, next) => {
    console.log('=== DEBUG REQUEST ===')
    console.log('Body:', req.body)
    console.log('Files:', req.files?.length)
    console.log('Body keys:', Object.keys(req.body))

    // Afficher les champs vehicles s'ils existent
    if (req.body.vehicles) {
      console.log('Vehicles type:', typeof req.body.vehicles)
      console.log('Vehicles:', req.body.vehicles)
    }

    next()
  },
  validateUploadedProductPhoto,
  ...vehicleValidator,
  validate,
  authenticateUser,
  createVehicleListAndAVD,
)

router.post('/submit-cgu', authenticateUser, submitJacceptCheckedStatus) //  L'utilisateur a cliqué sur J'accepte
router.get('/check-cgu', authenticateUser, isCustomerConsent) //  Si l'utilisateur a déja consenti
router.get('/simulator-page', authenticateUser, simulatorPage) //  La page de simulation
/* Récupère le user guide*/
router.get('/user-guide', authenticateUser, getUserGuide)

export default router
