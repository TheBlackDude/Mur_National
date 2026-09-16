#!/usr/bin/env node
// Stamp `Cache-Control: public, max-age=31536000, immutable` on every object under public/ and thumbs/ (and their
// staging copies) that was published before the functions set it themselves. Renditions are content-addressed by
// contribution id and never change, so browsers and Google's edge can keep them; rejection deletes them outright.
//
// Usage (repo root, gcloud ADC as an owner of guinea68):
//   node scripts/set-cache-control.mjs          # dry run: counts what would change
//   node scripts/set-cache-control.mjs --yes    # apply
import { createRequire } from 'node:module'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getStorage } = require('firebase-admin/storage')

const PROJECT = 'guinea68'
const BUCKET = 'guinea68.firebasestorage.app'
const PREFIXES = ['public/', 'thumbs/', 'staging/public/', 'staging/thumbs/']
const WANT = 'public, max-age=31536000, immutable'
const CONCURRENCY = 25
const apply = process.argv.includes('--yes')

process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT
initializeApp({ credential: applicationDefault(), projectId: PROJECT, storageBucket: BUCKET })
const bucket = getStorage().bucket()

let seen = 0, changed = 0, failed = 0
for (const prefix of PREFIXES) {
  const [files] = await bucket.getFiles({ prefix })
  const todo = files.filter((f) => f.metadata.cacheControl !== WANT)
  seen += files.length
  console.log(`${prefix.padEnd(16)} ${files.length} objects, ${todo.length} without the header`)
  if (!apply) { changed += todo.length; continue }
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map((f) => f.setMetadata({ cacheControl: WANT })))
    for (const r of results) { if (r.status === 'fulfilled') changed++; else { failed++; console.warn(r.reason?.message ?? r.reason) } }
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, todo.length)} / ${todo.length}`)
  }
  if (todo.length) process.stdout.write('\n')
}
console.log(apply ? `\n${changed} objects updated, ${failed} failed, ${seen} seen.` : `\nDry run: ${changed} of ${seen} objects would be updated. Re-run with --yes.`)
