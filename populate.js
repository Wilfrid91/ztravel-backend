/********** ADD DATA WITHIN MONGO DB DADATABSE *************/
// start woking with database
import 'dotenv/config'
import connectDB from './db/connect.js'
import fs from 'fs'
import crypto from 'crypto'

import Tab2 from './models/Tab2.js'

// AVANT DE PARTIR
//import Tab1Model from './models/avantDePartir.js'
//import jsonAvtDePartir from './json_data/avant_de_partir.json' assert { type: 'json' }

import Tab2Model from './models/Tab2.js'
import jsonTab2 from './json_data/Tab2.json' assert { type: 'json' }

import Catalog from './models/Catalog.js'
import jsonCatalog from './json_data/catalog_generated.json' assert { type: 'json' }

import CGU from './models/CGU.js'
import jsonCGU from './json_data/CGU.json' assert { type: 'json' }
/*
import codeSHModel from './models/CodeSH.js'
import codeSHjsonData from './output.json' assert { type: 'json' }*/

import douaneModel from './models/Douane.js'
import douaneInfo from './json_data/douane.json' assert { type: 'json' }

import simulateurDDModel from './models/AVDSimulator.js'
import simulateurDDouaneInfo from './json_data/simulateurDD.json' assert { type: 'json' }

import tab2AVDModel from './models/Tab2AvdData.js'
import Tab2AVDIntroInfo from './json_data/tab2AvdSimulator.json' assert { type: 'json' }

import tab3AVDModel from './models/Tab3AvdData.js'
import Tab3AVDIntroInfo from './json_data/vehicleUserGuide.json' assert { type: 'json' }

import UserGuideAVD from './models/UserGuideAVD.js'
import UserGuideAVDInfo from './json_data/userGuide.json' assert { type: 'json' }

import CheckList from './models/Checklist.js'
import CheckListInfo from './json_data/checklist.json' assert { type: 'json' }

/**
 * Calcul un hash (empreinte) de chaque fichier JSON
 * @param {*} path
 * @returns
 */
export function hashFile(path) {
  const content = fs.readFileSync(path, 'utf8')
  return crypto.createHash('sha256').update(content).digest('hex')
}

// Liste des fichiers surveillés
const FILES = {
  //avantDePartir: './json_data/avant_de_partir.json',
  tab2: './json_data/tab2.json',
  catalog: './json_data/catalog_generated.json',
  cgu: './json_data/CGU.json',
  //codeSH: './output.json',
  douane: './json_data/douane.json',
  simulateurDD: './json_data/simulateurDD.json',
  tab2AVDIntro: './json_data/tab2AvdSimulator.json',
  tab3AVDIntro: './json_data/vehicleUserGuide.json',
  UserGuide: './json_data/userGuide.json',
  CheckList: './json_data/checklist.json',
}

function loadCache() {
  if (!fs.existsSync('.cache.json')) return {}
  return JSON.parse(fs.readFileSync('.cache.json', 'utf8'))
}

function saveCache(cache) {
  fs.writeFileSync('.cache.json', JSON.stringify(cache, null, 2))
}

function haveFilesChanged() {
  const cache = loadCache()
  const newCache = {}

  let changed = false

  for (const [key, path] of Object.entries(FILES)) {
    const hash = hashFile(path)
    newCache[key] = hash

    if (cache[key] !== hash) {
      changed = true
    }
  }

  if (changed) {
    console.log('🔄 Des fichiers JSON ont changé → importation nécessaire.')
    saveCache(newCache)
  } else {
    console.log('✔️ Aucun changement détecté → importation ignorée.')
  }

  return changed
}

const importData = async () => {
  try {
    // Connect to DB
    await connectDB(process.env.MONGO_URL)

    // AVANT DE PARTIR
    // Remove all existing products
    //await Tab1Model.deleteMany()
    // Insert new products
    //await Tab1Model.create(jsonAvtDePartir)
    // remove all products currently there, in our case there currently no product => optional
    ;(await Tab2Model.deleteMany(),
      // add products within database
      await Tab2Model.create(jsonTab2))

    // Remove all existing products
    await Catalog.deleteMany()
    // Insert new products
    await Catalog.create(jsonCatalog)

    // Remove all existing products
    await CGU.deleteMany()
    // Insert new products
    await CGU.create(jsonCGU)

    // Remove all existing products
    //await codeSHModel.deleteMany()
    // Insert new products
    //await codeSHModel.create(codeSHjsonData)

    // Remove all existing products
    await douaneModel.deleteMany()
    // Insert new products
    await douaneModel.create(douaneInfo)

    // Remove all existing products
    await simulateurDDModel.deleteMany()
    // Insert new products
    await simulateurDDModel.create(simulateurDDouaneInfo)

    // Remove all existing products
    await tab2AVDModel.deleteMany()
    // Insert new products
    await tab2AVDModel.create(Tab2AVDIntroInfo)

    // Remove all existing products
    await tab3AVDModel.deleteMany()
    // Insert new products
    await tab3AVDModel.create(Tab3AVDIntroInfo)

    // Remove all existing products
    await UserGuideAVD.deleteMany()
    // Insert new products
    await UserGuideAVD.create(UserGuideAVDInfo)

    // Remove all existing products
    await CheckList.deleteMany()
    // Insert new products
    await CheckList.create(CheckListInfo)

    console.log('####  Success !!! #####')
    // everything went well
    process.exit(0)
  } catch (error) {
    console.log(error)
    process.exit(1)
  }
}

// start DB
// Go to terminal to start the file >node populate
if (haveFilesChanged()) {
  importData()
} else {
  process.exit(0)
}
