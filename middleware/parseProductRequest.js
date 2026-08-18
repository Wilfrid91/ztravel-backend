// middleware/parseProductRequest.js (version avec calculs)
const toFloat = (v) => {
  if (v === undefined || v === null) return 0
  const parsed = parseFloat(v)
  return isNaN(parsed) ? 0 : parsed
}

export const parseProductRequest = (req, res, next) => {
  try {
    console.log('🔄 ParseProductRequest - Types reçus:')
    console.log('  products type:', typeof req.body.products)
    console.log('  shipping type:', typeof req.body.shipping)

    // Parser products si c'est une string
    if (req.body.products && typeof req.body.products === 'string') {
      req.body.products = JSON.parse(req.body.products)
      console.log(
        '✅ Products parsé (string → objet),',
        req.body.products.length,
        'produit(s)',
      )
    }

    // Parser shipping si c'est une string
    if (req.body.shipping && typeof req.body.shipping === 'string') {
      req.body.shipping = JSON.parse(req.body.shipping)
      console.log('✅ Shipping parsé (string → objet)')
    }

    // Parser avdData si c'est une string
    if (req.body.avdData && typeof req.body.avdData === 'string') {
      req.body.avdData = JSON.parse(req.body.avdData)
      console.log('✅ AVD Data parsé (string → objet)')
    }

    // S'assurer que products est un tableau
    if (!req.body.products || !Array.isArray(req.body.products)) {
      req.body.products = []
    }

    // S'assurer que shipping existe
    if (!req.body.shipping) {
      req.body.shipping = {}
    }

    // Initialiser otherCharges à 0
    if (req.body.shipping.otherCharges === undefined) {
      req.body.shipping.otherCharges = 0
    }

    // Initialiser oceanFreight et insurance à 0
    if (req.body.shipping.oceanFreight === undefined) {
      req.body.shipping.oceanFreight = 0
    }
    if (req.body.shipping.insurance === undefined) {
      req.body.shipping.insurance = 0
    }

    // Calculer les totaux
    const totalProducts = req.body.products.reduce((acc, product) => {
      const prixTotal =
        product.prixTotal || toFloat(product.prix) * toFloat(product.quantity)
      return acc + toFloat(prixTotal)
    }, 0)

    // Ajouter les totaux calculés au req.body
    req.body.totals = {
      totalProducts,
      freeOnBoardFromOriginatePort: totalProducts,
      oceanFreight: toFloat(req.body.shipping.oceanFreight),
      insurance: toFloat(req.body.shipping.insurance),
      otherCharges: toFloat(req.body.shipping.otherCharges),
      totalOperatingCost:
        totalProducts +
        toFloat(req.body.shipping.oceanFreight) +
        toFloat(req.body.shipping.insurance) +
        toFloat(req.body.shipping.otherCharges),
    }

    console.log('📊 Totaux calculés:', req.body.totals)

    // Pour backward compatibility, créer les champs plats à partir du premier produit
    if (req.body.products.length > 0) {
      const firstProduct = req.body.products[0]
      Object.keys(firstProduct).forEach((key) => {
        req.body[key] = firstProduct[key]
      })
      console.log('✅ Flat fields created from first product')
    }

    next()
  } catch (error) {
    console.error('❌ Erreur dans parseProductRequest:', error)
    return res.status(400).json({
      error: 'Invalid request data',
      details: error.message,
    })
  }
}
