import catalogController from '../controllers/catalog.controller.js'

export default function catalogRoutes(app) {
  app.use(function (req, res, next) {
    res.header(
      'Access-Control-Allow-Headers',
      'x-access-token, Origin, Content-Type, Accept',
    )
    next()
  })

  app.get(
    '/api/auth/cards/catalog',
    controller.requireAuth,
    cache,
    catalogController.getAllCatalog,
  )
}
