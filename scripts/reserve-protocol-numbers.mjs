#!/usr/bin/env node
// Frees participant numbers 1–60 for the Presidency and the Government (decision of 17 Sept 2026) by moving every
// existing contribution up by 60: n° 1 becomes n° 61, and the sequence jumps by 60 so new citizens continue after the
// highest moved number. Protocol items (vip set) are never touched. Runs once: a marker in RTDB meta/protocolOffset
// refuses a second pass. Souvenir cards already downloaded keep their old number; the Wall, the screen, the snapshot
// (within 2 minutes) and the admin search follow the new one.
//
// Usage (repo root, gcloud ADC as an owner of guinea68):
//   node scripts/reserve-protocol-numbers.mjs          # dry run: shows what would move
//   node scripts/reserve-protocol-numbers.mjs --yes    # apply
import { createRequire } from 'node:module'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getDatabase } = require('firebase-admin/database')

const PROJECT = 'guinea68'
const OFFSET = 60
const apply = process.argv.includes('--yes')

process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT
initializeApp({ credential: applicationDefault(), projectId: PROJECT, databaseURL: `https://${PROJECT}-default-rtdb.europe-west1.firebasedatabase.app` })
const db = getFirestore()
const rtdb = getDatabase()

const marker = (await rtdb.ref('meta/protocolOffset').get()).val()
if (marker) { console.log(`Already applied on ${marker.at} (sequence was ${marker.oldSeq}). Nothing to do.`); process.exit(0) }

const oldSeq = Number((await rtdb.ref('seq/participant').get()).val() ?? 0)
const snap = await db.collection('contributions').select('participantNumber', 'vip', 'status').get()
const todo = snap.docs.filter((d) => !d.get('vip') && Number(d.get('participantNumber')) <= oldSeq)
const nums = todo.map((d) => Number(d.get('participantNumber')))
const above = snap.docs.filter((d) => Number(d.get('participantNumber')) > oldSeq).length
console.log(`Sequence seq/participant = ${oldSeq}. ${snap.size} contributions, ${todo.length} to move by +${OFFSET} (numbers ${Math.min(...nums)}–${Math.max(...nums)} → ${Math.min(...nums) + OFFSET}–${Math.max(...nums) + OFFSET}).`)
if (above) console.log(`${above} contribution(s) already above the sequence: left alone.`)
if (!apply) { console.log('Dry run. Re-run with --yes.'); process.exit(0) }

// 1. Sequence first: any submission landing during the batch gets a number above the moved range.
const { snapshot } = await rtdb.ref('seq/participant').transaction((n) => (n ?? 0) + OFFSET)
console.log(`seq/participant → ${snapshot.val()}`)
// 2. Documents, 400 per batch.
let n = 0
for (let i = 0; i < todo.length; i += 400) {
  const batch = db.batch()
  for (const d of todo.slice(i, i + 400)) { batch.update(d.ref, { participantNumber: Number(d.get('participantNumber')) + OFFSET }); n++ }
  await batch.commit()
  process.stdout.write(`\r  ${n} / ${todo.length}`)
}
await rtdb.ref('meta/protocolOffset').set({ by: OFFSET, oldSeq, moved: n, at: new Date().toISOString() })
console.log(`\n${n} contributions renumbered. Numbers 1–${OFFSET} are free for the Presidency and the Government.`)
process.exit(0)
