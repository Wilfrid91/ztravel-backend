/********** ADD DATA WITHIN MONGO DB DADATABSE *************/
import 'dotenv/config'
import connectDB from './db/connect.js'
import Catalog from './models/Catalog.js'
import jsonCatalog from './Catalog.json' assert { type: 'json' }

const importData = async () => {
  try {
    // Connect to DB
    await connectDB(process.env.MONGO_URL)

    // Remove all existing products
    await Catalog.deleteMany()

    // Insert new products
    await Catalog.create(jsonCatalog)

    console.log('#### Success !!! #####')
    process.exit(0)
  } catch (error) {
    console.log(error)
    process.exit(1)
  }
}

// start DB
// Go to terminal to start the file >node populate
importData()
