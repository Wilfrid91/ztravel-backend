import fs from 'fs'
import csv from 'csv-parser'
import mongoose from 'mongoose'
import CodeSH from './models/CodeSH.js'
import 'dotenv/config'
import connectDB from './db/connect.js'

const FILE_PATH = './BJ-Tarif-Douanier-SH2022-a-jour_2.0.csv'

const importTarifSH = async () => {
  await connectDB(process.env.MONGO_URL)
  console.log('Connexion MongoDB OK')

  const results = []

  fs.createReadStream(FILE_PATH)
    .pipe(csv())
    .on('data', (row) => {
      console.log(row) // ← ajoute ceci
      process.exit() // ← pour afficher seulement la première ligne
    })

    .on('end', async () => {
      console.log(`\n${results.length} lignes chargées depuis le CSV.`)

      let inserted = 0

      for (const item of results) {
        await CodeSH.updateOne(
          { code: item.code },
          { $set: item },
          { upsert: true },
        )
        inserted++
      }

      console.log(`Import terminé : ${inserted} codes SH insérés.`)
      mongoose.connection.close()
    })
}

importTarifSH()
