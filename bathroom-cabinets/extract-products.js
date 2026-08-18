import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import pdfPoppler from 'pdf-poppler'
import sharp from 'sharp'

// Pour les chemins avec ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Chemins absolus
const INPUT_PDF = path.join(
  __dirname,
  '../../products/Meuble-de-douche/Meuble-de-douche.pdf',
)

const OUTPUT_DIR = path.join(
  __dirname,
  '../public/images/Maison/Salle-de-bain/Meubles-de-douches/output-products',
)

// Chemins absolus
const INPUT_PDF1 = path.join(
  __dirname,
  '../../products/Living-room/Salons-meubles.pdf',
)

const OUTPUT_DIR1 = path.join(
  __dirname,
  '../public//images/Maison/Salon--salles-a-manger/Tablettes/output-products',
)

const FIXED_WIDTH = 600
const FIXED_HEIGHT = 600

async function extractImages() {
  try {
    // Vérifier si le PDF existe
    if (!(await fs.pathExists(INPUT_PDF))) {
      console.error(`❌ PDF non trouvé: ${INPUT_PDF}`)
      return
    }

    // Créer le dossier de sortie
    await fs.ensureDir(OUTPUT_DIR)
    console.log(`📁 Dossier de sortie: ${OUTPUT_DIR}`)

    // Nettoyer les anciennes images (optionnel)
    const existingFiles = await fs.readdir(OUTPUT_DIR)
    for (const file of existingFiles) {
      if (file.endsWith('.png')) {
        await fs.remove(path.join(OUTPUT_DIR, file))
      }
    }
    console.log('🧹 Anciennes images supprimées')

    console.log('🔄 Conversion PDF → PNG...')

    // Options de conversion
    const options = {
      format: 'png',
      out_dir: OUTPUT_DIR,
      out_prefix: 'page',
      page: null, // Toutes les pages
      resolution: 300, // Augmente la résolution pour meilleure qualité
    }

    await pdfPoppler.convert(INPUT_PDF, options)
    console.log('✅ Conversion PDF terminée')

    // Attendre un peu que les fichiers soient écrits
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Récupérer toutes les pages converties
    const files = await fs.readdir(OUTPUT_DIR)
    const pageFiles = files.filter((f) => /^page-\d+\.png$/.test(f))

    console.log(`📄 ${pageFiles.length} page(s) trouvée(s)`)

    for (const file of pageFiles) {
      console.log(`\n🖼️  Traitement de: ${file}`)
      const pagePath = path.join(OUTPUT_DIR, file)

      // Vérifier que le fichier existe et n'est pas vide
      const stats = await fs.stat(pagePath)
      if (stats.size === 0) {
        console.log(`⚠️  Fichier vide: ${file}, ignoré`)
        continue
      }

      const image = sharp(pagePath)
      const metadata = await image.metadata()

      console.log(
        `   Dimensions originales: ${metadata.width}x${metadata.height}`,
      )

      const W = metadata.width
      const H = metadata.height

      // Calculer les dimensions des cellules
      const cols = 4
      const rows = 2

      const colWidth = Math.floor(W / cols)
      const rowHeight = Math.floor(H / rows)

      // Ajuster la dernière colonne/ligne
      const lastColWidth = W - colWidth * (cols - 1)
      const lastRowHeight = H - rowHeight * (rows - 1)

      console.log(
        `   Grille: ${cols}x${rows}, cellules: ${colWidth}x${rowHeight}`,
      )

      // Générer les 8 images
      const crops = []
      let productIndex = 1

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const isLastCol = col === cols - 1
          const isLastRow = row === rows - 1

          crops.push({
            name: `product-${productIndex++}`,
            left: col * colWidth,
            top: row * rowHeight,
            width: isLastCol ? lastColWidth : colWidth,
            height: isLastRow ? lastRowHeight : rowHeight,
          })
        }
      }

      // Extraire chaque produit
      for (const crop of crops) {
        // Extraire le numéro de page (ex: page-1.png → 1)
        const pageNum = file.match(/page-(\d+)\.png/)[1]
        const outputPath = path.join(
          OUTPUT_DIR,
          `page-${pageNum}-${crop.name}.png`,
        )

        try {
          await sharp(pagePath)
            .extract({
              left: Math.round(crop.left),
              top: Math.round(crop.top),
              width: Math.round(crop.width),
              height: Math.round(crop.height),
            })
            .resize(FIXED_WIDTH, FIXED_HEIGHT, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .png({ quality: 90 })
            .toFile(outputPath)

          console.log(`   ✅ ${crop.name} → ${path.basename(outputPath)}`)
        } catch (err) {
          console.error(`   ❌ Erreur extraction ${crop.name}:`, err.message)
        }
      }
    }

    console.log('\n✅ Découpage terminé avec succès !')

    // Afficher le résumé
    const finalFiles = await fs.readdir(OUTPUT_DIR)
    const productImages = finalFiles.filter((f) => f.includes('product-'))
    console.log(`📊 Total images générées: ${productImages.length}`)
  } catch (error) {
    console.error('❌ Erreur:', error)
  }
}

// Exécuter le script
extractImages()
