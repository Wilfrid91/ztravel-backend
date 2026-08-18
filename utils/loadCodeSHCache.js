import CodeSH from '../models/CodeSH.js'
let CODE_SH_CACHE = null

export async function loadCodeSHCache() {
  if (!CODE_SH_CACHE) {
    CODE_SH_CACHE = await CodeSH.find({}).lean() // ← tableau garanti
    console.log('✔ Cache Code SH chargé :', CODE_SH_CACHE.length, 'entrées')
  }
  return CODE_SH_CACHE
}
