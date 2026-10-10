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
/*
function drawTable(
  doc,
  startX,
  startY,
  rows,
  columnWidths,
  newPage,
  options = {},
  rowHeight = 28,
) {
  const { prepareHeader, prepareRow } = options

  let y = startY

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]

    if (y + rowHeight > doc.page.height - 20) {
      newPage(doc)
      y = doc.y
    }

    let x = startX

    if (rowIndex > 0 && rowIndex % 2 === 0) {
      const totalWidth = columnWidths.reduce((a, b) => a + Number(b), 0)

      doc
        .save()
        .fillColor('#EFE')
        .rect(startX, y, totalWidth, rowHeight)
        .fill()
        .restore()
    }

    // appliquer le style
    if (rowIndex === 0 && prepareHeader) {
      prepareHeader()
    } else if (prepareRow) {
      prepareRow(row, rowIndex)
    }

    row.forEach((cell, colIndex) => {
      const cellWidth = Number(columnWidths[colIndex])
      //console.log('cell =', cell)

      doc
        .lineWidth(0.5)
        .strokeColor('#000')
        .rect(x, y, cellWidth, rowHeight)
        .stroke()

      doc
        .fillColor('#000')
        .fontSize(11)
        .text(cell, x + 2, y + 4, {
          width: cellWidth - 4, // Padding horizontal
          align: colIndex === 1 ? 'right' : 'left',
          lineBreak: true,
        })

      x += cellWidth
    })

    y += rowHeight
  }

  doc.y = y + 10
}
  */

function drawTable(
  doc,
  startX,
  startY,
  rows,
  columnWidths,
  newPage,
  options = {},
  rowHeight = 28,
) {
  const {
    prepareHeader,
    prepareRow,
    headerBackground = null, // couleur de fond pour l'en-tête (ex: '#1A3C8E')
    headerTextColor = '#000', // couleur du texte pour l'en-tête
    rowTextColor = '#000', // couleur du texte pour les lignes normales
    alternateRowColor = null, // couleur de fond pour les lignes paires (ex: '#EFE')
  } = options

  let y = startY

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]

    // Vérifier l'espace
    if (y + rowHeight > doc.page.height - 20) {
      newPage(doc)
      y = doc.y
    }

    let x = startX
    const totalWidth = columnWidths.reduce((a, b) => a + Number(b), 0)

    // === DESSINER LE FOND DE LA LIGNE ===
    if (rowIndex === 0 && headerBackground) {
      // Fond de l'en-tête
      doc
        .save()
        .fillColor(headerBackground)
        .rect(startX, y, totalWidth, rowHeight)
        .fill()
        .restore()
    } else if (rowIndex > 0 && alternateRowColor && rowIndex % 2 === 0) {
      // Fond des lignes alternées
      doc
        .save()
        .fillColor(alternateRowColor)
        .rect(startX, y, totalWidth, rowHeight)
        .fill()
        .restore()
    }

    // === APPLIQUER LES STYLES DE POLICE ET COULEUR ===
    if (rowIndex === 0 && prepareHeader) {
      prepareHeader()
      // Si prepareHeader n'a pas défini fillColor, on utilise headerTextColor
      doc.fillColor(headerTextColor)
    } else if (prepareRow) {
      prepareRow(row, rowIndex)
      // Si prepareRow n'a pas défini fillColor, on utilise rowTextColor
      doc.fillColor(rowTextColor)
    } else {
      // Par défaut
      doc.fillColor(rowIndex === 0 ? headerTextColor : rowTextColor)
    }

    // === DESSINER LES CELLULES ===
    row.forEach((cell, colIndex) => {
      const cellWidth = Number(columnWidths[colIndex])

      // Bordures (optionnelles)
      doc
        .lineWidth(0.5)
        .strokeColor('#000')
        .rect(x, y, cellWidth, rowHeight)
        .stroke()

      // Texte (utilise la couleur définie)
      doc.fontSize(11).text(String(cell ?? ''), x + 2, y + 4, {
        width: cellWidth - 4,
        align: colIndex === 1 ? 'right' : 'left', // ou selon vos besoins
        lineBreak: true,
      })

      x += cellWidth
    })

    y += rowHeight
  }

  doc.y = y + 10
}

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

export const generateProductFullPDF = async (
  products,
  photos,
  shipping,
  avdData,
) => {
  const { articles } = avdData
  console.log('ARTICLES', articles)

  return new Promise(async (resolve, reject) => {
    try {
      // 1,4 cm de marge interne sur chaque bord (gauche, haut, droite, bas)
      const doc = new PDFDocumentWithTables({ margin: 20 })
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
      let lastHeaderPage = 0 // ⭐ Suivi des pages
      const neededHeight = 260 // hauteur du bloc produit

      // -----------------------------------------------------
      // HEADER
      // -----------------------------------------------------
      function drawHeader(doc) {
        if (currentPage === lastHeaderPage) return
        lastHeaderPage = currentPage

        const now = new Date()

        const dateStr = now.toLocaleString('fr-FR')

        // Logo
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
        const refNumber = generateReference()

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
        return doc.page.height - 20 - doc.y - footerHeight
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
      //doc.y = 100 // Position après le header

      // -----------------------------------------------------
      // LISTE PRODUITS
      // -----------------------------------------------------
      doc.moveDown(1)

      doc
        .fillColor('#1A3C8E')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Liste de produits', doc.page.margins.left, doc.y, {
          width: 500,
          align: 'left',
          lineBreak: true,
        })

      doc.moveDown(1)

      for (let index = 0; index < products.length; index++) {
        const produit = products[index]
        const boxHeight = 260

        ensureSpace(doc, boxHeight)

        const boxTop = doc.y

        doc
          .lineWidth(1)
          .strokeColor('#1A3C8E')
          .rect(40, boxTop, 520, boxHeight)
          .stroke()

        let yText = boxTop + 10

        doc
          .fillColor('#1A3C8E')
          .font('Helvetica-Bold')
          .fontSize(14)
          .text(`Produit ${index + 1}: ${produit.nom}`, 50, yText, {
            width: 500,
            align: 'left',
            lineBreak: true,
          })

        yText += 40

        doc
          .fillColor('#000')
          .font('Helvetica-Bold')
          .fontSize(11)
          .text(`Description : ${produit.description}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        doc.moveDown(3)

        yText += 28
        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(
            `Dimensions : ${produit.longueurCm} x ${produit.largeurCm} cm`,
            50,
            yText,
            {
              width: 400,
              align: 'left',
              lineBreak: true,
            },
          )
        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Poids : ${produit.poidsKg} kg`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })
        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Quantité : ${produit.quantity}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })
        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Cartons : ${produit.numberOfBox}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })
        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(
            `Prix unitaire : ${produit.prix} ${produit.devise}`,
            50,
            yText,
            {
              width: 400,
              align: 'left',
              lineBreak: true,
            },
          )
        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(
            `Prix total : ${produit.prixTotal} ${produit.devise}`,
            50,
            yText,
            {
              width: 500,
              align: 'left',
              lineBreak: true,
            },
          )

        const file = photos.find((f) => f.fieldname === `photo_${index}`)

        if (file) {
          try {
            const pngBuffer = await sharp(file.buffer).rotate().png().toBuffer()
            const xImg = 40 + 520 - 180 - 10
            const yImg = boxTop + 70

            doc.image(pngBuffer, xImg, yImg, { fit: [180, 180] })
          } catch (err) {
            doc.fillColor('red').text(`Image illisible`, 350, boxTop + 20)
            doc.fillColor('black')
          }
        }

        doc.y = boxTop + boxHeight + 20
      }

      // -----------------------------------------------------
      // SHIPPING
      // -----------------------------------------------------
      ensureSpace(doc, 150)

      doc.moveDown(1)

      doc
        .fillColor('#1A3C8E')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Information de fret / Incoterms', doc.page.margins.left, doc.y, {
          width: 500,
          align: 'left',
          lineBreak: true,
        })

      doc.moveDown(1)

      const usableWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right // = 555.28 pts
      // TABLEAU 100% STABLE
      const rows = [
        ['Incoterm', 'Prix HT', 'Fret maritime', 'Assurance', 'CIF', 'Devise'],
        [
          shipping.incoterm,
          shipping.freeOnBoardFromOriginatePort,
          shipping.oceanFreight,
          shipping.insurance,
          shipping.totalOperatingCost,
          shipping.devise,
        ],
      ]
      const columnWidths = [90, 80, 90, 90, 120, 85] // total = 555

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

      //drawTable(doc, 40, doc.y, rows, columnWidths, newPage)

      doc.moveDown(1)

      // -----------------------------------------------------
      // AVD
      // -----------------------------------------------------
      doc
        .fillColor('#1A3C8E')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('AVD - Analyse des valeurs en douane', doc.page.margins.left)

      doc.moveDown(1)

      // LOOP
      for (let i = 0; i < articles.length; i++) {
        const a = articles[i]

        ensureSpace(doc, 200)

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#000')
          .text(`Article ${i + 1} : ${a.nom}`, 40, doc.y)

        const safe = (value) =>
          typeof value === 'number' ? formatXOF(value) : 'N/A'

        const rows = [
          // ['Champ', 'Valeur'],
          /*['Code SH', a.codeSH ?? 'N/A'],
          ['Valeur XOF', safe(a.valeurCFA)],
          ['Total taxes', safe(a.taxes?.total)],*/
          ['Code SH', a.codeSH ?? 'N/A'],
          ['Valeur XOF', fmt3(a.valeurCFA)],
          ['Total taxes', fmt3(a.taxes?.total)],
          ['Devise', 'XOF'],
        ]

        // Transformer en colonnes
        const labels = rows.map((row) => row[0]) // Champ
        const values = rows.map((row) => row[1]) // Valeur

        const tableRows = [labels, values]

        const margin = 40
        const availableWidth = doc.page.width - margin * 2
        const colWidth = availableWidth / labels.length

        const columnWidths = new Array(labels.length).fill(colWidth)

        //drawTable(doc, 40, doc.y, rows, [250, 200], newPage)
        drawTable(doc, 40, doc.y, tableRows, columnWidths, newPage, {
          headerBackground: '#1A3C8E',
          headerTextColor: '#FFFFFF',
          alternateRowColor: '#EFE',
          rowTextColor: '#000000',
          prepareHeader: () => {
            doc.font('Helvetica-Bold').fontSize(10)
          },
          prepareRow: (row, i) => {
            if (i === 0) {
              doc.font('Helvetica-Bold').fontSize(9)
            } else {
              doc.font('Helvetica').fontSize(9)
            }
          },
        })

        doc.moveDown(1)

        const datas = [
          ['Droit de Douane', fmt3(a.taxes?.DD)],
          ['TVA', fmt3(a.taxes?.TVA)],
          ['PCS', fmt3(a.taxes?.PCS)],
          ['PC', fmt3(a.taxes?.PC)],
          ['PS', fmt3(a.taxes?.PS)],
          ['RAU', fmt3(a.taxes?.RAU)],
          ['RS', fmt3(a.taxes?.RS)],
          ['AIB', fmt3(a.taxes?.AIB)],
          ['Total', fmt3(a.taxes?.total)],
        ]

        // Transformer en colonnes
        const labels_ = datas.map((row) => row[0]) // Champ
        const values_ = datas.map((row) => row[1]) // Valeur

        const tableRows_ = [labels_, values_]

        const margin_ = 40
        const availableWidth_ = doc.page.width - margin_ * 2
        const colWidth_ = availableWidth_ / labels_.length

        const columnWidths_ = new Array(labels_.length).fill(colWidth_)

        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .text('Détail des taxes', 40, doc.y)

        drawTable(doc, 40, doc.y, tableRows_, columnWidths_, newPage, {
          headerBackground: '#1A3C8E',
          headerTextColor: '#FFFFFF',
          alternateRowColor: '#EFE',
          rowTextColor: '#000000',
          prepareHeader: () => {
            doc.font('Helvetica-Bold').fontSize(10)
          },
          prepareRow: (row, i) => {
            if (i === 0) {
              doc.font('Helvetica-Bold').fontSize(10)
            } else {
              doc.font('Helvetica').fontSize(10)
            }
          },
        })

        doc.moveDown(2)
      }

      // TOTAL GENERAL
      const totals = {
        totalTVA: articles.reduce((s, v) => s + Number(v.taxes?.TVA), 0),
        totalPCS: articles.reduce((s, v) => s + Number(v.taxes?.PCS), 0),
        totalPC: articles.reduce((s, v) => s + Number(v.taxes?.PC), 0),
        totalRAU: articles.reduce((s, v) => s + Number(v.taxes?.RAU), 0),
        totalRS: articles.reduce((s, v) => s + Number(v.taxes?.RS), 0),
        totalAIB: articles.reduce((s, v) => s + Number(v.taxes?.AIB), 0),
        totalTaxes: articles.reduce((s, v) => s + Number(v.taxes?.total), 0),
      }

      // TOTAL GÉNÉRAL
      ensureSpace(doc, 200)

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Total général des taxes', 40, doc.y)

      const totalDatas = [
        ['Total TVA', fmt3(totals.totalTVA)],
        ['Total PCS', fmt3(totals.totalPCS)],
        ['Total PC', fmt3(totals.totalPC)],
        ['Total RAU', fmt3(totals.totalRAU)],
        ['Total RS', fmt3(totals.totalRS)],
        ['Total AIB', fmt3(totals.totalAIB)],
        ['Total taxes globales', fmt3(totals.totalTaxes)],
      ]

      // Transformer en colonnes
      const totalLabels = totalDatas.map((row) => row[0])
      const totalValues = totalDatas.map((row) => row[1])

      const totalRows = [totalLabels, totalValues]

      const margin = 40
      const availableWidth = doc.page.width - margin * 2
      const colWidth = availableWidth / totalLabels.length
      const totalColumnWidths = new Array(totalLabels.length).fill(colWidth)

      drawTable(doc, 40, doc.y, totalRows, totalColumnWidths, newPage, {
        headerBackground: '#1A3C8E',
        headerTextColor: '#FFFFFF',
        alternateRowColor: '#EFE',
        rowTextColor: '#000000',
        prepareHeader: () => {
          doc.font('Helvetica-Bold').fontSize(10)
        },
        prepareRow: (row, i) => {
          if (i === 0) {
            doc.font('Helvetica-Bold').fontSize(10)
            doc.text('', { align: 'left' })
          } else {
            doc.font('Helvetica').fontSize(10)
            doc.text('', { align: 'left' })
          }
        },
      })

      doc.moveDown(1)

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
            width: usableWidth,
            align: 'justify',
          },
        )

      // -----------------------------------------------------
      // FOOTER FINAL
      // -----------------------------------------------------
      drawFooter(doc)
      doc.end()
    } catch (err) {
      reject(err)
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
      const doc = new PDFDocumentWithTables({ margin: 20 })
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
      let lastHeaderPage = 0 // ⭐ Suivi des pages
      const neededHeight = 260 // hauteur du bloc produit

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
        const refNumber = generateReference()

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
        return doc.page.height - 20 - doc.y - footerHeight
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

      for (let index = 0; index < vehicles.length; index++) {
        const vehicle = vehicles[index]
        const boxHeight = 260

        ensureSpace(doc, boxHeight)

        const boxTop = doc.y

        doc
          .lineWidth(1)
          .strokeColor('#1A3C8E')
          .rect(40, boxTop, 520, boxHeight)
          .stroke()

        let yText = boxTop + 10

        doc
          .fillColor('#1A3C8E')
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(`Véhicule ${index + 1} — ${vehicle.description}`, 50, yText, {
            width: 500,
            align: 'left',
            lineBreak: true,
          })

        doc.moveDown(3)

        yText += 28

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Marque : ${vehicle.marque}`, 50, yText, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Type : ${vehicle.type}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Année : ${vehicle.anneeFabrication}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Motorisation : ${vehicle.motorisation}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Description : ${vehicle.description}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Puissance Fiscal : ${vehicle.puissanceFiscal} cv`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Kilometrage : ${vehicle.kilometrage} km`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(
            `Dimensions : ${vehicle.longueurCm} x ${vehicle.largeurCm} x ${vehicle.hauteurCm}cm`,
            50,
            yText,
            {
              width: 400,
              align: 'left',
              lineBreak: true,
            },
          )

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Poids : ${vehicle.poidsKg} kg`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(`Quantité : ${vehicle.quantity}`, 50, yText, {
            width: 400,
            align: 'left',
            lineBreak: true,
          })

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(
            `Prix unitaire : ${vehicle.prix} ${vehicle.devise}`,
            50,
            yText,
            {
              width: 400,
              align: 'left',
              lineBreak: true,
            },
          )

        yText += 18

        doc
          .fillColor('#000')
          .font('Helvetica')
          .fontSize(11)
          .text(
            `Prix total : ${vehicle.prixTotal} ${vehicle.devise}`,
            50,
            yText,
            {
              width: 400,
              align: 'left',
              lineBreak: true,
            },
          )

        const file = photos.find((f) => f.fieldname === `photo_${index}`)

        if (file) {
          try {
            const pngBuffer = await sharp(file.buffer).rotate().png().toBuffer()
            // 40 → marge gauche du bloc, 520 → largeur totale du bloc produit, 180 → largeur maximale de l’image (fit: [180, 180])
            // 10 → marge droite interne
            const xImg = 40 + 520 - 180 - 10
            const yImg = boxTop + 70

            doc.image(pngBuffer, xImg, yImg, { fit: [180, 180] })
          } catch (err) {
            doc.fillColor('red').text(`Image illisible`, 350, boxTop + 20)
            doc.fillColor('black')
          }
        }
        doc.y = boxTop + boxHeight + 20
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
        ['Incoterm', 'Prix HT', 'Prix tranport', 'Assurance', 'CIF', 'Devise'],
        [
          shipping.incoterm,
          shipping.freeOnBoardFromOriginatePort,
          shipping.oceanFreight,
          shipping.insurance,
          shipping.totalOperatingCost,
          shipping.devise,
        ],
      ]

      const columnWidths = [90, 80, 90, 90, 120, 85] // total = 555
      /*drawTable(doc, 40, doc.y, rows, columnWidths, newPage, {
        prepareHeader: () => {
          doc.font('Helvetica-Bold').fontSize(10)
          doc.text('', { align: 'left' })
        },
        prepareRow: () => {
          doc.font('Helvetica').fontSize(10)
          doc.text('', { align: 'left' })
        },
      })*/

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

      for (let i = 0; i < avdData.length; i++) {
        const a = avdData[i]

        ensureSpace(doc, 200)

        const datas = [
          ['Droit de Douane', safe(a.DD)],
          ['TVA', safe(a.TVA)],
          ['Taxe statistique', safe(a.TSTAT)],
          ['Taux DD', a.tauxDD != null ? `${a.tauxDD}%` : 'N/A'],
          ['Timbre douanier (TD)', safe(a.TD)],
          ['Total taxes voiture', safe(a.totalTaxes)],
        ]

        // Transformer en colonnes
        const labels = datas.map((row) => row[0]) // Champ
        const values = datas.map((row) => row[1]) // Valeur

        const tableRows = [labels, values]

        const margin = 40
        const availableWidth = doc.page.width - margin * 2
        const colWidth = availableWidth / labels.length

        const columnWidths = new Array(labels.length).fill(colWidth)

        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#000')
          .text(`Détail des taxes voiture ${i + 1} : ${a.marque}`, 40, doc.y)

        drawTable(doc, 40, doc.y, tableRows, columnWidths, newPage, {
          headerBackground: '#1A3C8E',
          headerTextColor: '#FFFFFF',
          alternateRowColor: '#EFE',
          rowTextColor: '#000000',
          prepareHeader: () => {
            doc.font('Helvetica-Bold').fontSize(9)
          },
          prepareRow: (row, i) => {
            if (i === 0) {
              doc.font('Helvetica-Bold').fontSize(10)
              doc.text('', { align: 'left' })
            } else {
              doc.font('Helvetica').fontSize(10)
              doc.text('', { align: 'left' })
            }
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
        totalDD: avdData.reduce((s, v) => s + Number(v.DD), 0),
        totalTVA: avdData.reduce((s, v) => s + Number(v.TVA), 0),
        totalTSTAT: avdData.reduce((s, v) => s + Number(v.TSTAT), 0),
        totalTD: avdData.reduce((s, v) => s + Number(v.TD), 0),
        totalTaxes: avdData.reduce((s, v) => s + Number(v.totalTaxes), 0),
      }

      const totalDatas = [
        //['Total CIF', safe(totals.totalCIF)],
        ['Total DD', safe(totals.totalDD)],
        ['Total TVA', safe(totals.totalTVA)],
        ['Total Taxe statistique', safe(totals.totalTSTAT)],
        ['Total Timbre douanier (TD)', safe(totals.totalTD)],
        ['Total taxes globales', safe(totals.totalTaxes)],
      ]

      // Transformer en colonnes
      const totalLabels = totalDatas.map((row) => row[0])
      const totalValues = totalDatas.map((row) => row[1])

      const totalRows = [totalLabels, totalValues]

      const margin = 40
      const availableWidth = doc.page.width - margin * 2
      const colWidth = availableWidth / totalLabels.length
      const totalColumnWidths = new Array(totalLabels.length).fill(colWidth)

      drawTable(doc, 40, doc.y, totalRows, totalColumnWidths, newPage, {
        headerBackground: '#1A3C8E',
        headerTextColor: '#FFFFFF',
        alternateRowColor: '#EFE',
        rowTextColor: '#000000',
        prepareHeader: () => {
          doc.font('Helvetica-Bold').fontSize(9)
        },
        prepareRow: (row, i) => {
          if (i === 0) {
            doc.font('Helvetica-Bold').fontSize(10)
            doc.text('', { align: 'left' })
          } else {
            doc.font('Helvetica').fontSize(10)
            doc.text('', { align: 'left' })
          }
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
            width: usableWidth,
            align: 'justify',
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
