import mongoose from 'mongoose'

const connectDB = async (url) => {
  const conn = await mongoose.connect(url)
  console.log(
    `✅ MongoDB connecté : ${conn.connection.host}/${conn.connection.name}`,
  )
  return conn
}

export default connectDB
