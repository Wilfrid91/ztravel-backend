import fs from 'node:fs'
import path from 'node:path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const OUTPUT_FILE = 'output.json'
const ERRORS_FILE = 'extraction-errors.json'

const DEFAULT_TAXES = {
  tauxTVA: 18,
  tauxPCS: 0.8,
  tauxPC: 0.5,
  tauxPS: 0.2,
  tauxRAU: 0.5,
  tauxAIB: 1,
}

// Unités susceptibles d'apparaître avant les colonnes DD et RS.
const UNIT_PATTERN = String.raw`(?:1000u|kg|m²|m2|m³|m3|hl|kwh|ctm|u|l|m|t)`

// Extrait les lignes en utilisant les coordonnées des éléments PDF.
function groupItemsIntoLines(items) {
  const textItems = items
    .filter(
      (item) =>
        typeof item.str === 'string' &&
        item.str.trim() &&
        Array.isArray(item.transform),
    )
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const lines = []

  for (const item of textItems) {
    let line = lines.at(-1)

    // Regrouper les éléments placés sur la même ligne visuelle.
    if (!line || Math.abs(line.y - item.y) > 2.5) {
      line = { y: item.y, items: [] }
      lines.push(line)
    }

    line.items.push(item)
  }

  return lines
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

/* Lecture du PDF : une liste de lignes par page.
async function extractTextFromPDF(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`)
  }

  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    pages.push({
      lines: groupItemsIntoLines(content.items),
      items: content.items,
    })
  }

  return pages
}*/

async function extractTextFromPDF(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`)
  }

  // 1. PDF.js : conserver les coordonnées pour lire les colonnes DD et RS.
  const data = new Uint8Array(fs.readFileSync(filePath))
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pdfjsPages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    pdfjsPages.push(content.items)
  }

  // 2. Poppler : récupérer un texte Unicode correctement décodé.
  let extractedText

  try {
    const result = await execFileAsync(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', filePath, '-'],
      {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      },
    )

    extractedText = result.stdout
  } catch (error) {
    throw new Error(
      `Impossible d'exécuter pdftotext. Vérifie son installation et le PATH. ${error.message}`,
    )
  }

  // Le caractère form-feed (\f) sépare normalement les pages.
  const textPages = extractedText.split('\f')

  // 3. Conserver les deux sources :
  //    - lignes Poppler pour les descriptions ;
  //    - éléments PDF.js pour les coordonnées des taux.
  return Array.from({ length: pdf.numPages }, (_, index) => ({
    items: pdfjsPages[index] ?? [],

    lines: (textPages[index] ?? '')
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line) => line.trim()),
  }))
}

// Nettoyage générique des espaces et de la ponctuation finale.
function normalizeLabel(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.]+/, '')
    .replace(/[\s:;]+$/, '')
    .trim()
}

// Extrait les taux lorsqu'une séquence unité / DD / RS est identifiable.
function extractRates(raw) {
  const regex = new RegExp(
    String.raw`\b${UNIT_PATTERN}\s+(\d+(?:[,.]\d+)?)\s+(\d+(?:[,.]\d+)?)\b`,
    'i',
  )

  const match = raw.match(regex)

  if (!match) {
    return {
      tauxDD: null,
      tauxRS: null,
    }
  }

  return {
    tauxDD: Number(match[1].replace(',', '.')),
    tauxRS: Number(match[2].replace(',', '.')),
  }
}

// Ne conserver que le libellé propre à la ligne du code SH.
function cleanTerminalLabel(raw) {
  const rateSuffix = new RegExp(
    String.raw`\s+\b${UNIT_PATTERN}\s+\d+(?:[,.]\d+)?\s+\d+(?:[,.]\d+)?\b[\s\S]*$`,
    'i',
  )

  return normalizeLabel(
    raw
      .replace(rateSuffix, '')
      .replace(/\b\d{4}\.\d{2}\.\d{2}\.\d{2}\b/g, ' ')
      .replace(/^[\s\-–—]+/, ''),
  )
}

// Compose la désignation complète sans répéter inutilement le dernier terme.
function buildDescription(positionTitle, branches, libelle) {
  const parts = [positionTitle, ...branches]
    .map((part) => normalizeLabel(part || ''))
    .filter(Boolean)

  const lastPart = parts.at(-1)

  if (
    libelle &&
    (!lastPart ||
      lastPart.toLocaleLowerCase('fr-FR') !==
        libelle.toLocaleLowerCase('fr-FR'))
  ) {
    parts.push(libelle)
  }

  return parts.join(' — ') || libelle
}

// Extraction hiérarchique.
function extractConfig(pages) {
  const taxColumns = getTaxColumnPositions(pages)
  const entries = []
  const errors = []

  const codeRegex = /\b\d{4}\.\d{2}\.\d{2}\.\d{2}\b/
  const positionRegex = /^\s*(\d{2}\.\d{2})(?=\s|$)/
  const branchRegex = /^\s*(-{1,4})\s+(.*?)\s*$/

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]
    const lines = page.lines
    const pageItems = page.items

    // ADDED
    const tariffCodeItems = pageItems
      .filter(
        (item) =>
          /^\d{4}\.\d{2}\.\d{2}\.\d{2}$/.test(item.str?.trim() ?? '') &&
          item.transform,
      )
      .sort((a, b) => b.transform[5] - a.transform[5])

    let positionTitle = ''
    let branches = []
    let collectingPositionTitle = false
    let pendingEntry = null

    // Finaliser le code courant avant de changer de rubrique ou de page.
    function flushPending() {
      if (!pendingEntry) return

      const { code, raw, position, branchPath, pageNumber } = pendingEntry

      const libelle = cleanTerminalLabel(raw)

      const tauxDD = findRateInColumn(
        pageItems,
        taxColumns.ddX,
        pendingEntry.codeY,
        pendingEntry.nextCodeY,
        'DD',
      )

      const tauxRS = findRateInColumn(
        pageItems,
        taxColumns.rsX,
        pendingEntry.codeY,
        pendingEntry.nextCodeY,
        'RS',
      )

      const rates = { tauxDD, tauxRS }

      if (!libelle) {
        errors.push({
          page: pageNumber,
          code,
          reason: 'Libellé vide après nettoyage',
          raw,
        })
        pendingEntry = null
        return
      }

      if (rates.tauxDD === null || rates.tauxRS === null) {
        errors.push({
          page: pageNumber,
          code,
          reason: 'Taux DD ou RS non détecté',
          raw,
        })
      }

      entries.push({
        code,
        description: buildDescription(position, branchPath, libelle),
        libelle,
        tauxDD: rates.tauxDD,
        ...DEFAULT_TAXES,
        tauxRS: rates.tauxRS,
      })

      pendingEntry = null
    }

    for (const line of lines) {
      const codeMatch = line.match(codeRegex)
      const positionMatch = line.match(positionRegex)

      // Nouveau titre de position : par exemple 76.07 ou 76.08.
      if (positionMatch) {
        flushPending()

        const headingStart = line.indexOf(positionMatch[1])
        const headingEnd = headingStart + positionMatch[1].length

        positionTitle = line
          .slice(headingEnd, codeMatch ? codeMatch.index : line.length)
          .trim()

        branches = []
        collectingPositionTitle = !codeMatch && Boolean(positionTitle)

        // Le titre de position peut partager sa ligne avec un code.
        if (!codeMatch) continue
      }

      // Sous-rubrique sans code : "- Sur support :", "-- Autres :", etc.
      const branchMatch = line.match(branchRegex)

      if (!codeMatch && branchMatch) {
        flushPending()

        const depth = branchMatch[1].length
        const label = normalizeLabel(branchMatch[2].replace(/:\s*$/, ''))

        // Remplacer la branche au même niveau et ses niveaux descendants.
        branches = branches.slice(0, depth - 1)
        branches[depth - 1] = label

        collectingPositionTitle = false
        continue
      }

      // Ligne de code tarifaire.
      if (codeMatch) {
        flushPending()

        const code = codeMatch[0]
        const suffix = line.slice(codeMatch.index + code.length).trim()

        const codeItem = tariffCodeItems.find(
          (item) => item.str.trim() === code,
        )

        const codeY = codeItem?.transform?.[5] ?? null

        const nextCodeItem =
          codeY === null
            ? null
            : tariffCodeItems.find((item) => item.transform[5] < codeY - 1)

        const nextCodeY = nextCodeItem?.transform?.[5] ?? 0

        pendingEntry = {
          code,
          raw: suffix,
          position: positionTitle,
          branchPath: [...branches],
          pageNumber: pageIndex + 1,
          codeY,
          nextCodeY,
        }

        collectingPositionTitle = false
        continue
      }

      // Le titre de position est parfois réparti sur plusieurs lignes.
      if (collectingPositionTitle) {
        positionTitle = normalizeLabel(`${positionTitle} ${line}`)
        continue
      }

      // Une désignation tarifaire peut elle-même continuer sur la ligne
      // suivante. Accumuler le texte jusqu'au prochain code ou titre.
      if (pendingEntry) {
        pendingEntry.raw += ` ${line}`
      }
    }

    // Ne jamais laisser un code absorber du texte de la page suivante.
    flushPending()
  }

  return { entries, errors }
}

// Déduplication et détection des doublons divergents.
function deduplicateEntries(entries) {
  const byCode = new Map()
  const duplicates = []

  for (const entry of entries) {
    const existing = byCode.get(entry.code)

    if (!existing) {
      byCode.set(entry.code, entry)
      continue
    }

    if (JSON.stringify(existing) !== JSON.stringify(entry)) {
      duplicates.push({
        code: entry.code,
        first: existing,
        duplicate: entry,
      })
    }
  }

  return {
    entries: [...byCode.values()],
    duplicates,
  }
}

function getItemCenterX(item) {
  return item.transform[4] + (item.width || 0) / 2
}

function getTaxColumnPositions(pages) {
  const items = pages.flatMap((page) => page.items)

  const ddHeader = items.find((item) => item.str?.trim() === 'D.D.')

  const rsHeader = items.find((item) => item.str?.trim() === 'R.S.')

  if (!ddHeader || !rsHeader) {
    throw new Error('Colonnes D.D. et R.S. introuvables dans le PDF.')
  }

  return {
    ddX: getItemCenterX(ddHeader),
    rsX: getItemCenterX(rsHeader),
  }
}

function findRateInColumn(items, columnX, codeY, nextCodeY, columnName = 'DD') {
  if (!Number.isFinite(codeY)) {
    return null
  }

  // Les coordonnées PDF diminuent généralement de haut en bas.
  // Le taux est recherché dans la zone du code courant.
  const lowerBound = Number.isFinite(nextCodeY) ? nextCodeY : 0

  const candidates = []

  for (const item of items) {
    if (!item.transform) continue

    const originalText = item.str?.trim() ?? ''

    // Certains chiffres 1 de la colonne RS sont extraits comme "l".
    const text =
      columnName === 'RS' && /^[lI|]$/.test(originalText) ? '1' : originalText

    if (!/^\d+(?:[,.]\d+)?$/.test(text)) {
      continue
    }

    const x = getItemCenterX(item)
    const y = item.transform[5]

    // Vérifier la colonne tarifaire.
    if (Math.abs(x - columnX) > 18) {
      continue
    }

    // Garder les nombres appartenant à la zone du code courant.
    if (y > codeY + 5 || y <= lowerBound + 1) {
      continue
    }

    candidates.push({
      value: Number(text.replace(',', '.')),
      distance: Math.abs(y - codeY),
    })
  }

  candidates.sort((a, b) => a.distance - b.distance)

  return candidates[0]?.value ?? null
}

// MAIN
async function main() {
  const inputFile = process.argv[2]

  if (!inputFile) {
    console.error('Usage : node jsonFromPDF.js <input.pdf>')
    process.exitCode = 1
    return
  }

  try {
    const pages = await extractTextFromPDF(path.resolve(inputFile))
    const { entries, errors } = extractConfig(pages)
    const { entries: uniqueEntries, duplicates } = deduplicateEntries(entries)

    // Ne retient que les éléments PDF correspondant exactement à un code complet
    const sourceCodes = new Set(
      pages.flatMap((page) =>
        page.items
          .map((item) => item.str?.trim() ?? '')
          .filter((text) => /^\d{4}\.\d{2}\.\d{2}\.\d{2}$/.test(text)),
      ),
    )

    const outputCodes = new Set(uniqueEntries.map((entry) => entry.code))

    const missingCodes = [...sourceCodes].filter(
      (code) => !outputCodes.has(code),
    )

    console.log('\n--- Vérification des codes ---')
    console.log(`Codes tarifaires détectés : ${sourceCodes.size}`)
    console.log(`Codes dans le JSON : ${outputCodes.size}`)
    console.log(`Codes manquants : ${missingCodes.length}`)

    if (missingCodes.length > 0) {
      console.log('Codes manquants :', missingCodes)
    }

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(uniqueEntries, null, 2),
      'utf8',
    )

    fs.writeFileSync(
      ERRORS_FILE,
      JSON.stringify({ errors, duplicates }, null, 2),
      'utf8',
    )

    console.log('\n--- Extraction terminée ---')
    console.log(`Codes extraits : ${entries.length}`)
    console.log(`Codes uniques : ${uniqueEntries.length}`)
    console.log(`Anomalies : ${errors.length}`)
    console.log(`Doublons divergents : ${duplicates.length}`)
    console.log(`Fichier généré : ${OUTPUT_FILE}`)
    console.log(`Rapport généré : ${ERRORS_FILE}`)

    console.table(
      errors.map(({ page, code, reason, raw }) => ({
        page,
        code,
        reason,
        raw: raw?.slice(0, 100) ?? '',
      })),
    )

    if (errors.length) {
      console.warn(
        'Certains taux ou libellés doivent être vérifiés avant importation.',
      )
    }
  } catch (error) {
    console.error('Erreur pendant l’extraction :', error.message)
    process.exitCode = 1
  }
}

await main()
