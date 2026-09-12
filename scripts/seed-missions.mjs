#!/usr/bin/env node
// Seeds one mission per country in web/src/data/countries.json (until the MAEIAGE list arrives):
//   missions/{code}      = { name, country, contact }   public (name/country shown on /video)
//   missionTokens/{code} = { token }                    private (read only by the callables)
// Idempotent: existing missions keep their token unless --rotate is passed.
// Prints one line per mission (code, name, invite link) and writes scripts/out/missions.csv (gitignored, contains tokens).
//
// Usage:  node scripts/seed-missions.mjs [--base=https://guineen68.com] [--rotate]
// Auth:   gcloud auth application-default login   (Application Default Credentials; no service-account key needed)
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = 'guinea68'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const BASE = (args.find((a) => a.startsWith('--base='))?.slice(7) ?? 'https://theblackdude.github.io/Mur_National').replace(/\/$/, '')
const ROTATE = args.includes('--rotate')
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

function accessToken() {
  try {
    return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim()
  } catch (e) {
    console.error('Cannot get an access token. Run: gcloud auth application-default login')
    process.exit(1)
  }
}
const TOKEN = accessToken()
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

async function getDoc(path) {
  const res = await fetch(`${FS}/${path}`, { headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  return fromFields((await res.json()).fields ?? {})
}
async function setDoc(path, data, { createOnly = false } = {}) {
  const url = `${FS}/${path}${createOnly ? '?currentDocument.exists=false' : ''}`
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields: toFields(data) }) })
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
}
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) }]))
const fromFields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue ?? v.integerValue ?? v.booleanValue ?? null]))

const countries = JSON.parse(readFileSync(join(ROOT, 'web/src/data/countries.json'), 'utf8')).filter((c) => c.iso !== 'XX')
const rows = []
let created = 0, existing = 0, rotated = 0
for (const c of countries) {
  const code = c.iso
  const name = `Ambassade de Guinée · ${c.name}`
  const mission = await getDoc(`missions/${code}`)
  if (!mission) { await setDoc(`missions/${code}`, { name, country: code, contact: '' }); }
  let tok = await getDoc(`missionTokens/${code}`)
  if (!tok || ROTATE) {
    const token = randomBytes(18).toString('base64url') // 24 chars
    await setDoc(`missionTokens/${code}`, { token })
    tok = { token }
    if (mission) rotated++; else created++
  } else existing++
  const link = `${BASE}/video?mission=${code}&t=${tok.token}`
  rows.push([code, mission?.name ?? name, code, tok.token, link])
  console.log(`${code}\t${mission?.name ?? name}\t${link}`)
}
mkdirSync(join(ROOT, 'scripts/out'), { recursive: true })
const csv = ['code,name,country,token,link', ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n') + '\n'
writeFileSync(join(ROOT, 'scripts/out/missions.csv'), csv)
console.error(`\n${countries.length} missions · created ${created} · existing ${existing} · rotated ${rotated}\nCSV: scripts/out/missions.csv (contains tokens, gitignored)`)
