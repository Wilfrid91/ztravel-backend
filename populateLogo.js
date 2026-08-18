import fs from 'fs'

/** Convertis ton logo en base64 une seule fois, puis tu le mets dans ton code : */

const filePath = 'C:\\Users\\yanso\\Downloads\\logo.png'

const file = fs.readFileSync(filePath)
console.log(file.length)
const base64 = file.toString('base64')
console.log(base64.slice(0, 100) + '...')
fs.writeFileSync('logo_base64.txt', 'data:image/png;base64,' + base64)
