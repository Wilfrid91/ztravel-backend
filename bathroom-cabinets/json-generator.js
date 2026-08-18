// scripts/generateFullCatalogWithEmpty.js
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

import { METADATA_TEMPLATES, DEFAULT_TEMPLATE } from './metadata.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Dossier racine des images
const ROOT = path.join(__dirname, '../public/images')

// Template de la liste de tous les produits
const PRODUCTS_LIST = path.join(__dirname, '../json_data/Catalog.json')

// Si vous exécutez le script depuis la racine du serveur (où se trouve package.json),
// Fichier contenant la liste des produits avec les liens
// <répertoire où tu exécutes le script>/json_data/catalog_generated.json
const OUTPUT_JSON = path.join(
  process.cwd(),
  'json_data',
  'catalog_generated.json',
)

// ========== FONCTIONS MÉTADONNÉES ==========
function getTemplate(productName) {
  return METADATA_TEMPLATES[productName] || DEFAULT_TEMPLATE
}

function getRandomMetadata(productName) {
  const template = getTemplate(productName)
  const idx = Math.floor(Math.random() * template.descriptions.length)
  return {
    description: template.descriptions[idx % template.descriptions.length],
    price: template.prices[idx % template.prices.length],
    reference: template.references[idx % template.references.length],
  }
}

// ========== NETTOYAGE ==========
function clean(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ========== RÉCUPÉRATION DES IMAGES AVEC MÉTADONNÉES ==========

async function getImagesForProduct(categorie, menu, name) {
  // Exemple avec { categorie: "Maison", menu: "Salle de bain", name: "WC & Lavabo", image: [] }
  const parts = [clean(categorie)] // parts = ['Maison']
  if (menu) parts.push(clean(menu)) // parts = ['Maison', 'Salle-de-bain']
  parts.push(clean(name), 'output-products') // parts = ['Maison', 'Salle-de-bain', 'WC-Lavabo', 'output-products']

  // ROOT est (par exemple) C:/.../server/public/images
  // productDir =>  C:/.../server/public/images/Maison/Salle-de-bain/WC--Lavabo/output-products
  const productDir = path.join(ROOT, ...parts)

  const publicPath = `/images/${parts.join('/')}` // // publicPath devient : /images/Maison/Salle-de-bain/WC-Lavabo/output-products

  if (!(await fs.pathExists(productDir))) return []

  const files = await fs.readdir(productDir)
  const imageFiles = files
    .filter((f) => /^page-\d+-product-\d+\.png$/.test(f))
    .sort((a, b) => {
      const [pa, ia] = a
        .match(/page-(\d+)-product-(\d+)/)
        .slice(1)
        .map(Number)
      const [pb, ib] = b
        .match(/page-(\d+)-product-(\d+)/)
        .slice(1)
        .map(Number)
      if (pa !== pb) return pa - pb
      return ia - ib
    })

  // 🔁 Construction des objets avec métadonnées
  return imageFiles.map((fileName) => {
    const meta = getRandomMetadata(name)
    return {
      url: `${publicPath}/${fileName}`,
      description: meta.description,
      price: meta.price,
      reference: meta.reference,
    }
  })
}

// ========== GÉNÉRATION DU CATALOGUE ==========
async function generateFullCatalog() {
  if (!(await fs.pathExists(PRODUCTS_LIST))) {
    console.error(`❌ Fichier introuvable : ${PRODUCTS_LIST}`)
    return
  }

  const products = await fs.readJson(PRODUCTS_LIST)
  const catalog = []

  for (const item of products) {
    const { categorie, menu, name } = item
    console.log(`🔍 ${categorie}${menu ? ` / ${menu}` : ''} / ${name}`)

    const images = await getImagesForProduct(categorie, menu, name)

    if (images.length === 0) {
      console.log(`   ⏭️ Ignoré (aucune image trouvée)`)
      continue
    }

    const parts = [clean(categorie)]
    if (menu) parts.push(clean(menu))
    parts.push(clean(name), 'output-products')
    const publicPath = `/images/${parts.join('/')}`

    catalog.push({
      categorie,
      menu: menu || null,
      name,
      type: 'catalog',
      catalogPath: publicPath,
      totalProducts: images.length,
      image: images, // ✅ Tableau d'objets { url, description, price, reference }
    })

    console.log(`   ✅ ${images.length} image(s) ajoutée(s)`)
  }

  await fs.ensureDir(path.dirname(OUTPUT_JSON))
  await fs.writeJson(OUTPUT_JSON, catalog, { spaces: 2 })

  console.log(`\n✅ Catalogue final généré : ${OUTPUT_JSON}`)
  console.log(
    `📊 ${catalog.length} produit(s) avec images (sur ${products.length} au total)`,
  )
}

generateFullCatalog().catch(console.error)
