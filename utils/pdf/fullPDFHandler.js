import { PassThrough } from 'stream'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PDFDocumentWithTables } = require('pdfkit-table') // Classe étendue de pdfkit
import { Writable } from 'stream'

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Permet d'utiliser __dirname en ES6
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const refPath = path.join(__dirname, 'ref.json')

// ---------------------------------------------------------------------
// CONFIG VISUELLE POUR
// ---------------------------------------------------------------------

const COLORS = {
  primary: '#1A3C8E',
  headerText: '#FFFFFF',
  rowText: '#000000',
  line: '#CCCCCC',
  muted: '#666666',
  // Une couleur par colonne pour les en-têtes de tableaux
  columnPalette: [
    '#1A3C8E',
    '#2454B3',
    '#2E63C4',
    '#3872D5',
    '#1A3C8E',
    '#2454B3',
  ],
  // Fond très léger par colonne (alternance) pour les lignes de données
  columnTint: [
    '#FFFFFF',
    '#F4F7FC',
    '#EAF0F9',
    '#F4F7FC',
    '#FFFFFF',
    '#EAF0F9',
  ],
}

const MARGIN = 40
const FOOTER_ZONE = 80 // hauteur réservée en bas de page pour le footer

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------
const safe = (value) => (typeof value === 'number' ? formatXOF(value) : 'N/A')

/**
 * Draw manually the table with color
 * @param {*} doc
 * @param {*} startX
 * @param {*} startY
 * @param {*} rows
 * @param {*} columnWidths
 * @param {*} rowHeight
 *  @param {*} options
 * @returns
 */

/**
 * --- Nettoyeur ultra strict ---
 * @param {*} value
 * @returns
 */

const cleanNumber = (value) => {
  if (value === null || value === undefined) return 0

  return (
    Number(
      String(value)
        // supprime F, CFA, FCFA, F/CFA, F /CFA, etc.
        .replace(/f|cfa|fcfa|\/|f\/cfa|f \/cfa/gi, '')
        // supprime tout sauf chiffres, virgule, point
        .replace(/[^\d.,-]/g, '')
        // supprime espaces fines, insécables, invisibles
        .replace(/[\u202F\u00A0\u2009\u2007\u200B-\u200D]/g, '')
        // remplace virgule par point
        .replace(',', '.'),
    ) || 0
  )
}

/**
 *  --- FORMATTEUR XOF (ISO 4217) ---
 * @param {*} value
 * @returns
 */

const formatXOF = (value) => {
  const num = cleanNumber(value)

  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(num)
      .replace(/\u202F/g, ' ')
      .replace(/\u00A0/g, ' ') + ' XOF'
  )
}

function fmt3(value) {
  if (value == null || value === '') return 'N/A'

  const num = Number(value)
  if (isNaN(num)) return String(value)

  return num
    .toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    })
    .replace(/\u202F/g, ' ') // espace fine → espace normal
    .replace(/\u00A0/g, ' ') // espace insécable → espace normal
}

function pdfSafeText(value) {
  return (
    String(value ?? '')
      .normalize('NFC')
      // Remplacer les espaces Unicode par des espaces ordinaires
      .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
  )
}

function formatPdfAmount(value) {
  // fmt3 est ta fonction de formatage existante
  return pdfSafeText(fmt3(value))
}

/**
 * Génération du PDF AVD — version avec tableaux lisibles et mise en page A4.
 *
 * Dépendances attendues dans le module appelant :
 *   - PDFDocumentWithTables (classe compatible PDFKit)
 *   - PassThrough (node:stream)
 *   - sharp
 *   - generateReference()
 *
 * Cette version ne dépend plus du helper externe drawTable().
 */
export const generateProductFullPDF = async (
  products = [],
  photos = [],
  shipping = {},
  avdData = {},
) => {
  const articles = Array.isArray(avdData?.articles) ? avdData.articles : []
  const productList = Array.isArray(products) ? products : []
  const photoList = Array.isArray(photos) ? photos : []

  return new Promise(async (resolve, reject) => {
    try {
      // A4 portrait, marges uniformes de 40 points.
      const PAGE_MARGIN = 40
      const FOOTER_RESERVE = 105
      const CONTENT_BOTTOM = () => doc.page.height - FOOTER_RESERVE
      const doc = new PDFDocumentWithTables({ size: 'A4', margin: PAGE_MARGIN })
      const stream = new PassThrough()
      const chunks = []

      let currentPage = 1
      let lastHeaderPage = 0
      // Une seule référence pour l'ensemble du document (et toutes ses pages).
      const documentReference = generateReference()
      const generatedAt = new Date().toLocaleString('fr-FR')

      const pageWidth = () => doc.page.width
      const contentWidth = () => pageWidth() - PAGE_MARGIN * 2
      const contentX = PAGE_MARGIN

      doc.pipe(stream)
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
      doc.on?.('error', reject)

      const toText = (value, fallback = '—') => {
        if (value === null || value === undefined || value === '')
          return fallback
        return String(value)
      }

      function formatAmount(value) {
        const number =
          typeof value === 'number'
            ? value
            : Number(
                String(value ?? '')
                  .replace(/\s/g, '')
                  .replace(',', '.'),
              )

        if (!Number.isFinite(number)) {
          return '—'
        }

        return new Intl.NumberFormat('fr-FR', {
          useGrouping: true,
          maximumFractionDigits: 2,
        })
          .format(number)
          .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
      }

      function drawHeader() {
        if (currentPage === lastHeaderPage) return
        lastHeaderPage = currentPage

        // Logo de l'entreprise. Le chemin reste relatif au répertoire de lancement.
        doc.image('assets/logo.png', PAGE_MARGIN, 20, { width: 70 })

        doc
          .fillColor('#1A3C8E')
          .font('Helvetica-Bold')
          .fontSize(15)
          .text('Ztravel Consulting', 130, 27, {
            width: Math.max(200, pageWidth() - 170),
            lineBreak: false,
          })

        doc
          .fillColor('#222222')
          .font('Helvetica')
          .fontSize(11)
          .text('Analyse des valeurs en douane (AVD)', 130, 47, {
            width: Math.max(200, pageWidth() - 170),
            lineBreak: false,
          })

        doc
          .fillColor('#666666')
          .font('Helvetica')
          .fontSize(9)
          .text(`Document généré le : ${generatedAt}`, 130, 64, {
            width: Math.max(200, pageWidth() - 170),
            lineBreak: false,
          })

        doc
          .moveTo(PAGE_MARGIN, 84)
          .lineTo(pageWidth() - PAGE_MARGIN, 84)
          .strokeColor('#D5DAE4')
          .lineWidth(0.8)
          .stroke()

        doc.y = 98
      }

      function drawFooter() {
        const pageHeight = doc.page.height

        doc.save()
        doc
          .moveTo(PAGE_MARGIN, pageHeight - 75)
          .lineTo(pageWidth() - PAGE_MARGIN, pageHeight - 75)
          .strokeColor('#D5DAE4')
          .lineWidth(0.8)
          .stroke()

        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#555555')
          .text(
            `Référence : ${documentReference}`,
            PAGE_MARGIN,
            pageHeight - 57,
            {
              width: 220,
              lineBreak: false,
            },
          )

        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#555555')
          .text(`Page ${currentPage}`, 0, pageHeight - 57, {
            width: pageWidth(),
            align: 'center',
            lineBreak: false,
          })
        doc.restore()
      }

      function newPage() {
        drawFooter()
        doc.addPage({ size: 'A4', margin: PAGE_MARGIN })
        currentPage += 1
        lastHeaderPage = 0
        drawHeader()
        doc.y = 98
      }

      function getUsableHeight() {
        return CONTENT_BOTTOM() - doc.y
      }

      function ensureSpace(requiredHeight) {
        if (getUsableHeight() < requiredHeight) newPage()
      }

      function measureText(text, font, fontSize, width) {
        doc.font(font).fontSize(fontSize)
        return doc.heightOfString(toText(text, ''), {
          width: Math.max(20, width),
          lineGap: 0,
        })
      }

      function drawSectionTitle(
        title,
        { color = '#1A3C8E', size = 12, space = 42, gap = 10 } = {},
      ) {
        ensureSpace(space)
        doc.font('Helvetica-Bold').fontSize(size).fillColor(color)
        const textHeight = doc.heightOfString(title, {
          width: contentWidth(),
          lineGap: 1,
        })
        doc.text(title, contentX, doc.y, {
          width: contentWidth(),
          lineGap: 1,
        })
        doc.y += Math.max(textHeight, size + 3) + gap
      }

      /**
       * Dessine un tableau avec hauteur de ligne calculée, marges internes,
       * retour à la ligne maîtrisé et répétition de l'en-tête après un saut de page.
       * rows = [ligne d'en-tête, ligne de données, ...]
       */
      function drawStyledTable(rows, columnWidths, options = {}) {
        if (!Array.isArray(rows) || rows.length === 0) return doc.y

        const config = {
          headerBackground: '#1A3C8E',
          headerTextColor: '#FFFFFF',
          bodyTextColor: '#202938',
          alternateRowColor: '#F3F6FB',
          rowBackground: '#FFFFFF',
          borderColor: '#D5DCE8',
          headerFontSize: 9,
          bodyFontSize: 9.5,
          headerPadding: 7,
          bodyPadding: 7,
          minHeaderHeight: 30,
          minRowHeight: 27,
          gapAfter: 10,
          repeatHeader: true,
          headerAlignments: [],
          columnAlignments: [],
          boldRowIndexes: [],
          ...options,
        }

        const widths = columnWidths.map((width) => Number(width))
        if (widths.length !== rows[0].length) {
          throw new Error(
            `Le tableau comporte ${rows[0].length} colonnes mais ${widths.length} largeurs ont été fournies.`,
          )
        }

        const normalizeRow = (row) =>
          widths.map((_, index) => toText(row?.[index], '—'))

        const rowHeight = (row, rowIndex) => {
          const isHeader = rowIndex === 0
          const isBold = isHeader || config.boldRowIndexes.includes(rowIndex)
          const font = isBold ? 'Helvetica-Bold' : 'Helvetica'
          const fontSize = isHeader
            ? config.headerFontSize
            : config.bodyFontSize
          const padding = isHeader ? config.headerPadding : config.bodyPadding
          let measuredHeight = 0

          normalizeRow(row).forEach((cell, colIndex) => {
            measuredHeight = Math.max(
              measuredHeight,
              measureText(cell, font, fontSize, widths[colIndex] - padding * 2),
            )
          })

          return Math.max(
            isHeader ? config.minHeaderHeight : config.minRowHeight,
            measuredHeight + padding * 2,
          )
        }

        const paintRow = (row, rowIndex, y, height) => {
          const isHeader = rowIndex === 0
          const isBold = isHeader || config.boldRowIndexes.includes(rowIndex)
          const font = isBold ? 'Helvetica-Bold' : 'Helvetica'
          const fontSize = isHeader
            ? config.headerFontSize
            : config.bodyFontSize
          const padding = isHeader ? config.headerPadding : config.bodyPadding
          const rowFill = isHeader
            ? config.headerBackground
            : rowIndex % 2 === 0
              ? config.alternateRowColor
              : config.rowBackground

          let x = contentX
          const cells = normalizeRow(row)

          cells.forEach((cell, colIndex) => {
            const width = widths[colIndex]

            doc.save()
            doc
              .fillColor(rowFill)
              .strokeColor(config.borderColor)
              .lineWidth(0.5)
              .rect(x, y, width, height)
              .fillAndStroke(rowFill, config.borderColor)

            doc
              .font(font)
              .fontSize(fontSize)
              .fillColor(
                isHeader ? config.headerTextColor : config.bodyTextColor,
              )
              .text(cell, x + padding, y + padding, {
                width: Math.max(20, width - padding * 2),
                height: Math.max(10, height - padding * 2),
                align: isHeader
                  ? config.headerAlignments[colIndex] || 'left'
                  : config.columnAlignments[colIndex] || 'left',
                valign: 'center',
                lineGap: 0,
              })
            doc.restore()
            x += width
          })
        }

        let y = doc.y
        let rowIndex = 0

        while (rowIndex < rows.length) {
          let height = rowHeight(rows[rowIndex], rowIndex)

          if (y + height > CONTENT_BOTTOM()) {
            newPage()
            y = doc.y

            // Répéter la ligne d'en-tête si une suite du tableau passe à la page suivante.
            if (rowIndex > 0 && config.repeatHeader && rows.length > 1) {
              const headerHeight = rowHeight(rows[0], 0)
              paintRow(rows[0], 0, y, headerHeight)
              y += headerHeight
            }

            height = rowHeight(rows[rowIndex], rowIndex)
          }

          paintRow(rows[rowIndex], rowIndex, y, height)
          y += height
          rowIndex += 1
        }

        doc.y = y + config.gapAfter
        return doc.y
      }

      // -----------------------------------------------------
      // Première page : en-tête et liste des produits
      // -----------------------------------------------------
      drawHeader()
      drawSectionTitle('Liste de produits', { space: 48, gap: 12 })

      if (productList.length === 0) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(10)
          .fillColor('#666666')
          .text('Aucun produit renseigné.', contentX + 8, doc.y, {
            width: contentWidth() - 16,
          })
        doc.y += 28
      }

      for (let index = 0; index < productList.length; index += 1) {
        const product = productList[index] || {}
        const heading = `Produit ${index + 1} : ${toText(product.nom, 'Sans nom')}`
        const description = toText(product.description, 'Non renseignée')
        const imageFile = photoList.find(
          (file) => file.fieldname === `photo_${index}`,
        )

        let imageBuffer = null
        let imageError = false
        if (imageFile?.buffer) {
          try {
            imageBuffer = await sharp(imageFile.buffer)
              .rotate()
              .png()
              .toBuffer()
          } catch (error) {
            imageError = true
            console.warn(
              `Photo du produit ${index + 1} illisible :`,
              error.message,
            )
          }
        }

        const cardX = contentX
        const cardWidth = contentWidth()
        const padding = 12
        const leftX = cardX + padding
        const leftWidth = imageBuffer
          ? cardWidth - 210
          : cardWidth - padding * 2
        const titleHeight = measureText(
          heading,
          'Helvetica-Bold',
          13,
          cardWidth - padding * 2,
        )
        const descriptionLabelHeight = measureText(
          'Description',
          'Helvetica-Bold',
          9.5,
          leftWidth,
        )
        const descriptionHeight = measureText(
          description,
          'Helvetica',
          9.5,
          leftWidth,
        )
        /*const detailRows = [
          `Dimensions : ${toText(product.longueurCm)} × ${toText(product.largeurCm)} cm`,
          `Poids : ${toText(product.poidsKg)} kg`,
          `Quantité : ${toText(product.quantity)}`,
          `Cartons : ${toText(product.numberOfBox)}`,
          `Prix unitaire : ${formatAmount(product.prix)} ${toText(product.devise, '')}`.trim(),
          `Prix total : ${formatAmount(product.prixTotal)} ${toText(product.devise, '')}`.trim(),
        ]*/

        const detailRows = [
          `Dimensions : ${pdfSafeText(toText(product.longueurCm))} × ${pdfSafeText(toText(product.largeurCm))} cm`,
          `Poids : ${pdfSafeText(toText(product.poidsKg))} kg`,
          `Quantité : ${pdfSafeText(toText(product.quantity))}`,
          `Cartons : ${pdfSafeText(toText(product.numberOfBox))}`,
          `Prix unitaire : ${formatPdfAmount(product.prix)} ${pdfSafeText(toText(product.devise, ''))}`.trim(),
          `Prix total : ${formatPdfAmount(product.prixTotal)} ${pdfSafeText(toText(product.devise, ''))}`.trim(),
        ]

        const detailHeights = detailRows.map((line) =>
          Math.max(14, measureText(line, 'Helvetica', 9.5, leftWidth) + 2),
        )
        const detailsHeight = detailHeights.reduce(
          (sum, height) => sum + height,
          0,
        )
        const imageHeight = imageBuffer ? 150 : imageError ? 18 : 0
        const bodyHeight = Math.max(
          descriptionLabelHeight + 3 + descriptionHeight + 8 + detailsHeight,
          imageHeight,
        )
        const cardHeight = padding + titleHeight + 10 + bodyHeight + padding

        ensureSpace(cardHeight + 14)
        const cardTop = doc.y
        const bodyTop = cardTop + padding + titleHeight + 10

        doc.save()
        doc
          .lineWidth(0.8)
          .strokeColor('#C9D4E6')
          .fillColor('#FFFFFF')
          .rect(cardX, cardTop, cardWidth, cardHeight)
          .fillAndStroke('#FFFFFF', '#C9D4E6')
        doc.fillColor('#1A3C8E').rect(cardX, cardTop, 4, cardHeight).fill()
        doc.restore()

        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor('#1A3C8E')
          .text(heading, leftX, cardTop + padding, {
            width: cardWidth - padding * 2,
            lineGap: 1,
          })

        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor('#303846')
          .text('Description', leftX, bodyTop, { width: leftWidth })

        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#202938')
          .text(description, leftX, bodyTop + descriptionLabelHeight + 3, {
            width: leftWidth,
            lineGap: 1,
          })

        let detailY =
          bodyTop + descriptionLabelHeight + 3 + descriptionHeight + 8
        detailRows.forEach((line, detailIndex) => {
          doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor('#303846')
            .text(line, leftX + 6, detailY, {
              width: leftWidth - 6,
              lineGap: 0,
            })
          detailY += detailHeights[detailIndex]
        })

        if (imageBuffer) {
          const imageX = cardX + cardWidth - 12 - 170
          doc.image(imageBuffer, imageX, bodyTop + 2, {
            fit: [160, 145],
            align: 'center',
            valign: 'center',
          })
        } else if (imageError) {
          const imageX = cardX + cardWidth - 182
          doc
            .font('Helvetica-Oblique')
            .fontSize(9)
            .fillColor('#B42318')
            .text('Photo indisponible', imageX, bodyTop + 8, { width: 165 })
        }

        doc.y = cardTop + cardHeight + 14
      }

      // -----------------------------------------------------
      // Fret / Incoterms — tableau horizontal adapté à la largeur A4
      // -----------------------------------------------------
      drawSectionTitle('Information de fret / Incoterms', {
        space: 110,
        gap: 8,
      })

      const shippingRows = [
        ['Incoterm', 'Prix HT', 'Fret maritime', 'Assurance', 'CIF', 'Devise'],
        [
          pdfSafeText(toText(shipping?.incoterm)),
          formatPdfAmount(shipping?.freeOnBoardFromOriginatePort),
          formatPdfAmount(shipping?.oceanFreight),
          formatPdfAmount(shipping?.insurance),
          formatPdfAmount(shipping?.totalOperatingCost),
          pdfSafeText(toText(shipping?.devise, '')),
        ],
      ]

      drawStyledTable(
        shippingRows,
        [74, 75, 96, 75, 85, 110], // somme = largeur utile A4 : 515 points
        {
          headerFontSize: 8.5,
          bodyFontSize: 9.5,
          headerPadding: 6,
          bodyPadding: 7,
          minHeaderHeight: 32,
          minRowHeight: 30,
          headerAlignments: [
            'left',
            'center',
            'center',
            'center',
            'center',
            'center',
          ],
          columnAlignments: [
            'left',
            'right',
            'right',
            'right',
            'right',
            'center',
          ],
          gapAfter: 18,
        },
      )

      // -----------------------------------------------------
      // AVD — éviter qu'un titre de section reste isolé en bas de page
      // -----------------------------------------------------
      if (articles.length > 0) {
        ensureSpace(550)
        drawSectionTitle('AVD - Analyse des valeurs en douane', {
          space: 500,
          gap: 12,
        })
      }

      for (let index = 0; index < articles.length; index += 1) {
        const article = articles[index] || {}
        // Laisser assez de place pour le titre et les deux tableaux de l'article.
        ensureSpace(500)

        drawSectionTitle(
          `Article ${index + 1} : ${toText(article.nom, 'Article sans nom')}`,
          {
            color: '#202938',
            size: 11,
            space: 490,
            gap: 9,
          },
        )

        const summaryRows = [
          ['Information', 'Valeur'],
          ['Code SH', pdfSafeText(toText(article.codeSH))],
          ['Valeur en douane (XOF)', formatPdfAmount(article.valeurCFA)],
          ['Total taxes (XOF)', formatPdfAmount(article.taxes?.total)],
          ['Devise', 'XOF'],
        ]

        drawStyledTable(summaryRows, [255, 260], {
          headerFontSize: 9,
          bodyFontSize: 9.5,
          minHeaderHeight: 30,
          minRowHeight: 25,
          columnAlignments: ['left', 'right'],
          headerAlignments: ['left', 'right'],
          gapAfter: 12,
        })

        doc
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .fillColor('#1A3C8E')
          .text('Détail des taxes', contentX, doc.y, {
            width: contentWidth(),
          })
        doc.y += 7

        const taxRows = [
          ['Taxe', 'Montant (XOF)'],
          ['Droit de douane', formatPdfAmount(article.taxes?.DD)],
          ['TVA', formatPdfAmount(article.taxes?.TVA)],
          ['PCS', formatPdfAmount(article.taxes?.PCS)],
          ['PC', formatPdfAmount(article.taxes?.PC)],
          ['PS', formatPdfAmount(article.taxes?.PS)],
          ['RAU', formatPdfAmount(article.taxes?.RAU)],
          ['RS', formatPdfAmount(article.taxes?.RS)],
          ['AIB', formatPdfAmount(article.taxes?.AIB)],
          ['Total des taxes', formatPdfAmount(article.taxes?.total)],
        ]

        drawStyledTable(taxRows, [330, 185], {
          headerFontSize: 9,
          bodyFontSize: 9.5,
          minHeaderHeight: 29,
          minRowHeight: 24,
          headerAlignments: ['left', 'right'],
          columnAlignments: ['left', 'right'],
          boldRowIndexes: [taxRows.length - 1],
          gapAfter: 20,
        })
      }

      // -----------------------------------------------------
      // Total général — 2 colonnes pour éviter le retour à la ligne des montants
      // -----------------------------------------------------
      if (articles.length > 0) {
        ensureSpace(290)
        drawSectionTitle('Total général des taxes', {
          color: '#1A3C8E',
          size: 12,
          space: 270,
          gap: 8,
        })

        const totalFor = (key) =>
          articles.reduce((sum, article) => {
            const value = Number(article?.taxes?.[key] ?? 0)
            return sum + (Number.isFinite(value) ? value : 0)
          }, 0)

        const totalRows = [
          ['Taxe', 'Montant total (XOF)'],
          ['Droit de douane', formatAmount(totalFor('DD'))],
          ['TVA', formatAmount(totalFor('TVA'))],
          ['PCS', formatAmount(totalFor('PCS'))],
          ['PC', formatAmount(totalFor('PC'))],
          ['PS', formatAmount(totalFor('PS'))],
          ['RAU', formatAmount(totalFor('RAU'))],
          ['RS', formatAmount(totalFor('RS'))],
          ['AIB', formatAmount(totalFor('AIB'))],
          [
            'Total des taxes globales',
            formatAmount(
              articles.reduce((sum, article) => {
                const value = Number(article?.taxes?.total ?? 0)
                return sum + (Number.isFinite(value) ? value : 0)
              }, 0),
            ),
          ],
        ]

        drawStyledTable(totalRows, [330, 185], {
          headerFontSize: 9,
          bodyFontSize: 9.5,
          minHeaderHeight: 30,
          minRowHeight: 25,
          headerAlignments: ['left', 'right'],
          columnAlignments: ['left', 'right'],
          boldRowIndexes: [totalRows.length - 1],
          gapAfter: 16,
        })
      }

      // -----------------------------------------------------
      // Mention légale — ne pas la laisser coupée par le pied de page
      // -----------------------------------------------------
      const legalText =
        'Ce calcul est fourni à titre indicatif sur la base des données disponibles et des barèmes en vigueur. Les montants présentés peuvent être ajustés ou requalifiés par l’administration douanière, seule habilitée à déterminer la valeur en douane et les droits définitifs.'
      const legalHeight =
        measureText(
          'Mention légale :',
          'Helvetica-Bold',
          10.5,
          contentWidth(),
        ) +
        5 +
        measureText(legalText, 'Helvetica', 9, contentWidth())
      ensureSpace(legalHeight + 16)

      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor('#202938')
        .text('Mention légale', contentX, doc.y, {
          width: contentWidth(),
        })
      doc.y += 5

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#454D5A')
        .text(legalText, contentX, doc.y, {
          width: contentWidth(),
          align: 'justify',
          lineGap: 2,
        })

      // Pied de page de la dernière page.
      drawFooter()
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

export const generateMTNMomoRefundPDF = async (tender, customer, qrcode) => {
  //.log('TENDER', tender)
  return new Promise((resolve, reject) => {
    try {
      const now = new Date()
      //const doc = new PDFDocument()
      const doc = new PDFDocumentWithTables()
      const chunks = []

      const writable = new Writable({
        write(chunk, enc, cb) {
          chunks.push(chunk)
          cb()
        },
      })

      // CRITIQUE : FIN DU STREAM
      writable.on('finish', () => {
        resolve(Buffer.concat(chunks))
      })

      writable.on('error', reject)

      doc.pipe(writable)

      doc.image('assets/logo.png', 40, 20, { width: 70 })
      doc.moveDown(1)

      // INFOS MARCHAND
      doc
        .fontSize(10)
        .text('31 Avenue du president Allende', { align: 'center' })
      doc.text('+33 0559040100', { align: 'center' })
      doc.text('Numéro IFU: 06466570485', { align: 'center' })
      doc.text(`Date: ${now.toLocaleDateString()}`, { align: 'center' })
      doc.text(`Heure: ${now.toLocaleTimeString()}`, { align: 'center' })
      doc.moveDown(2)

      // --- MARGES (UNE SEULE FOIS) ---
      const leftMargin = doc.page.margins?.left ?? 72
      const rightMargin = doc.page.margins?.right ?? 72
      const pageWidth = doc.page.width - leftMargin - rightMargin

      doc
        .fontSize(12)
        .text(customer === 'client' ? 'RECU CLIENT' : 'RECU MARCHAND', {
          align: 'center',
        })
      doc.moveDown(2)

      // --- TABLEAU PRODUIT ---
      doc.fontSize(12)

      const startX = leftMargin
      let currentY = doc.y

      const colItem = startX
      const colQty = startX + 80
      const colPrix = startX + 140
      const colTva = startX + 200
      const colMontant = startX + 260

      doc.text('Article', colItem, currentY)
      doc.text('Quantité', colQty, currentY)
      doc.text('Prix', colPrix, currentY)
      doc.text('TVA', colTva, currentY)
      doc.text('Montant XOF', colMontant, currentY)

      const lineY = currentY + 15
      doc
        .moveTo(leftMargin, lineY)
        .lineTo(leftMargin + pageWidth, lineY)
        .stroke()

      currentY = lineY + 10

      doc.text('100', colItem, currentY)
      doc.text('1', colQty, currentY)
      doc.text(tender.amount.toFixed(2), colPrix, currentY)
      doc.text('18%', colTva, currentY)
      doc.text(tender.amount.toFixed(2), colMontant, currentY)

      doc.moveDown(1)

      // --- TOTAL À PAYER ---
      const totalLabel = 'Total à rembourser:'
      const totalAmount = `${tender.amount.toFixed(2)} XOF`
      const totalWidth = doc.widthOfString(totalAmount)

      let y = doc.y

      // --- TOTAL À PAYER ---
      doc.text(totalLabel, leftMargin, y)
      doc.text(totalAmount, leftMargin + pageWidth - totalWidth, y)
      doc.moveDown(2)

      y = doc.y

      doc.moveDown(2)

      // --- IDENTIFIANT CLIENT MTN MOMO ---
      const idLabel = 'Identifiant client MTN MOMO:'
      const idValue = tender.paymentFinancialTransactionId || 'N/A' // ✔ ton modèle réel

      //console.log('WWWWWWWWWWWWW idValue=', idValue)
      const idWidth = doc.widthOfString(idValue)

      y = doc.y
      doc.text(idLabel, leftMargin, y)
      doc.text(idValue, leftMargin + pageWidth - idWidth, y)

      doc.moveDown(2)

      y = doc.y

      // --- TYPE ---
      const typeLabel = 'Type'
      const typeValue = 'BIENS & SERVICES'
      // widthOfString: calcule la largeur (en points PDF) du texte typeValue avec la police et la taille
      const typeWidth = doc.widthOfString(typeValue)

      doc.text(typeLabel + ':', leftMargin, y)
      doc.text(typeValue, leftMargin + pageWidth - typeWidth, y)
      doc.moveDown(2)

      y = doc.y

      // IMPORTANT : réinitialiser X
      doc.x = leftMargin

      // --- STATUT ---
      doc.fontSize(12).text('CREDIT', { align: 'center', underline: true })
      doc.moveDown(2)

      // --- DESCRIPTION ---
      doc.text(
        `Remboursement payment reference ${idValue} — scannez ce reçu pour en vérifier l’authenticité.`,
        { align: 'center' },
      )
      doc.moveDown(1)

      const qrSize = 140
      const qrX = leftMargin + (pageWidth - qrSize) / 2

      // VÉRIFICATION CRITIQUE avant d'ajouter l'image
      if (!qrcode || !Buffer.isBuffer(qrcode) || qrcode.length === 0) {
        console.error("QR Code invalide, impossible d'ajouter l'image")
        // Option 1: Ajouter un texte d'erreur
        doc.text('QR Code indisponible', { align: 'center' })
        doc.end()
      } else {
        doc.image(qrcode, qrX, doc.y, {
          width: qrSize,
          height: qrSize,
        })
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
/*
export const generateVehicleFullPDF = async (
  vehicles,
  photos,
  shipping,
  avdData,
) => {
  console.log('{ voitures info } ', { avdData })

  return new Promise(async (resolve, reject) => {
    try {
      // 1,4 cm de marge interne sur chaque bord (gauche, haut, droite, bas)

      const doc = new PDFDocumentWithTables({ margin: 40 })

      const stream = new PassThrough()

      const chunks = []

      doc.pipe(stream)

      stream.on('data', (c) => chunks.push(c))

      stream.on('end', () => resolve(Buffer.concat(chunks)))

      stream.on('error', reject)

      // -----------------------------------------------------

      // PAGE COUNTER

      // -----------------------------------------------------

      let currentPage = 1

      let lastHeaderPage = 0
      const refNumber = generateReference()

      const footerTop = () => doc.page.height - 80
      const pageContentBottom = () => footerTop() - 20

      // -----------------------------------------------------

      // HEADER

      // -----------------------------------------------------

      function drawHeader(doc) {
        // Évite les doublons sur la même page

        if (currentPage === lastHeaderPage) return

        lastHeaderPage = currentPage

        const now = new Date()

        const dateStr = now.toLocaleString('fr-FR')

        // X: 40 points() depuis le bord gauche => 515.28 - 40 = 475,28

        // Y: 20 points() depuis le bord haut => 762-20 = 742

        doc.image('assets/logo.png', 40, 20, { width: 70 })

        // Position du texte

        const headerY = 30

        let y = headerY

        // Nom entreprise

        doc

          .fillColor('#1A3C8E')

          .font('Helvetica-Bold')

          .fontSize(14)

          .text('Ztravel Consulting', 130, y, {
            width: 400,

            align: 'left',
          })

        y += 18

        // Sous-titre

        doc

          .fillColor('#000')

          .font('Helvetica')

          .fontSize(11)

          .text('Analyse des valeurs en douane (AVD)', 130, y, {
            width: 400,

            align: 'left',
          })

        y += 14

        // Date de génération

        doc

          .fontSize(10)

          .fillColor('#444')

          .text(`Document généré le : ${dateStr}`, 130, y, {
            width: 400,

            align: 'left',
          })

        // Ligne de séparation

        doc

          .moveTo(40, 80)

          .lineTo(doc.page.width - 40, 80)

          .strokeColor('#cccccc')

          .lineWidth(1)

          .stroke()

        // Position du contenu

        doc.y = 90
      }

      // -----------------------------------------------------

      // FOOTER

      // -----------------------------------------------------

      function drawFooter(doc) {
        const pageWidth = doc.page.width

        const pageHeight = doc.page.height // Hauteur A4 FIXE (841.89 pts)

        // Position du texte

        doc

          .moveTo(40, pageHeight - 80)

          .lineTo(pageWidth - 40, pageHeight - 80)

          .strokeColor('#cccccc')

          .lineWidth(1)

          .stroke()

        doc

          .fontSize(9)

          .fillColor('#666')

          .text(`Page ${currentPage}`, 0, pageHeight - 50, {
            align: 'center',
          })

        // Compteur simple

        // Référence

        // Dans un footer, tu dois utiliser des coordonnées fixes, car le footer ne dépend pas de doc.y

        doc

          .fontSize(9)

          .fillColor('#444')

          .text(`Référence : ${refNumber}`, 40, pageHeight - 60, {
            width: 300,

            align: 'left',
          })
      }

      // -----------------------------------------------------

      // PAGE ADDED HOOK (LE SEUL QUI DOIT EXISTER)

      // -----------------------------------------------------

      // Fonction pour changer de page (100% maîtrisée)

      function newPage(doc) {
        drawFooter(doc) // Footer de la page ACTUELLE

        doc.addPage() // Nouvelle page

        currentPage++ // Incrémente le compteur

        drawHeader(doc) // Header de la NOUVELLE page

        doc.y = 100 // ⭐ Réinitialise doc.y (CRUCIAL)
      }

      function getUsableHeight(doc) {
        //return doc.page.height - doc.page.margins.bottom - doc.y

        const footerHeight = 100 // zone réservée pour le footer

        return pageContentBottom() - doc.y
      }

      function ensureSpace(doc, neededHeight) {
        if (getUsableHeight(doc) < neededHeight) {
          newPage(doc)
        }
      }

      // -----------------------------------------------------

      // PAGE 1

      // -----------------------------------------------------

      drawHeader(doc)

      //doc.y = 80 // Position après le header

      // -----------------------------------------------------

      // LISTE PRODUITS

      // -----------------------------------------------------

      doc.moveDown(1)

      doc

        .fillColor('#1A3C8E')

        .fontSize(12)

        .font('Helvetica-Bold')

        .text('Liste de véhicules', doc.page.margins.left, doc.y, {
          width: 500,

          align: 'left',

          lineBreak: true,
        })

      doc.moveDown(1)

      for (let index = 0; index < (vehicles || []).length; index++) {
        const vehicle = vehicles[index]

        const pageWidth = doc.page.width
        const left = 40
        const boxWidth = pageWidth - left * 2
        const innerPadding = 12
        const textX = left + innerPadding
        const textWidth = 300
        const imageWidth = 150
        const title = `Véhicule ${index + 1} — ${vehicle.description || 'Description non renseignée'}`
        const titleHeight = doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .heightOfString(title, {
            width: boxWidth - innerPadding * 2,
            lineGap: 2,
          })
        const fields = [
          `Marque : ${vehicle.marque ?? 'N/A'}`,
          `Type : ${vehicle.type ?? 'N/A'}`,
          `Année : ${vehicle.anneeFabrication ?? 'N/A'}`,
          `Motorisation : ${vehicle.motorisation ?? 'N/A'}`,
          `Description : ${vehicle.description ?? 'N/A'}`,
          `Puissance fiscale : ${vehicle.puissanceFiscal ?? 'N/A'} cv`,
          `Kilométrage : ${vehicle.kilometrage ?? 'N/A'} km`,
          `Dimensions : ${vehicle.longueurCm ?? 'N/A'} × ${vehicle.largeurCm ?? 'N/A'} × ${vehicle.hauteurCm ?? 'N/A'} cm`,
          `Poids : ${vehicle.poidsKg ?? 'N/A'} kg`,
          `Quantité : ${vehicle.quantity ?? 'N/A'}`,
          `Prix unitaire : ${vehicle.prix ?? 'N/A'} ${vehicle.devise ?? ''}`,
          `Prix total : ${vehicle.prixTotal ?? 'N/A'} ${vehicle.devise ?? ''}`,
        ]
        doc.font('Helvetica').fontSize(10)
        const fieldHeights = fields.map(
          (field) =>
            doc.heightOfString(field, {
              width: textWidth,
              lineGap: 1,
            }) + 5,
        )
        const textBlockHeight =
          titleHeight + 12 + fieldHeights.reduce((sum, h) => sum + h, 0)
        const boxHeight = Math.max(textBlockHeight + innerPadding * 2, 190)

        ensureSpace(doc, boxHeight + 12)

        const boxTop = doc.y

        doc

          .lineWidth(1)

          .strokeColor('#1A3C8E')

          .rect(left, boxTop, boxWidth, boxHeight)

          .stroke()

        let yText = boxTop + innerPadding

        doc
          .fillColor('#1A3C8E')
          .fontSize(13)
          .font('Helvetica-Bold')
          .text(title, textX, yText, {
            width: boxWidth - innerPadding * 2,
            lineGap: 2,
          })

        yText += titleHeight + 12

        doc.fillColor('#000').font('Helvetica').fontSize(10)
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
          doc.text(fields[fieldIndex], textX, yText, {
            width: textWidth,
            lineGap: 1,
          })
          yText += fieldHeights[fieldIndex]
        }

        const file = (photos || []).find(
          (f) => f.fieldname === `photo_${index}`,
        )

        if (file) {
          try {
            const pngBuffer = await sharp(file.buffer).rotate().png().toBuffer()

            // 40 → marge gauche du bloc, 520 → largeur totale du bloc produit, 180 → largeur maximale de l’image (fit: [180, 180])

            // 10 → marge droite interne

            const xImg = left + boxWidth - 180 - innerPadding

            const yImg = boxTop + Math.max(titleHeight + 24, 42)

            doc.image(pngBuffer, xImg, yImg, { fit: [180, 180] })
          } catch (err) {
            doc
              .fillColor('red')
              .fontSize(9)
              .text(
                'Image illisible',
                left + boxWidth - imageWidth - innerPadding,
                boxTop + 20,
                { width: imageWidth },
              )

            doc.fillColor('black')
          }
        }

        doc.y = boxTop + boxHeight + 12
      } // end for loop

      // -----------------------------------------------------

      // SHIPPING

      // -----------------------------------------------------

      ensureSpace(doc, 150)

      doc.moveDown(1)

      doc

        .fillColor('#1A3C8E')

        .fontSize(12)

        .font('Helvetica-Bold')

        .text('SHIPPING INFORMATIONS / INCOTERMS', doc.page.margins.left)

      doc.moveDown(1)

      const usableWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right // = 555.28 pts

      // TABLEAU

      const rows = [
        ['Incoterm', 'Prix HT', 'Prix transport', 'Assurance', 'CIF', 'Devise'],

        [
          shipping.incoterm,

          shipping.freeOnBoardFromOriginatePort,

          shipping.oceanFreight,

          shipping.insurance,

          shipping.totalOperatingCost,

          shipping.devise,
        ],
      ]

      const columnWidths = [85, 80, 100, 80, 95, 75] // largeur totale : 515 points

      drawTable(doc, 40, doc.y, rows, columnWidths, newPage, {
        headerBackground: '#1A3C8E',

        headerTextColor: '#FFFFFF',

        alternateRowColor: '#EFE',

        rowTextColor: '#000000',

        prepareHeader: () => {
          doc.font('Helvetica-Bold').fontSize(10)
        },

        prepareRow: () => {
          doc.font('Helvetica').fontSize(10)
        },
      })

      doc.moveDown(1)

      // -----------------------------------------------------

      // AVD

      // -----------------------------------------------------

      doc

        .fillColor('#1A3C8E')

        .fontSize(12)

        .font('Helvetica-Bold')

        .text('AVD - Analyse des valeurs en douane', doc.page.margins.left)

      //doc.moveDown(1)

      // Utile si code SH introuvable)

      const safe = (value) =>
        typeof value === 'number' ? formatXOF(value) : 'N/A'

      for (let i = 0; i < (avdData || []).length; i++) {
        const a = avdData[i]

        ensureSpace(doc, 200)

        const tableRows = [
          ['Élément', 'Montant / taux'],
          ['Droit de douane', safe(a.DD)],
          ['TVA', safe(a.TVA)],
          ['Taxe statistique', safe(a.TSTAT)],
          ['Taux DD', a.tauxDD != null ? `${a.tauxDD}%` : 'N/A'],
          ['Timbre douanier (TD)', safe(a.TD)],
          ['Total taxes véhicule', safe(a.totalTaxes)],
        ]
        const columnWidths = [300, doc.page.width - 80 - 300]

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#000')
          .text(
            `Détail des taxes voiture ${i + 1} : ${a.marque || 'Marque non renseignée'}`,
            40,
            doc.y,
            {
              width: doc.page.width - 80,
            },
          )
        doc.moveDown(0.5)

        drawTable(doc, 40, doc.y, tableRows, columnWidths, newPage, {
          headerBackground: '#1A3C8E',
          headerTextColor: '#FFFFFF',
          alternateRowColor: '#EFEFEF',
          rowTextColor: '#000000',
          prepareHeader: () => {
            doc.font('Helvetica-Bold').fontSize(10)
          },
          prepareRow: () => {
            doc.font('Helvetica').fontSize(10)
          },
        })

        doc.moveDown(1)
      }

      // TOTAL GÉNÉRAL

      ensureSpace(doc, 200)

      doc

        .font('Helvetica-Bold')

        .fontSize(12)

        .text('Total général des taxes', 40, doc.y)

      const totals = {
        //totalCIF: avdData.reduce((s, v) => s + Number(v.CIF), 0),

        totalDD: (avdData || []).reduce((s, v) => s + Number(v.DD || 0), 0),

        totalTVA: (avdData || []).reduce((s, v) => s + Number(v.TVA || 0), 0),

        totalTSTAT: (avdData || []).reduce(
          (s, v) => s + Number(v.TSTAT || 0),
          0,
        ),

        totalTD: (avdData || []).reduce((s, v) => s + Number(v.TD || 0), 0),

        totalTaxes: (avdData || []).reduce(
          (s, v) => s + Number(v.totalTaxes || 0),
          0,
        ),
      }

      const totalRows = [
        ['Élément', 'Montant total'],
        ['Total DD', safe(totals.totalDD)],
        ['Total TVA', safe(totals.totalTVA)],
        ['Total taxe statistique', safe(totals.totalTSTAT)],
        ['Total timbre douanier (TD)', safe(totals.totalTD)],
        ['Total taxes globales', safe(totals.totalTaxes)],
      ]
      const totalColumnWidths = [300, doc.page.width - 80 - 300]

      drawTable(doc, 40, doc.y, totalRows, totalColumnWidths, newPage, {
        headerBackground: '#1A3C8E',
        headerTextColor: '#FFFFFF',
        alternateRowColor: '#EFEFEF',
        rowTextColor: '#000000',
        prepareHeader: () => {
          doc.font('Helvetica-Bold').fontSize(10)
        },
        prepareRow: () => {
          doc.font('Helvetica').fontSize(10)
        },
      })

      // MENTION LEGAL

      // text() attend (texte, x, y, options).

      doc.moveDown(2)

      doc

        .font('Helvetica-Bold')

        .fontSize(12)

        .text('Mention légale : ', 40, doc.y, {
          width: 500,

          align: 'left',

          lineBreak: true,
        })

      doc

        .font('Helvetica')

        .fontSize(10)

        .text(
          'Ce calcul est fourni à titre indicatif sur la base des données disponibles et des barèmes en vigueur. Les montants présentés peuvent être ajustés ou requalifiés par l’administration douanière, seule habilitée à déterminer la valeur en douane et les droits définitifs.',

          {
            width: doc.page.width - 80,

            align: 'left',

            lineGap: 2,
          },
        )

      // -----------------------------------------------------

      // FOOTER FINAL

      // -----------------------------------------------------

      drawFooter(doc)

      doc.end()
    } catch (error) {
      console.log(error)

      reject(error)
    }
  })
}*/

// ---------------------------------------------------------------------
// GÉNÉRATION
// ---------------------------------------------------------------------

export const generateVehicleFullPDF = async (
  vehicles,
  photos,
  shipping,
  avdData,
) => {
  const vehiclesList = vehicles || []

  // -------------------------------------------------------------------
  // PRÉ-TRAITEMENT DES PHOTOS (await autorisé ici, hors de la Promise)
  // -------------------------------------------------------------------

  const photoBuffers = new Map() // key: index véhicule -> Buffer png
  for (let index = 0; index < vehiclesList.length; index++) {
    const file = (photos || []).find((f) => f.fieldname === `photo_${index}`)
    if (!file) continue
    try {
      const pngBuffer = await sharp(file.buffer).rotate().png().toBuffer()
      photoBuffers.set(index, pngBuffer)
    } catch (err) {
      console.error(`Photo ${index} illisible :`, err.message)
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocumentWithTables({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true,
      })

      const stream = new PassThrough()
      const chunks = []

      doc.pipe(stream)
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)

      // -------------------------------------------------------------------
      // ÉTAT DE PAGINATION
      // -------------------------------------------------------------------

      let currentPage = 1
      const refNumber = generateReference()

      const contentBottom = () => doc.page.height - FOOTER_ZONE - 20
      const usableWidth = () => doc.page.width - MARGIN * 2
      const usableHeight = () => contentBottom() - doc.y

      // Dessine le header de la page courante
      function drawHeader() {
        const now = new Date()
        const dateStr = now.toLocaleString('fr-FR')

        doc.image('assets/logo.png', MARGIN, 20, { width: 70 })

        let y = 30
        doc
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .fontSize(14)
          .text('Ztravel Consulting', 130, y, { width: 400, align: 'left' })

        y += 18
        doc
          .fillColor('#000000')
          .font('Helvetica')
          .fontSize(11)
          .text('Analyse des valeurs en douane (AVD)', 130, y, {
            width: 400,
            align: 'left',
          })

        y += 14
        doc
          .fontSize(10)
          .fillColor('#444444')
          .text(`Document généré le : ${dateStr}`, 130, y, {
            width: 400,
            align: 'left',
          })

        doc
          .moveTo(MARGIN, 80)
          .lineTo(doc.page.width - MARGIN, 80)
          .strokeColor(COLORS.line)
          .lineWidth(1)
          .stroke()

        doc.y = 90
      }

      // Dessine le footer de la page courante
      function drawFooter() {
        const oldY = doc.y

        const { width: pageWidth, height: pageHeight } = doc.page

        doc
          .moveTo(MARGIN, pageHeight - FOOTER_ZONE)
          .lineTo(pageWidth - MARGIN, pageHeight - FOOTER_ZONE)
          .strokeColor(COLORS.line)
          .lineWidth(1)
          .stroke()

        doc
          .fontSize(9)
          .fillColor(COLORS.muted)
          .text(`Page ${currentPage}`, 0, pageHeight - 50, {
            width: pageWidth,
            align: 'center',
            lineBreak: false,
          })

        doc
          .fontSize(9)
          .fillColor('#444444')
          .text(`Référence : ${refNumber}`, MARGIN, pageHeight - 60, {
            width: 300,
            align: 'left',
            lineBreak: false,
          })

        doc.y = oldY
      }

      // Passe à la page suivante (seul point d'ajout de page du document)
      function newPage() {
        drawFooter()
        doc.addPage()
        currentPage += 1
        drawHeader()
      }

      // Garantit `needed` points disponibles sous doc.y, sinon nouvelle page
      function ensureSpace(needed) {
        if (usableHeight() < needed) {
          newPage()
        }
      }

      // -------------------------------------------------------------------
      // TABLEAU AVEC COLONNES COLORÉES
      // -------------------------------------------------------------------

      /**
       * drawTable — dessine un tableau :
       *  - en-tête : chaque colonne a sa couleur (columnPalette, cyclique)
       *  - lignes : fond léger différent par colonne (columnTint, cyclique)
       * Gère le passage à la page suivante si le tableau ne tient pas.
       */
      function drawTable(rows, columnWidths) {
        if (!rows.length) return

        const rowHeight = 24
        const tableWidth = columnWidths.reduce((sum, w) => sum + w, 0)

        // Le tableau entier tient-il sur la page ? Sinon, nouvelle page.
        //ensureSpace(rows.length * rowHeight + 10)

        let y = doc.y

        rows.forEach((row, rowIndex) => {
          // Anti-saut involontaire : si on dépasse la zone de contenu, on pagine
          if (y + rowHeight > contentBottom()) {
            newPage()
            y = doc.y
          }

          let x = MARGIN

          row.forEach((cell, colIndex) => {
            const width = columnWidths[colIndex]

            if (rowIndex === 0) {
              // En-tête : couleur par colonne
              doc
                .rect(x, y, width, rowHeight)
                .fillColor(
                  COLORS.columnPalette[colIndex % COLORS.columnPalette.length],
                )
                .fill()

              doc
                .fillColor(COLORS.headerText)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text(String(cell), x + 6, y + 7, {
                  width: width - 12,
                  align: 'left',
                  ellipsis: true,
                  lineBreak: false,
                })
            } else {
              // Données : fond léger par colonne, zébrage optionnel sur lignes paires
              const tint =
                rowIndex % 2 === 1
                  ? COLORS.columnTint[colIndex % COLORS.columnTint.length]
                  : '#F9F9F9'
              doc.rect(x, y, width, rowHeight).fillColor(tint).fill()

              doc
                .fillColor(COLORS.rowText)
                .font('Helvetica')
                .fontSize(10)
                .text(String(cell), x + 6, y + 7, {
                  width: width - 12,
                  align: 'left',
                  ellipsis: true,
                  lineBreak: false,
                })
            }

            // Bordure de cellule
            doc
              .rect(x, y, width, rowHeight)
              .strokeColor(COLORS.line)
              .lineWidth(0.5)
              .stroke()

            x += width
          })

          y += rowHeight
        })

        // Repositionne le curseur de texte SOUS le tableau,
        // en évitant tout auto-flow de pdfkit vers une page vierge.
        doc.y = y + 12
      }

      // Écrit un titre de section (vérifie l'espace avant)
      function sectionTitle(text) {
        ensureSpace(40)
        //doc.moveDown(1)
        doc
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(text, MARGIN, doc.y, { width: usableWidth(), align: 'left' })
        //doc.moveDown(0.5)
      }

      // -------------------------------------------------------------------
      // PAGE 1
      // -------------------------------------------------------------------

      drawHeader()

      // -------------------------------------------------------------------
      // LISTE DES VÉHICULES
      // -------------------------------------------------------------------

      sectionTitle('Liste de véhicules')

      const vehiclesList = vehicles || []

      for (let index = 0; index < vehiclesList.length; index++) {
        const vehicle = vehiclesList[index]
        const left = MARGIN
        const boxWidth = usableWidth()
        const innerPadding = 12
        const textX = left + innerPadding
        const textWidth = 300

        const title = `Véhicule ${index + 1} — ${vehicle.description || 'Description non renseignée'}`

        const fields = [
          `Marque : ${vehicle.marque ?? 'N/A'}`,
          `Type : ${vehicle.type ?? 'N/A'}`,
          `Année : ${vehicle.anneeFabrication ?? 'N/A'}`,
          `Motorisation : ${vehicle.motorisation ?? 'N/A'}`,
          `Description : ${vehicle.description ?? 'N/A'}`,
          `Puissance fiscale : ${vehicle.puissanceFiscal ?? 'N/A'} cv`,
          `Kilométrage : ${vehicle.kilometrage ?? 'N/A'} km`,
          `Dimensions : ${vehicle.longueurCm ?? 'N/A'} × ${vehicle.largeurCm ?? 'N/A'} × ${vehicle.hauteurCm ?? 'N/A'} cm`,
          `Poids : ${vehicle.poidsKg ?? 'N/A'} kg`,
          `Quantité : ${vehicle.quantity ?? 'N/A'}`,
          `Prix unitaire : ${vehicle.prix ?? 'N/A'} ${vehicle.devise ?? ''}`,
          `Prix total : ${vehicle.prixTotal ?? 'N/A'} ${vehicle.devise ?? ''}`,
        ]

        doc.font('Helvetica').fontSize(10)
        const titleHeight = doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .heightOfString(title, {
            width: boxWidth - innerPadding * 2,
            lineGap: 2,
          })
        const fieldHeights = fields.map(
          (field) =>
            doc.heightOfString(field, { width: textWidth, lineGap: 1 }) + 5,
        )
        const textBlockHeight =
          titleHeight + 12 + fieldHeights.reduce((sum, h) => sum + h, 0)
        const boxHeight = Math.max(textBlockHeight + innerPadding * 2, 190)

        // Toute la carte doit tenir sur la page — jamais de coupure au milieu
        ensureSpace(boxHeight + 14)

        const boxTop = doc.y

        doc
          .lineWidth(1)
          .strokeColor(COLORS.primary)
          .rect(left, boxTop, boxWidth, boxHeight)
          .stroke()

        let yText = boxTop + innerPadding

        doc
          .fillColor(COLORS.primary)
          .fontSize(13)
          .font('Helvetica-Bold')
          .text(title, textX, yText, {
            width: boxWidth - innerPadding * 2,
            lineGap: 2,
          })

        yText += titleHeight + 12

        doc.fillColor('#000000').font('Helvetica').fontSize(10)
        fields.forEach((field, fieldIndex) => {
          doc.text(field, textX, yText, { width: textWidth, lineGap: 1 })
          yText += fieldHeights[fieldIndex]
        })

        const pngBuffer = photoBuffers.get(index)
        const file = (photos || []).find(
          (f) => f.fieldname === `photo_${index}`,
        )

        if (pngBuffer) {
          const xImg = left + boxWidth - 180 - innerPadding
          const yImg = boxTop + Math.max(titleHeight + 24, 42)
          doc.image(pngBuffer, xImg, yImg, { fit: [180, 180] })
        } else if (file) {
          // photo présente mais illisible au pré-traitement
          doc
            .fillColor('red')
            .fontSize(9)
            .text(
              'Image illisible',
              left + boxWidth - 150 - innerPadding,
              boxTop + 20,
              {
                width: 150,
              },
            )
          doc.fillColor('#000000')
        }

        doc.y = boxTop + boxHeight + 14
      }

      // -------------------------------------------------------------------
      // SHIPPING / INCOTERMS
      // -------------------------------------------------------------------

      ensureSpace(150)
      sectionTitle('SHIPPING INFORMATIONS / INCOTERMS')

      const shippingRows = [
        ['Incoterm', 'Prix HT', 'Prix transport', 'Assurance', 'CIF', 'Devise'],
        [
          shipping.incoterm ?? 'N/A',
          shipping.freeOnBoardFromOriginatePort ?? 'N/A',
          shipping.oceanFreight ?? 'N/A',
          shipping.insurance ?? 'N/A',
          shipping.totalOperatingCost ?? 'N/A',
          shipping.devise ?? 'N/A',
        ],
      ]
      const shippingWidths = [85, 80, 100, 80, 95, 75] // total 515 pts

      drawTable(shippingRows, shippingWidths)

      // -------------------------------------------------------------------
      // AVD — ANALYSE DES VALEURS EN DOUANE
      // -------------------------------------------------------------------

      ensureSpace(80)
      sectionTitle('AVD - Analyse des valeurs en douane')

      const avdList = avdData || []

      for (let i = 0; i < avdList.length; i++) {
        const a = avdList[i]

        // Le titre + le tableau de ce véhicule doivent tenir ensemble
        ensureSpace(30 + 7 * 24 + 20)

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#000000')
          .text(
            `Détail des taxes voiture ${i + 1} : ${a.marque || 'Marque non renseignée'}`,
            MARGIN,
            doc.y,
            { width: usableWidth() },
          )
        doc.y += 10

        const tableRows = [
          ['Élément', 'Montant / taux'],
          ['Droit de douane', safe(a.DD)],
          ['TVA', safe(a.TVA)],
          ['Taxe statistique', safe(a.TSTAT)],
          ['Taux DD', a.tauxDD != null ? `${a.tauxDD}%` : 'N/A'],
          ['Timbre douanier (TD)', safe(a.TD)],
          ['Total taxes véhicule', safe(a.totalTaxes)],
        ]
        const avdWidths = [300, usableWidth() - 300]

        drawTable(tableRows, avdWidths)
      }

      // -------------------------------------------------------------------
      // TOTAL GÉNÉRAL
      // -------------------------------------------------------------------

      ensureSpace(30 + 6 * 24 + 20)
      sectionTitle('Total général des taxes')

      const totals = {
        totalDD: avdList.reduce((s, v) => s + Number(v.DD || 0), 0),
        totalTVA: avdList.reduce((s, v) => s + Number(v.TVA || 0), 0),
        totalTSTAT: avdList.reduce((s, v) => s + Number(v.TSTAT || 0), 0),
        totalTD: avdList.reduce((s, v) => s + Number(v.TD || 0), 0),
        totalTaxes: avdList.reduce((s, v) => s + Number(v.totalTaxes || 0), 0),
      }

      const totalRows = [
        ['Élément', 'Montant total'],
        ['Total DD', safe(totals.totalDD)],
        ['Total TVA', safe(totals.totalTVA)],
        ['Total taxe statistique', safe(totals.totalTSTAT)],
        ['Total timbre douanier (TD)', safe(totals.totalTD)],
        ['Total taxes globales', safe(totals.totalTaxes)],
      ]
      const totalWidths = [300, usableWidth() - 300]

      drawTable(totalRows, totalWidths)

      // -------------------------------------------------------------------
      // MENTION LÉGALE
      // -------------------------------------------------------------------

      const legalText =
        'Ce calcul est fourni à titre indicatif sur la base des données disponibles et des barèmes en vigueur. ' +
        'Les montants présentés peuvent être ajustés ou requalifiés par l’administration douanière, ' +
        'seule habilitée à déterminer la valeur en douane et les droits définitifs.'
      const legalHeight = doc
        .font('Helvetica')
        .fontSize(10)
        .heightOfString(legalText, { width: usableWidth(), lineGap: 2 })

      // Titre + texte : jamais coupés par un saut de page
      ensureSpace(30 + legalHeight + 20)

      doc.moveDown(1)
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#000000')
        .text('Mention légale :', MARGIN, doc.y, {
          width: usableWidth(),
          align: 'left',
        })

      doc
        .font('Helvetica')
        .fontSize(10)
        .text(legalText, { width: usableWidth(), align: 'left', lineGap: 2 })

      // -------------------------------------------------------------------
      // FOOTER DE LA DERNIÈRE PAGE
      // -------------------------------------------------------------------

      drawFooter()
      doc.end()
    } catch (error) {
      console.error('Erreur génération PDF véhicules :', error)
      reject(error)
    }
  })
}

/**
 * Generate the AVD reference number
 * @returns
 */
function generateReference() {
  const year = new Date().getFullYear()

  // Si le fichier n'existe pas → on le crée
  if (!fs.existsSync(refPath)) {
    fs.writeFileSync(refPath, JSON.stringify({ last: 0 }))
  }

  // Lecture
  const data = JSON.parse(fs.readFileSync(refPath, 'utf8'))

  // Incrémentation
  data.last++

  // Sauvegarde
  fs.writeFileSync(refPath, JSON.stringify(data))

  // Retourne la référence
  return `${year}-${String(data.last).padStart(3, '0')}`
}

export default {
  generateProductFullPDF,
  generateMTNMomoRefundPDF,
  generateVehicleFullPDF,
}
