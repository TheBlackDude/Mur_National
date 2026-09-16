#!/usr/bin/env node
// Stamp `region` on every contribution from web/src/data/prefectures.json. Until 16 Sept the callable only knew
// Conakry, so the Wall's « Région » filter returned nothing outside the capital; the decree of 20 Aug 2026 also moved
// Siguiri and Beyla into regions of their own. Idempotent: only documents whose region differs are written.
//
// Usage (repo root, gcloud ADC as an owner of guinea68):
//   node scripts/backfill-regions.mjs          # dry run
//   node scripts/backfill-regions.mjs --yes    # write
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const PROJECT = 'guinea68'
const apply = process.argv.includes('--yes')
const prefs = JSON.parse(readFileSync(new URL('../web/src/data/prefectures.json', import.meta.url), 'utf8'))
const REGION_OF = Object.fromEntries(prefs.map((p) => [p.code, p.region]))

process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT
initializeApp({ credential: applicationDefault(), projectId: PROJECT })
const db = getFirestore()

const snap = await db.collection('contributions').where('prefecture', '!=', null).select('prefecture', 'region').get()
const todo = snap.docs.filter((d) => { const want = REGION_OF[d.get('prefecture')] ?? null; return want !== (d.get('region') ?? null) })
const unknown = snap.docs.filter((d) => !(d.get('prefecture') in REGION_OF)).map((d) => d.get('prefecture'))
console.log(`${snap.size} contributions with a prefecture, ${todo.length} to update${unknown.length ? `, unknown codes: ${[...new Set(unknown)].join(', ')}` : ''}`)
if (!apply) { console.log('Dry run. Re-run with --yes.'); process.exit(0) }
let n = 0
for (let i = 0; i < todo.length; i += 400) {
  const batch = db.batch()
  for (const d of todo.slice(i, i + 400)) { batch.update(d.ref, { region: REGION_OF[d.get('prefecture')] ?? null }); n++ }
  await batch.commit()
  process.stdout.write(`\r  ${n} / ${todo.length}`)
}
console.log(`\n${n} documents updated.`)
