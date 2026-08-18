import 'dotenv/config'
import path from 'path'
import express from 'express'
import cors from 'cors'
import https from 'https'
import fs from 'fs'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import helmet from 'helmet' // pour sécuriser les headers
import DOMPurify from 'isomorphic-dompurify'
import hpp from 'hpp'

const sanitizeNoSQL = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return

    for (const key in obj) {
      if (key.startsWith('$')) {
        delete obj[key]
        continue
      }
      if (typeof obj[key] === 'object') {
        sanitize(obj[key])
      }
    }
  }

  sanitize(req.body)
  sanitize(req.query)
  sanitize(req.params)

  next()
}

const sanitizeXSS = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = DOMPurify.sanitize(obj[key])
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key])
      }
    }
  }

  sanitize(req.body)
  sanitize(req.query)
  sanitize(req.params)

  next()
}

import productsRouter from './routes/productsRoutes.js'
import authenticationRouter from './routes/authenticationRoutes.js'
import authorizationRouter from './routes/authorizationRoutes.js'
import businessAppRouter from './routes/businessAppRoutes.js'
import mtnCallbackRouter from './routes/mtnAppRoutes.js'
import fedaPayCallbackRouter from './routes/FedaPayCallbackRoutes.js'

// DB
import connectDB from './db/connect.js'
const app = express()
const isProd = process.env.NODE_ENV === 'production'

// 1) RAW body UNIQUEMENT pour FedaPay
app.use('/api/fedapay', express.raw({ type: '*/*' }))

// 2) Router FedaPay (AVANT TOUT)
app.use('/api/fedapay', fedaPayCallbackRouter)
// Middlewares
app.use(express.json())

// 3) Middlewares de sécurité (APRÈS FedaPay)
// typeof obj === 'object' → ils modifient le body * Ils transforment le Buffer en Object
app.use(sanitizeNoSQL) // Contre les injections NoSQL - Empêche $gt, $ne, $or, $regex, etc.

//app.use(helmet()) // Empêche clickjacking, sniffing, etc.

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: isProd ? 'same-origin' : 'cross-origin',
    },
  }),
)

app.use(sanitizeXSS) // Contre le XSS dans les champs utilisateur.
// HTTP Parameter Pollution - Attaquant evoie: email=admin@example.com&email=hacker@evil.com
// req.body.email = ['admin@example.com', 'hacker@evil.com'] => Compare un string = un tablea= => faux
app.use(hpp())
// express‑rate‑limit → “X‑Forwarded‑For header… trust proxy = false”
// Obligatoire pour rate-limit
// Obligatoire pour cookies secure
// Obligatoire pour IP réelle
app.set('trust proxy', 1)

const port = process.env.PORT || 5000

app.use(
  cors({
    origin: [
      'https://simudouane.com',
      'https://www.simudouane.com',
      process.env.BASE_URL_FRONT,
    ],
    credentials: true,
  }),
)
// Le navigateur envoie une requête OPTIONS (preflight) avant les requêtes CORS avec cookies.
// Cette route répond à TOUTES les requêtes OPTIONS et renvoie les bons headers CORS.
// Sans cette ligne, Chrome bloque les requêtes POST/PUT/DELETE cross-domain.
app.options(/.*/, cors())

app.use(cookieParser(process.env.JWT_SECRET)) // Active la lecture des cookies & la vérification cryptographique des cookies signés (signed: true)
app.use(morgan('tiny')) //Morgan permet de définir un format personnalisé avec morgan.format().

if (!isProd) {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    next()
  })
}

// Static files
app.use(
  '/img',
  express.static('public/img', { immutable: true, maxAge: '30d' }),
)
app.use(
  '/images',
  express.static('public/images', {
    immutable: true,
    maxAge: '30d',
  }),
)
// <ton projet>/public/images/
//app.use('/pdf', express.static(path.join(process.cwd(), 'public/pdf')))

// Middleware global pour logger toutes les requêtes
app.use((req, res, next) => {
  console.log('Requête reçue :', req.method, req.url)
  next()
})

// Routes
app.use('/api/v1/auth', authenticationRouter)
app.use('/api/v1/business', businessAppRouter)
//app.use('/api/v1/users', userRouter)
app.use('/api/v1/payment', authorizationRouter)
//app.use('/mtn', mtnCallbackRouter)

const startDbAndServer = async () => {
  try {
    await connectDB(process.env.MONGO_URL)

    app.listen(port, () =>
      console.log(`Server is listening on port ${port}...`),
    )
  } catch (error) {
    console.log(error)
  }
}
// Start nodejs server
startDbAndServer()
