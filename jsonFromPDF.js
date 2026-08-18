import fs from 'node:fs'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Convertit un code "NNNN.NN.NN.NN" en entier
function codeToInt(code) {
  return parseInt(code.replace(/\./g, ''), 10)
}

// Convertit un entier en code formaté "NNNN.NN.NN.NN"
function intToCode(n) {
  const s = n.toString().padStart(12, '0')
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}.${s.slice(8, 10)}`
}

// Génère les entrées
function generateEntries({ startCode, count, baseLabel, suffixLabel }) {
  const taux = {
    tauxDD: 20,
    tauxTVA: 18,
    tauxPCS: 0.8,
    tauxPC: 0.5,
    tauxPS: 0.2,
    tauxRAU: 0.5,
    tauxRS: 1,
    tauxAIB: 1,
  }

  const startInt = codeToInt(startCode)
  const entries = []

  for (let i = 0; i < count; i++) {
    const code = intToCode(startInt + i)

    entries.push({
      code,
      description: `${baseLabel} — ${suffixLabel} ${i + 1}`,
      ...taux,
    })
  }

  return entries
}

// Extraction des paramètres depuis le texte PDF
function extractConfig(text) {
  const results = []

  // Trouver tous les codes SH dans le texte
  const regex = /(\d{4}\.\d{2}\.\d{2}\.\d{2})/g
  const matches = [...text.matchAll(regex)]

  for (let i = 0; i < matches.length; i++) {
    const code = matches[i][1]

    const startIndex = matches[i].index
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : text.length

    // Texte brut entre deux codes SH
    const raw = text.substring(startIndex + code.length, endIndex).trim()

    // Extraire les taux réels : kg <tauxDD> <tauxRS>
    const tauxMatch = raw.match(/kg\s+(\d+)\s+(\d+)/)

    let tauxDD = 20
    let tauxRS = 1

    if (tauxMatch) {
      tauxDD = parseInt(tauxMatch[1], 10)
      tauxRS = parseInt(tauxMatch[2], 10)
    }

    // Nettoyage de la description
    const description = raw
      .replace(/kg\s+\d+\s+\d+/g, '') // supprime "kg 20 1"
      .replace(/\d{4}\.\d{2}\.\d{2}\.\d{2}/g, '') // supprime les codes suivants
      .replace(/\s{2,}/g, ' ') // supprime espaces multiples
      .replace(/^-/, '') // supprime tiret initial
      .trim()

    results.push({
      code,
      description,
      tauxDD,
      tauxTVA: 18,
      tauxPCS: 0.8,
      tauxPC: 0.5,
      tauxPS: 0.2,
      tauxRAU: 0.5,
      tauxRS,
      tauxAIB: 1,
    })
  }

  return results
}

// Lecture du PDF avec pdfjs-dist
async function extractTextFromPDF(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdf = await pdfjsLib.getDocument({ data }).promise

  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items.map((item) => item.str)
    fullText += strings.join(' ') + '\n'
  }

  return fullText
}

// MAIN
const inputFile = process.argv[2]

if (!inputFile) {
  console.error('Usage: node jsonFromPDF.js <input.pdf>')
  process.exit(1)
}

const text = await extractTextFromPDF(inputFile)
//console.log(text)
const config = extractConfig(text)

const allEntries = extractConfig(text)

// Supprimer les doublons par code SH
const uniqueEntries = Object.values(
  allEntries.reduce((acc, item) => {
    acc[item.code] = item // remplace automatiquement les doublons
    return acc
  }, {}),
)

fs.writeFileSync('output.json', JSON.stringify(uniqueEntries, null, 2))

console.log('✔ Génération terminée. Résultat dans output.json')
