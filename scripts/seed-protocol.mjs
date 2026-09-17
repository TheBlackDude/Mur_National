#!/usr/bin/env node
// Creates the two protocol links (decision of 17 Sept 2026):
//   protocolTokens/PRESIDENCE   = { token, tier: 'president' }   → https://guineen68.com/presidence?t=TOKEN   (numbers 1–10)
//   protocolTokens/GOUVERNEMENT = { token, tier: 'minister' }    → https://guineen68.com/gouvernement?t=TOKEN (numbers 11–60)
// The collection is private (rules deny every client read); only the callables read it. Idempotent: existing tokens
// are kept unless --rotate is passed (rotating invalidates the links already handed out).
// Prints the two links and writes scripts/out/protocol.csv (gitignored, contains the tokens).
//
// Usage:  node scripts/seed-protocol.mjs [--base=https://guineen68.com] [--rotate]
// Auth:   gcloud auth application-default login
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = 'guinea68'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const BASE = (args.find((a) => a.startsWith('--base='))?.slice(7) ?? 'https://guineen68.com').replace(/\/$/, '')
const ROTATE = args.includes('--rotate')
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const LINKS = [
  { code: 'PRESIDENCE', tier: 'president', path: '/presidence', label: 'Présidence de la République (n° 1–10)' },
  { code: 'GOUVERNEMENT', tier: 'minister', path: '/gouvernement', label: 'Gouvernement (n° 11–60)' },
]

function accessToken() {
  try { return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim() }
  catch { console.error('Cannot get an access token. Run: gcloud auth application-default login'); process.exit(1) }
}
const headers = { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' }

async function getDoc(path) {
  const res = await fetch(`${FS}/${path}`, { headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  const f = (await res.json()).fields ?? {}
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue ?? null]))
}
async function setDoc(path, data) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { stringValue: String(v) }]))
  const res = await fetch(`${FS}/${path}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) })
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
}

const rows = []
for (const l of LINKS) {
  let doc = await getDoc(`protocolTokens/${l.code}`)
  let state = 'existing'
  if (!doc || ROTATE) {
    doc = { token: randomBytes(24).toString('base64url'), tier: l.tier } // 32 chars
    await setDoc(`protocolTokens/${l.code}`, doc)
    state = doc && !ROTATE ? 'created' : 'rotated'
  } else if (doc.tier !== l.tier) {
    await setDoc(`protocolTokens/${l.code}`, { ...doc, tier: l.tier })
  }
  const link = `${BASE}${l.path}?t=${doc.token}`
  rows.push([l.code, l.label, link])
  console.log(`${l.code}\t${state}\t${l.label}\n  ${link}`)
}
mkdirSync(join(ROOT, 'scripts/out'), { recursive: true })
writeFileSync(join(ROOT, 'scripts/out/protocol.csv'), ['code,label,link', ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n') + '\n')
console.error('\nCSV: scripts/out/protocol.csv (contains the tokens, gitignored). Hand each link to one office only.')
