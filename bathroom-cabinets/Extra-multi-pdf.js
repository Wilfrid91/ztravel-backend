import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import pdfPoppler from 'pdf-poppler'
import sharp from 'sharp'
import grids from './json-products.json' assert { type: 'json' }

// ES modules paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// MEUBLES DE DOUCHES
const INPUT_PDF = path.join(
  __dirname,
  '../../products/Meuble-de-douche/Meuble-de-douche.pdf',
)
const OUTPUT_DIR = path.join(
  __dirname,
  '../public/images/Maison/Salle-de-bain/Meubles-de-douches/output-products',
)

// MEUBLES DE SALON
const INPUT_PDF1 = path.join(
  __dirname,
  '../../products/Living-room/Salons-meubles.pdf',
)
const OUTPUT_DIR1 = path.join(
  __dirname,
  '../public/images/Maison/Salon-salles-a-manger/Tablettes/output-products',
)

// TAPIS
const INPUT_PDF2 = path.join(__dirname, '../../products/Carpet/tapis.pdf')
const OUTPUT_DIR2 = path.join(
  __dirname,
  '../public/images/Maison/Salon-salles-a-manger/Tapis/output-products',
)
// CANAPES
const INPUT_PDF3 = path.join(__dirname, '../../products/Canapes/canapes.pdf')
const OUTPUT_DIR3 = path.join(
  __dirname,
  '../public/images/Maison/Salon-salles-a-manger/Canapes/output-products',
)

// SERRURE
const INPUT_PDF4 = path.join(
  __dirname,
  '../../products/Serrure/Lock-body-atlas2026-02.pdf',
)
const OUTPUT_DIR4 = path.join(
  __dirname,
  '../public/images/Maison/Menuiserie/Serrure-de-portes/output-products',
)

// EVIERS
const INPUT_PDF5 = path.join(__dirname, '../../products/Evier/Eviers.pdf')
const OUTPUT_DIR5 = path.join(
  __dirname,
  '../public/images/Maison/Cuisine/Evier-robinets/output-products',
)

// Liste des PDF à traiter
const PDF_TASKS = [
  { input: INPUT_PDF, output: OUTPUT_DIR },
  { input: INPUT_PDF1, output: OUTPUT_DIR1 },
  { input: INPUT_PDF2, output: OUTPUT_DIR2 },
  { input: INPUT_PDF3, output: OUTPUT_DIR3 },
  { input: INPUT_PDF4, output: OUTPUT_DIR4 },
  { input: INPUT_PDF5, output: OUTPUT_DIR5 },
]

// Récupère la grille définie dans grids.json
function getGrid(pdfName, pageNum) {
  const pdf = grids[pdfName]
  if (!pdf) return null
  return pdf[pageNum] || null
}

// Découpe une page selon la grille
async function extractProductsFromPage(pagePath, outputDir, pageNum, pdfName) {
  const image = sharp(pagePath)
  const metadata = await image.metadata()
  const W = metadata.width
  const H = metadata.height

  // Grille définie dans grids.json
  const manualGrid = getGrid(pdfName, pageNum)

  if (!manualGrid) {
    console.log(
      `⚠️  Aucune grille définie pour ${pdfName} page ${pageNum} → ignorée`,
    )
    return
  }

  let { cols, rows } = manualGrid

  // Pages à ignorer
  if (cols === 0 || rows === 0) {
    console.log(`⏭️  Page ${pageNum} ignorée (cols=0, rows=0)`)
    return
  }

  console.log(`📐 Page ${pageNum} → grille ${cols}×${rows}`)

  const colWidth = Math.floor(W / cols)
  const rowHeight = Math.floor(H / rows)

  let index = 1

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = c * colWidth
      const top = r * rowHeight
      const width = c === cols - 1 ? W - left : colWidth
      const height = r === rows - 1 ? H - top : rowHeight

      const outputPath = path.join(
        outputDir,
        `page-${pageNum}-product-${index}.png`,
      )

      await sharp(pagePath)
        .extract({ left, top, width, height })
        .resize(450, 450, { fit: 'contain', background: 'white' })
        .toFile(outputPath)

      console.log(`   → Produit ${index} généré`)
      index++
    }
  }
}

// Traite tous les PDF
async function processAllPDFs() {
  for (const task of PDF_TASKS) {
    const { input, output } = task
    const pdfName = path.basename(input)

    console.log(`\n📘 Traitement PDF : ${pdfName}`)
    await fs.ensureDir(output)

    // 🔥 Nettoyer le dossier avant de générer les nouvelles images
    console.log(`🧹 Nettoyage du dossier : ${output}`)
    await fs.emptyDir(output)

    // Convertir PDF → PNG
    await pdfPoppler.convert(input, {
      format: 'png',
      out_dir: output,
      out_prefix: 'page',
      resolution: 300,
    })

    const files = (await fs.readdir(output)).filter((f) =>
      /^page-\d+\.png$/.test(f),
    )

    for (const file of files) {
      const pageNum = parseInt(file.match(/page-(\d+)/)[1])
      const pagePath = path.join(output, file)

      await extractProductsFromPage(pagePath, output, pageNum, pdfName)
    }

    console.log(`\n✅ PDF terminé : ${pdfName}`)
  }

  console.log('\n🎉 Tous les PDF ont été traités !')
}

processAllPDFs()
