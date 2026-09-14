#!/usr/bin/env node
// Prepares the k6 load test against the live project: a pool of anonymous users (ID tokens, one hour), an
// App Check token for the callables, and a set of distinct test JPEGs. Writes scripts/out/load/.
//
//   node scripts/load/prepare.mjs --users=600            # 600 users = 3 000 submissions at 5 per user per hour
//   node scripts/load/prepare.mjs --users=0              # only regenerate the test images
//   APPCHECK_DEBUG_TOKEN=<uuid> node scripts/load/prepare.mjs --users=600
//
// App Check: the callables enforce it. The script first asks the Admin SDK (your gcloud ADC, signing as the
// compute service account) for a token; when that is not allowed, it exchanges the debug token registered in
// Firebase console → App Check → Apps → web app → « Manage debug tokens » (APPCHECK_DEBUG_TOKEN).
// Firebase Auth allows 1 000 anonymous sign-ups per IP per hour on this project: keep --users under that.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const sharp = require('sharp')

const PROJECT = 'guinea68'
const APP_ID = '1:3206736012:web:f35f3bb665e884915533a9'
const COMPUTE_SA = '3206736012-compute@developer.gserviceaccount.com'
const OUT = new URL('../out/load/', import.meta.url)
const IMAGES = 20

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const USERS = Number(args.users ?? 600)
const env = Object.fromEntries(readFileSync(new URL('../../web/.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const API_KEY = env.VITE_FIREBASE_API_KEY
if (!API_KEY) { console.error('web/.env has no VITE_FIREBASE_API_KEY'); process.exit(1) }
mkdirSync(new URL('images/', OUT), { recursive: true })

// 1. Distinct JPEGs (different pHash each) so the duplicate detector does not route everything to L2.
async function images() {
  for (let i = 0; i < IMAGES; i++) {
    const w = 1080, h = 1350
    const raw = Buffer.alloc(w * h * 3)
    const seed = (i + 1) * 7919
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3
      const band = Math.floor((x / w) * 3 + (i % 3))
      const noise = ((x * 31 + y * 17 + seed) % 97) * 2
      raw[o] = band % 3 === 0 ? 200 : 40 + noise / 2
      raw[o + 1] = band % 3 === 1 ? 180 : 60 + (noise % 50)
      raw[o + 2] = band % 3 === 2 ? 160 : 30 + (noise % 80)
    }
    // Light blur: about 150 KB per file, the size of a framed selfie after the studio's compression, and a distinct pHash each.
    const buf = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).blur(0.6).jpeg({ quality: 82 }).toBuffer()
    writeFileSync(new URL(`images/${i}.jpg`, OUT), buf)
  }
  console.log(`${IMAGES} test images in scripts/out/load/images/`)
}

// 2. Anonymous users through the Identity Toolkit REST API, the same call the web SDK makes.
async function signUp() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!res.ok) throw new Error(`signUp ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const { localId, idToken, refreshToken } = await res.json()
  return { uid: localId, idToken, refreshToken }
}
async function users() {
  const out = []
  const PAR = 16
  for (let i = 0; i < USERS; i += PAR) {
    const batch = await Promise.all(Array.from({ length: Math.min(PAR, USERS - i) }, signUp))
    out.push(...batch)
    if ((i / PAR) % 10 === 0) process.stdout.write(`\r${out.length}/${USERS} users`)
  }
  console.log(`\r${out.length} anonymous users created`)
  return out
}

// 3. App Check token: Admin SDK first, debug token second.
async function appCheckToken() {
  try {
    const { initializeApp, applicationDefault } = require('firebase-admin/app')
    const { getAppCheck } = require('firebase-admin/app-check')
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT
    const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT, serviceAccountId: COMPUTE_SA })
    const t = await getAppCheck(app).createToken(APP_ID, { ttlMillis: 60 * 60_000 })
    console.log('App Check token minted with the Admin SDK (1 h)')
    return t.token
  } catch (e) {
    console.log('Admin SDK could not mint an App Check token:', String(e.message ?? e).split('\n')[0].slice(0, 160))
  }
  const debug = process.env.APPCHECK_DEBUG_TOKEN
  if (!debug) { console.error('Set APPCHECK_DEBUG_TOKEN to a debug token registered in Firebase console → App Check.'); process.exit(1) }
  const res = await fetch(`https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT}/apps/${APP_ID}:exchangeDebugToken?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debug_token: debug }),
  })
  if (!res.ok) { console.error(`exchangeDebugToken ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1) }
  const { token, ttl } = await res.json()
  console.log(`App Check token from the debug token (${ttl})`)
  return token
}

await images()
if (USERS === 0) { console.log('images only (--users=0)'); process.exit(0) }
const appCheck = await appCheckToken()
const pool = await users()
writeFileSync(new URL('users.json', OUT), JSON.stringify({ createdAt: new Date().toISOString(), appCheck, users: pool }))
console.log(`scripts/out/load/users.json written · tokens expire in 1 h · run: k6 run scripts/load/submissions.js`)
