// Seeds missions/{code} with a random token and prints the invite links.
// Usage: GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/seed-missions.mjs missions.csv https://fierdetreguineen.gn
// CSV columns: code,name,country_iso,contact_email
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const [file, origin = 'https://fierdetreguineen.gn'] = process.argv.slice(2)
if (!file) { console.error('missions.csv required'); process.exit(1) }
initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const rows = readFileSync(file, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','))
for (const [code, name, country, contact] of rows) {
  const token = randomBytes(12).toString('base64url')
  await db.doc(`missions/${code}`).set({ name, country, contact, token, createdAt: new Date() }, { merge: true })
  console.log(`${code}\t${name}\t${origin}/video?mission=${code}&t=${token}`)
}
