import CodeSH from '../models/CodeSH.js'

let CODE_SH_CACHE = null
let IDF_INDEX = null

const normalize = (value = '') =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * EXPLICATION:
 * Produit recherché: "Produits et articles textiles pour usages techniques, visés à la Note 8 du présent Chapitre."
 * Résultat: Préparations et articles pharmaceutiques visés à la Note 4 du présent Chapitre. — Préparations chimiques contraceptives à base d’hormones, d’autres produits du n° 29.37 ou de — kg 1
 * POURQUOI? les 2 phrases contiennent:  "articles", "visés", "présent", "chapitre", "produits", alors que les mots importants:
 * "textiles" et "techniques" sont noyés.
 * => Pour du SH il faudrait ignorer des mots comme :
 */
export const STOPWORDS = [
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
  'chapitre',
  'present',
  'vises',
  'produits',
]

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

export async function loadCodeSHCache() {
  if (!CODE_SH_CACHE) {
    const data = await CodeSH.find({}).lean()

    CODE_SH_CACHE = data.map((item) => ({
      ...item,
      normalizedDescription: normalize(item.description || ''),

      keywords: extractKeywords(normalize(item.description || '')),
    }))

    console.log('✔ Cache Code SH chargé :', CODE_SH_CACHE.length, 'entrées')
  }

  return CODE_SH_CACHE
}

export const getIdfIndex = () => IDF_INDEX
