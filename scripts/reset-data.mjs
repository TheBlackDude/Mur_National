#!/usr/bin/env node
// Wipe every runtime store of guinea68 back to zero: contributions (with their history),
// RTDB (counters, participant sequence, rate buckets, stats, alerts, locks), Storage
// (uploads/, videos/, staging/, public/, thumbs/, snapshot/, exports/) and anonymous Auth users.
//
// KEEPS: config/app, missions, missionTokens, staff accounts (any user with an e-mail or a
// sign-in provider) and their claims. The Google Sheet and the Drive export folder are not
// touched: clear them by hand.
//
// Usage (from the repo root, gcloud ADC as an owner of guinea68):
//   node scripts/reset-data.mjs            # dry run: counts only, deletes nothing
//   node scripts/reset-data.mjs --yes      # really delete
//   node scripts/reset-data.mjs --yes --keep-users   # leave anonymous users in place
import { createRequire } from 'node:module'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getDatabase } = require('firebase-admin/database')
const { getStorage } = require('firebase-admin/storage')
const { getAuth } = require('firebase-admin/auth')

const PROJECT = 'guinea68'
const BUCKET = 'guinea68.firebasestorage.app'
const RTDB = 'https://guinea68-default-rtdb.europe-west1.firebasedatabase.app'
const COLLECTIONS = ['contributions', 'reports', 'blocklist'] // history lives under contributions/{id}/history
const PREFIXES = ['uploads/', 'videos/', 'staging/', 'public/', 'thumbs/', 'snapshot/', 'exports/']

// User ADC carries the quota project of whatever gcloud set last; Storage needs it to be this project.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT

const args = process.argv.slice(2)
const YES = args.includes('--yes')
const KEEP_USERS = args.includes('--keep-users')

initializeApp({ credential: applicationDefault(), projectId: PROJECT, storageBucket: BUCKET, databaseURL: RTDB })
const db = getFirestore()
const rtdb = getDatabase()
const bucket = getStorage().bucket()
const auth = getAuth()

async function countDocs(name) {
  const s = await db.collection(name).count().get()
  return s.data().count
}

async function anonymousUsers() {
  const uids = []
  let token
  do {
    const page = await auth.listUsers(1000, token)
    for (const u of page.users) if (!u.email && (u.providerData?.length ?? 0) === 0) uids.push(u.uid)
    token = page.pageToken
  } while (token)
  return uids
}

console.log(YES ? '*** LIVE RUN: deleting ***' : 'Dry run (add --yes to delete)')
console.log(`project ${PROJECT}\n`)

// Firestore
for (const name of COLLECTIONS) {
  const n = await countDocs(name)
  console.log(`firestore ${name.padEnd(14)} ${n} docs`)
  if (YES && n) await db.recursiveDelete(db.collection(name))
}
for (const keep of ['config', 'missions', 'missionTokens']) console.log(`firestore ${keep.padEnd(14)} kept (${await countDocs(keep)} docs)`)

// Realtime Database
const root = await rtdb.ref('/').once('value')
const keys = Object.keys(root.val() ?? {})
const seq = root.child('seq/participant').val()
console.log(`\nrtdb      ${keys.length ? keys.join(', ') : '(empty)'}  · seq/participant = ${seq ?? 0}`)
if (YES && keys.length) await rtdb.ref('/').remove()

// Storage
console.log()
for (const prefix of PREFIXES) {
  const [files] = await bucket.getFiles({ prefix })
  const mb = files.reduce((a, f) => a + Number(f.metadata.size ?? 0), 0) / 1e6
  console.log(`storage   ${prefix.padEnd(14)} ${files.length} files · ${mb.toFixed(1)} MB`)
  if (YES && files.length) await bucket.deleteFiles({ prefix, force: true })
}

// Auth
const anon = await anonymousUsers()
console.log(`\nauth      anonymous users: ${anon.length}${KEEP_USERS ? ' (kept)' : ''}`)
if (YES && !KEEP_USERS) {
  for (let i = 0; i < anon.length; i += 1000) {
    const r = await auth.deleteUsers(anon.slice(i, i + 1000))
    if (r.failureCount) console.log(`  ${r.failureCount} deletions failed`, r.errors.slice(0, 3))
  }
}

if (YES) {
  console.log('\nDone. snapshot/latest.json is rebuilt by the `snapshot` function within 2 minutes.')
  console.log('Clear the export Sheet and the Drive folder by hand; participant numbers restart at 1.')
} else {
  console.log('\nNothing deleted.')
}
process.exit(0)
