#!/usr/bin/env node
// Prepares the k6 load test against the live project: a pool of anonymous users (ID tokens, one hour), an
// App Check token for the callables, and a set of distinct test JPEGs. Writes scripts/out/load/.
//
//   node scripts/load/prepare.mjs --users=600            # 600 users = 3 000 submissions at 5 per user per hour
//   node scripts/load/prepare.mjs --users=0              # only regenerate the test images
//   node scripts/load/prepare.mjs --users=600 --append   # top up a pool created less than 50 min ago
//   node scripts/load/prepare.mjs --refresh             # new ID tokens for the whole pool (run right before k6)
//   --pace=300 milliseconds between sign-ups (Auth throttles bursts from one IP)
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
const PACE_MS = Number(args.pace ?? 300)
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
// Identity Toolkit throttles bursts from one IP (TOO_MANY_ATTEMPTS_TRY_LATER) well under the hourly quota:
// one sign-up at a time, a short pause between them, exponential back-off on a throttle, progress saved as it goes.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function users(existing, appCheck) {
  const out = [...existing]
  let wait = 5_000
  while (out.length < USERS) {
    try {
      out.push(await signUp())
      wait = 5_000
      if (out.length % 10 === 0) { process.stdout.write(`\r${out.length}/${USERS} users`); save(appCheck, out) }
      await sleep(PACE_MS)
    } catch (e) {
      if (!String(e.message).includes('TOO_MANY_ATTEMPTS')) throw e
      process.stdout.write(`\r${out.length}/${USERS} users · throttled, waiting ${wait / 1000} s   `)
      await sleep(wait)
      wait = Math.min(wait * 2, 120_000)
    }
  }
  console.log(`\r${out.length} anonymous users in the pool (${out.length - existing.length} new)`)
  return out
}
function save(appCheck, pool) {
  writeFileSync(new URL('users.json', OUT), JSON.stringify({ createdAt: new Date().toISOString(), appCheck, users: pool }))
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

// --refresh: new ID tokens for every user of the pool (refresh tokens do not expire), for a run more than an hour later.
async function refreshAll() {
  const prev = JSON.parse(readFileSync(new URL('users.json', OUT), 'utf8'))
  const appCheck = process.env.APPCHECK_DEBUG_TOKEN ? await appCheckToken() : prev.appCheck
  let n = 0
  for (const u of prev.users) {
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: u.refreshToken }),
    })
    if (!res.ok) { console.warn(`refresh failed for ${u.uid}: ${res.status}`); continue }
    const j = await res.json()
    u.idToken = j.id_token; u.refreshToken = j.refresh_token; n++
    if (n % 25 === 0) process.stdout.write(`\r${n}/${prev.users.length} refreshed`)
    await sleep(PACE_MS / 3)
  }
  save(appCheck, prev.users)
  console.log(`\r${n}/${prev.users.length} tokens refreshed · users.json rewritten`)
}

await images()
if ('refresh' in args) { await refreshAll(); process.exit(0) }
if (USERS === 0) { console.log('images only (--users=0)'); process.exit(0) }
// --append keeps the users of a pool younger than 50 minutes (their tokens still cover a run) and fills up to --users.
let existing = []
try {
  const prev = JSON.parse(readFileSync(new URL('users.json', OUT), 'utf8'))
  if ('append' in args && Date.now() - Date.parse(prev.createdAt) < 50 * 60_000) existing = prev.users
} catch { /* no pool yet */ }
const appCheck = await appCheckToken()
const pool = await users(existing, appCheck)
save(appCheck, pool)
console.log(`scripts/out/load/users.json written · tokens expire 1 h after creation · ${pool.length * 5} submissions possible`)
console.log('run: scripts/load/remote.sh both   (or: k6 run scripts/load/submissions.js)')
