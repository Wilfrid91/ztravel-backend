import jaroWinkler from 'jaro-winkler'
import { PDFDocument as PDFLibDocument } from 'pdf-lib'
import { PassThrough } from 'stream'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PDFDocumentWithTables } = require('pdfkit-table') // Classe étendue de pdfkit

import sharp from 'sharp'
import removeAccents from 'remove-accents'
import { loadCodeSHCache } from './loadCodeSHCache.js'

// Elle supprime les mots grammaticaux inutiles
const STOPWORDS = [
  'de',
  'du',
  'la',
  'le',
  'les',
  'des',
  'en',
  'pour',
  'avec',
  'sans',
  'au',
  'aux',
  'd',
  'l',
  'un',
  'une',
  'et',
  'ou',
  'article',
  'articles',
  'autre',
  'autres',
]

/**
 * Cette version supprime les doublons : si « aluminium » apparaît plusieurs fois dans la description, il ne sera conservé qu'une seule fois dans la liste des mots-clés
 */
function extractKeywords(text) {
  return [
    ...new Set(
      normalize(text)
        .split(' ')
        .map((w) => w.replace(/[^a-z0-9]/g, ''))
        .filter((w) => w.length > 2 && !STOPWORDS.includes(w)),
    ),
  ]
}

export const generateMchtAndCustCopy = (transaction, type, qrcode) => {
  return new Promise((resolve, reject) => {
    try {
      const now = new Date()
      //const doc = new PDFDocument()
      const doc = new PDFDocumentWithTables()
      const stream = new PassThrough()
      const chunks = []

      doc.pipe(stream)

      stream.on('data', (chunk) => chunks.push(chunk))
      // le buffer final n’est renvoyé que quand le stream émet end.
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)

      // HEADER LOGO
      //doc.fontSize(20).text('LOGO ICI', { align: 'center' })
      doc.image('assets/logo.png', 40, 20, { width: 70 })
      doc.moveDown(1)

      // INFOS MARCHAND
      //doc.fontSize(14).text('Zinsou Travel Consulting SRL', { align: 'center' })
      doc
        .fontSize(10)
        .text('6 cours de la marne, 33800 Bordeaux', { align: 'center' })
      doc.text('+33 0559040100', { align: 'center' })
      doc.text('Numéro IFU: 06466570485', { align: 'center' })
      doc.text(`Date: ${now.toLocaleDateString()}`, { align: 'center' })
      doc.text(`Heure: ${now.toLocaleTimeString()}`, { align: 'center' })
      doc.moveDown(2)

      doc
        .fontSize(14)
        .text(type === 'client' ? 'RECU CLIENT' : 'RECU MARCHAND', {
          align: 'center',
        })
      doc.moveDown(2)

      // INFOS CLIENT

      // --- MARGES (UNE SEULE FOIS) ---
      const leftMargin = doc.page.margins?.left ?? 72
      const rightMargin = doc.page.margins?.right ?? 72
      const pageWidth = doc.page.width - leftMargin - rightMargin

      // --- TABLEAU PRODUIT ---
      doc.fontSize(12)

      const startX = leftMargin
      let currentY = doc.y

      const colItem = startX
      const colQty = startX + 80
      const colPrix = startX + 140
      const colTva = startX + 200
      const colMontant = startX + 260

      doc.text('Item', colItem, currentY)
      doc.text('Qty', colQty, currentY)
      doc.text('Prix', colPrix, currentY)
      doc.text('TVA', colTva, currentY)
      doc.text('Montant XOF', colMontant, currentY)

      // --- TRAIT SOUS LES EN-TÊTES ---
      const lineY = currentY + 15
      doc
        .moveTo(leftMargin, lineY)
        .lineTo(leftMargin + pageWidth, lineY)
        .stroke()

      currentY = lineY + 10

      //currentY += 20

      doc.text('100', colItem, currentY)
      doc.text('1', colQty, currentY)
      doc.text(transaction.amount.toFixed(2), colPrix, currentY)
      doc.text('18%', colTva, currentY)
      doc.text((transaction.amount * 0.18).toFixed(2), colMontant, currentY)

      doc.moveDown(2)

      // --- TOTAL À PAYER ---
      const totalLabel = 'Total à payer:'
      const totalAmount = `${transaction.amount.toFixed(2)} XOF`
      const totalWidth = doc.widthOfString(totalAmount)

      // --- PAYÉ PAR ---
      const psp = `${transaction.method}`

      let y = doc.y

      // --- TOTAL À PAYER ---
      doc.text(totalLabel, leftMargin, y)
      doc.text(totalAmount, leftMargin + pageWidth - totalWidth, y)

      doc.moveDown(2)

      // --- PAYÉ PAR ---
      doc.text('Payé par :', leftMargin)
      doc.moveDown(1)

      // --- PSP + MONTANT ---
      y = doc.y
      doc.text(psp, leftMargin, y)
      doc.text(totalAmount, leftMargin + pageWidth - totalWidth, y)

      doc.moveDown(2)

      // --- IDENTIFIANT CLIENT MTN MOMO ---
      const idLabel = 'Identifiant client MTN MOMO:'
      const idValue = transaction.financialTransactionId ?? ''
      const idWidth = doc.widthOfString(idValue)

      y = doc.y
      doc.text(idLabel, leftMargin, y)
      doc.text(idValue, leftMargin + pageWidth - idWidth, y)

      doc.moveDown(2)

      // --- TYPE ---
      y = doc.y

      const typeLabel = 'Type'
      const typeValue = 'BIENS & SERVICES'
      const typeWidth = doc.widthOfString(typeValue)

      doc.text(typeLabel + ':', leftMargin, y)
      doc.text(typeValue, leftMargin + pageWidth - typeWidth, y)

      doc.moveDown(2)

      // IMPORTANT : réinitialiser X
      doc.x = leftMargin

      // --- STATUT ---
      doc
        .fontSize(12)
        .text('PAIEMENT ACCEPTE', { align: 'center', underline: true })
      doc.moveDown(2)

      // --- DESCRIPTION ---
      doc.text(
        'Achat d’un pack de 3 jetons destinés à la génération d’attestations de vérification documentaire (AVD) sur zTravel Consulting ©. Scannez ce reçu pour en vérifier l’authenticité.',
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
        return
      }

      doc.image(qrcode, qrX, doc.y, {
        width: qrSize,
        height: qrSize,
      })

      // --- SECTION MARCHAND ---
      if (type === 'marchand') {
        doc.fontSize(14).text('RECU MARCHAND', { align: 'center' })
        doc.moveDown(1)

        doc.fontSize(12).text(`Date: ${now.toLocaleDateString()}`)
        doc.text(`Time: ${now.toLocaleTimeString()}`)
        doc.text(`Wallet: ${transaction.phone}`)
        doc.text(`Wallet type: MSISDN`)
        doc.text(`Auth. code: 123456`)
        doc.text(`External ID: ${transaction.externalId}`)
        doc.text(
          `Financial Transaction ID: ${transaction.financialTransactionId}`,
        )
        doc.text(`payerMessage: ${transaction.rawResponse?.payerMessage}`)
        doc.text(`payeeNote: ${transaction.rawResponse?.payeeNote}`)
        doc.text(`Reference: ${transaction.referenceId}`)
        doc.text(`Type: BIENS & SERVICES`)
        doc.moveDown(1)

        doc.fontSize(16).text(`TOTAL XOF ${transaction.amount.toFixed(2)}`, {
          align: 'center',
        })
        doc.fontSize(18).text('APPROVED', { align: 'center', underline: true })
        doc.moveDown(2)

        doc
          .fontSize(10)
          .text(
            "Achat d'un forfait de 6 mois pour la génération d'attestation de vérification documentaire (AVD) sur zTravel Consulting ©. Scannez ce reçu pour en vérifier l’authenticité.",
            { align: 'center' },
          )
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

function computeCIF(shipping) {
  const fob = Number(shipping.freeOnBoardFromOriginatePort) || 0
  const other = Number(shipping.otherCharges) || 0
  const freight = Number(shipping.oceanFreight) || 0
  const insurance = Number(shipping.insurance) || 0

  switch (shipping.incoterm.toUpperCase()) {
    case 'EXW':
      return fob + other + freight + insurance
    case 'FOB':
    case 'CFR':
    case 'CIF':
      return fob + freight + insurance
    default:
      throw new Error('Incoterm non supporté')
  }
}

function computeCurrency(shipping) {
  switch (shipping.devise) {
    case 'EUR':
      return 656
    case 'USD':
      return 550
    case 'GBP':
      return 751
    case 'CAD':
      return 408.5
    case 'CHF':
      return 710.76
    case 'XOF':
    case 'XAF':
      return 1
    default:
      throw new Error('Devise non supportée')
  }
}

/*
1. Le moteur de matching intelligent (backend)
🔧 A. Normalisation du texte
*/
// Normalisation propre
function normalize(text) {
  return removeAccents(text.toLowerCase())
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/*Similarité Jaro‑Winkler (version simple)*/
// Scoring Jaro-Winkler
// Scoring Jaro-Winkler
/*
function computeScore(productDescription, codeDescription) {
  if (!productDescription || !codeDescription) return
  const pWords = extractKeywords(productDescription)
  const dWords = extractKeywords(codeDescription)

  let score = 0

  for (const w1 of pWords) {
    for (const w2 of dWords) {
      const s = jaroWinkler(w1, w2)

      if (s >= 0.9) score += 5
      else if (s >= 0.8) score += 3
      else if (s >= 0.7) score += 1
    }
  }

  return score
}*/

function computeScore(productDescription, codeDescription) {
  if (!productDescription || !codeDescription) return 0

  const pWords = extractKeywords(productDescription)
  const dWords = extractKeywords(codeDescription)

  let score = 0
  const matchedWords = new Set()

  for (const w1 of pWords) {
    let bestMatch = 0

    for (const w2 of dWords) {
      const similarity = jaroWinkler(w1, w2)
      bestMatch = Math.max(bestMatch, similarity)
    }

    if (bestMatch >= 0.9) {
      score += 5
      matchedWords.add(w1)
    } else if (bestMatch >= 0.8) {
      score += 3
      matchedWords.add(w1)
    } else if (bestMatch >= 0.7) {
      score += 1
      matchedWords.add(w1)
    }
  }

  return score
}

/*
export const findBestCodeSH = async (productDescription) => {
  const keywords = extractKeywords(productDescription)
  if (keywords.length === 0) return null

  const main = keywords[0]

  // Charger le cache
  const cache = await loadCodeSHCache()

  console.log('Nombre de codes SH :', cache.length)

  console.log('Exemples de codes SH :', cache.slice(0, 10))

  console.log(
    "Codes concernant l'aluminium :",
    cache.filter((item) =>
      /aluminium|aluminum|tubes et tuyaux/i.test(item.description || ''),
    ),
  )

  // Récupérer les synonymes si disponibles
  const searchTerms = SYNONYMS[main] || [main]

  let candidates = []

  // 1. Match principal (singulier/pluriel)
  candidates = cache.filter((c) =>
    searchTerms.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(c.description)),
  )

  console.log('Candidats match principal:', candidates.length)

  // 2. Match par mots clés (OR)
  if (candidates.length === 0) {
    console.log(`Aucun match direct pour "${main}", recherche par mots clés...`)

    candidates = cache.filter((c) =>
      keywords.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(c.description)),
    )
  }

  // 3. Aucun match → stop
  if (candidates.length === 0) {
    console.log(`Aucun match même par mots clés pour "${productDescription}"`)
    return null
  }

  console.log(`Nombre de candidats trouvés: ${candidates.length}`)

  // 4. Scoring
  const scored = candidates.map((c) => ({
    ...c,
    score: computeScore(productDescription, c.description),
  }))

  // 5. Meilleur score
  const best = scored.sort((a, b) => b.score - a.score)[0]

  console.log(
    `Meilleur candidat: ${best.code} (${best.description}) - Score: ${best.score}`,
  )

  // 6. Seuil de confiance
  if (!best || best.score < 2) return null

  return best
}*/

export const findBestCodeSH = async (productDescription) => {
  if (!productDescription?.trim()) return null

  const normalize = (value = '') =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const description = normalize(productDescription)
  const keywords = extractKeywords(productDescription)

  if (!keywords.length) return null

  const cache = await loadCodeSHCache()

  console.log('Nombre de codes SH :', cache.length)

  console.log('Exemples de codes SH :', cache.slice(0, 10))

  console.log(
    "Codes concernant l'aluminium :",
    cache.filter((item) =>
      /aluminium|aluminum|tubes et tuyaux/i.test(item.description || ''),
    ),
  )

  if (!Array.isArray(cache) || cache.length === 0) {
    return null
  }

  // Recherche sur l'ensemble du cache, pas seulement
  // sur le premier mot extrait.
  const scored = cache
    .map((item) => {
      const candidateDescription = normalize(item.description)

      const score = computeScore(description, candidateDescription)

      // Bonus de cohérence pour les termes importants.
      const keywordMatches = keywords.filter((keyword) =>
        candidateDescription.includes(normalize(keyword)),
      ).length

      return {
        ...item,
        score: score + keywordMatches,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  const best = scored[0]
  const second = scored[1]

  console.log(
    'Meilleurs candidats SH :',
    scored.slice(0, 5).map(({ code, description, score }) => ({
      code,
      description,
      score,
    })),
  )

  // Seuil provisoire : à calibrer sur des cas vérifiés.
  if (best.score < 2) return null

  // Ne pas prétendre avoir trouvé un code fiable
  // lorsque plusieurs candidats sont trop proches.
  if (second && best.score - second.score < 2) {
    return {
      ...best,
      needsReview: true,
      candidates: scored.slice(0, 5),
    }
  }

  return {
    ...best,
    needsReview: true,
    candidates: scored.slice(0, 5),
  }
}

/*
function normalizeText(text) {
  return removeAccents(text.toLowerCase())
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.includes(w))
}

function levenshtein(a, b) {
  if (!a || !b) return 999

  const matrix = []

  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1,
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

export const findBestCodeSH = async (productDescription) => {
  console.log('🔍 Produit :', productDescription)

  const keywords = normalizeText(productDescription)

  const allCodes = await CodeSH.find({})
  console.log('📦 Codes SH trouvés :', allCodes.length)

  const scored = allCodes.map((code) => {
    const descWords = normalizeText(code.description)

    let score = 0

    for (const word of keywords) {
      if (descWords.includes(word)) {
        score += 2
      } else {
        for (const d of descWords) {
          if (levenshtein(word, d) <= 2) {
            score += 1
            break
          }
        }
      }
    }

    return { ...code._doc, score }
  })

  const best = scored.sort((a, b) => b.score - a.score)[0]
  console.log('🏆 Best match :', best)

  if (!best || best.score < 2) return null

  return best
}
*/
function computeArticleTaxes(productValueCFA, codeSH) {
  const {
    tauxPCS,
    tauxPC,
    tauxPS,
    tauxDD,
    tauxRAU,
    tauxTVA,
    tauxAIB,
    tauxRS,
    //tauxDA,
  } = codeSH
  // toFixed(3) => 3  chiffres rrondi après la virgule
  // +(...) => Puis converti en nombre
  const PCS = productValueCFA * (tauxPCS / 100)
  const PC = productValueCFA * (tauxPC / 100)
  const PS = productValueCFA * (tauxPS / 100)
  const DD = productValueCFA * (tauxDD / 100)
  const RAU = productValueCFA * (tauxRAU / 100)
  const AIB = productValueCFA * (tauxAIB / 100)
  const RS = productValueCFA * (tauxRS / 100)
  //const DA = productValueCFA * (tauxDA / 100)

  // TVA = (Valeur + DD + RAU) * TVA%
  const TVA = (productValueCFA + DD + RAU) * (tauxTVA / 100)

  const total = PCS + PC + PS + DD + RAU + TVA + AIB + RS //+ DA

  return {
    PCS,
    PC,
    PS,
    DD,
    RAU,
    TVA,
    AIB,
    RS,
    //DA,
    total,
  }
}

/**
 * Fonction métier : computeAVD()
 * Elle ne génère pas de PDF.
 * Elle retourne les données enrichies.
 */
export const computeAVD = async (products, shipping) => {
  // Total en devise d'origine
  const totalDevise = products.reduce((s, p) => s + Number(p.prixTotal), 0)

  // CIF en devise
  // Étape 1 — Calcul du CIF => CIF= Valeur FOB + Fret + Assurance
  const cifDevise = computeCIF(shipping)

  // Taux de change
  const exchangeRate = computeCurrency(shipping)

  // CIF en CFA
  const cifCFA = cifDevise * exchangeRate

  let totalContainer = 0
  const enrichedArticles = []

  for (const product of products) {
    const valeurDevise = Number(product.prixTotal)

    // Part du produit dans le conteneur
    const partCFA = (valeurDevise / totalDevise) * cifCFA
    const bestCode = await findBestCodeSH(product.description)
    console.log(bestCode)

    if (!bestCode) {
      enrichedArticles.push({
        ...product,
        valeurCFA: partCFA,
        codeSH: 'N/A',
        taxes: null,
        error: 'Code SH introuvable',
      })
      continue
    }

    const taxes = computeArticleTaxes(partCFA, bestCode)

    enrichedArticles.push({
      ...product,
      valeurCFA: partCFA,
      codeSH: bestCode.code,
      taxes,
      score: bestCode.score,
    })

    totalContainer += taxes.total
  }

  return { cifCFA, articles: enrichedArticles, totalContainer }
}

function computeCIFVehicle(shipping) {
  const fob = Number(shipping.freeOnBoardFromOriginatePort_) || 0
  const other = Number(shipping.otherCharges) || 0
  const freight = Number(shipping.oceanFreight) || 0
  const insurance = Number(shipping.insurance) || 0

  switch (shipping.incoterm.toUpperCase()) {
    case 'EXW':
      return fob + other + freight + insurance
    case 'FOB':
    case 'CFR':
    case 'CIF':
      return fob + freight + insurance
    default:
      throw new Error('Incoterm non supporté')
  }
}

/**
 * Boolen return true or false
 * @param {*} vehicle
 * @returns
 */
function isVehicleNew(vehicle) {
  const currentYear = new Date().getFullYear()
  const age = currentYear - Number(vehicle.anneeFabrication)
  const km = Number(vehicle.kilometrage)

  return age <= 1 && km <= 6000
}

function getTauxDD(vehicle) {
  return isVehicleNew(vehicle) ? 5 : 20
}

export const computeAvdVehicle = async (vehicles, shipping) => {
  // Total en devise d'origine
  const totalDevise = vehicles.reduce((s, v) => s + Number(v.prixTotal), 0)
  // CIF en devise
  // Étape 1 — Calcul du CIF => CIF= Valeur FOB + Fret + Assurance
  const cifDevise = computeCIFVehicle(shipping)
  console.log('computeCIFVehicle(shipping) =', cifDevise)

  // Taux de change
  const exchangeRate = computeCurrency(shipping)
  // CIF en CFA
  const cifCFA = cifDevise * exchangeRate

  return vehicles.map((v) => {
    // CIF individuel (répartition simple)
    const CIF = Number(v.prixTotal) + cifCFA / vehicles.length

    // DD
    const tauxDD = getTauxDD(v)
    const DD = CIF * (tauxDD / 100)

    // TVA (uniquement occasion)
    const TVA = isVehicleNew(v) ? 0 : (CIF + DD) * 0.18

    // TSTAT = 1%
    const TSTAT = CIF * 0.01

    // TD = 0.5%  (ATTENTION : tu avais mis 0.05 = 5%)
    const TD = CIF * 0.005

    // Total taxes
    const totalTaxes = isVehicleNew(v) ? DD + TSTAT + TD : DD + TVA + TSTAT + TD

    // retourne un tableau d'objets
    return {
      ...v,
      CIF,
      tauxDD,
      DD,
      TVA,
      TSTAT,
      TD,
      totalTaxes,
      isNew: isVehicleNew(v),
    }
  })
}
