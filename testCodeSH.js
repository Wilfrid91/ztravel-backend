import 'dotenv/config'
import CodeSH from './models/CodeSH.js'
import connectDB from './db/connect.js'
// Rechercher les tubes et tuyaux en aluminium
// Connect to DB
await connectDB(process.env.MONGO_URL)

const results = await CodeSH.find({
  description: {
    $regex: 'tubes|tuyaux|aluminium',
    $options: 'i',
  },
})
  .select(
    'code description tauxDD tauxTVA tauxPCS tauxPC tauxPS tauxRAU tauxRS tauxAIB',
  )
  .limit(100)
  .lean()

console.table(results)
