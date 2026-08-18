import controller from '../controllers/auth.controller.js'
import multer from 'multer'

const upload = multer({ dest: 'uploads/' })

export default function pdfRoutes(app) {
  app.use(function (req, res, next) {
    res.header(
      'Access-Control-Allow-Headers',
      'x-access-token, Origin, Content-Type, Accept',
    )
    next()
  })

  app.post(
    '/api/auth/generatePdf',
    upload.any(),
    controller.requireAuth,
    cache,
    controller.generatePdf,
  )
}
