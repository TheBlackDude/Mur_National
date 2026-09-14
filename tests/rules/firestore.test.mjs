import { test, before, after, beforeEach } from 'node:test'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, limit, addDoc } from 'firebase/firestore'
import { env, who, ok, denied } from './env.mjs'

let t, u
before(async () => {
  t = await env()
  u = who(t)
})
after(async () => { await t.cleanup() })
beforeEach(async () => {
  await t.clearFirestore()
  await t.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'contributions/approved-1'), { status: 'approved', uid: 'citizen-1', participantNumber: 1 })
    await setDoc(doc(db, 'contributions/pending-1'), { status: 'pending', uid: 'citizen-1', participantNumber: 2 })
    await setDoc(doc(db, 'contributions/pending-1/history/h1'), { action: 'review', by: 'mod-1' })
    await setDoc(doc(db, 'reports/approved-1_citizen-2'), { contributionId: 'approved-1', uid: 'citizen-2' })
    await setDoc(doc(db, 'blocklist/uid:bad'), { type: 'uid', uid: 'bad' })
    await setDoc(doc(db, 'missions/FR'), { name: 'Ambassade de Guinée · France', country: 'FR' })
    await setDoc(doc(db, 'missionTokens/FR'), { token: 'secret-token-1234' })
    await setDoc(doc(db, 'config/app'), { launchAt: '2026-09-25T08:00:00Z', degraded: false })
  })
})

const fs = (c) => c.firestore()

test('contributions: anyone reads an approved item, nobody but staff reads a pending one', async () => {
  await ok(getDoc(doc(fs(u.anon), 'contributions/approved-1')))
  await ok(getDoc(doc(fs(u.citizen), 'contributions/approved-1')))
  await denied(getDoc(doc(fs(u.anon), 'contributions/pending-1')))
  await denied(getDoc(doc(fs(u.citizen), 'contributions/pending-1')))   // even its own author
  await ok(getDoc(doc(fs(u.moderator), 'contributions/pending-1')))
  await ok(getDoc(doc(fs(u.editor), 'contributions/pending-1')))
  await ok(getDoc(doc(fs(u.maeiage), 'contributions/pending-1')))
  await ok(getDoc(doc(fs(u.admin), 'contributions/pending-1')))
})

test('contributions: the Wall query must filter on status == approved', async () => {
  await ok(getDocs(query(collection(fs(u.anon), 'contributions'), where('status', '==', 'approved'), limit(20))))
  await denied(getDocs(query(collection(fs(u.anon), 'contributions'), limit(20))))
  await denied(getDocs(query(collection(fs(u.anon), 'contributions'), where('status', '==', 'pending'), limit(20))))
  await ok(getDocs(query(collection(fs(u.moderator), 'contributions'), where('status', '==', 'pending'), limit(20))))
})

test('contributions: no client writes at all, not even an admin', async () => {
  await denied(addDoc(collection(fs(u.citizen), 'contributions'), { status: 'approved', uid: 'citizen-1' }))
  await denied(updateDoc(doc(fs(u.citizen), 'contributions/pending-1'), { status: 'approved' }))
  await denied(updateDoc(doc(fs(u.moderator), 'contributions/pending-1'), { status: 'approved' }))
  await denied(updateDoc(doc(fs(u.admin), 'contributions/pending-1'), { status: 'approved' }))
  await denied(deleteDoc(doc(fs(u.admin), 'contributions/approved-1')))
})

test('history: staff read, nobody writes', async () => {
  await ok(getDoc(doc(fs(u.moderator), 'contributions/pending-1/history/h1')))
  await denied(getDoc(doc(fs(u.anon), 'contributions/pending-1/history/h1')))
  await denied(getDoc(doc(fs(u.citizen), 'contributions/pending-1/history/h1')))
  await denied(setDoc(doc(fs(u.admin), 'contributions/pending-1/history/h2'), { action: 'approve' }))
})

test('reports: written by the callable only, read by staff only', async () => {
  await denied(setDoc(doc(fs(u.citizen), 'reports/approved-1_citizen-1'), { contributionId: 'approved-1' }))
  await denied(getDoc(doc(fs(u.citizen), 'reports/approved-1_citizen-2')))
  await denied(getDoc(doc(fs(u.anon), 'reports/approved-1_citizen-2')))
  await ok(getDoc(doc(fs(u.moderator), 'reports/approved-1_citizen-2')))
})

test('blocklist: staff read, editors and admins write, moderators do not', async () => {
  await denied(getDoc(doc(fs(u.anon), 'blocklist/uid:bad')))
  await denied(getDoc(doc(fs(u.citizen), 'blocklist/uid:bad')))
  await ok(getDoc(doc(fs(u.moderator), 'blocklist/uid:bad')))
  await denied(setDoc(doc(fs(u.moderator), 'blocklist/uid:x'), { type: 'uid', uid: 'x' }))
  await ok(setDoc(doc(fs(u.editor), 'blocklist/uid:x'), { type: 'uid', uid: 'x' }))
  await ok(deleteDoc(doc(fs(u.admin), 'blocklist/uid:bad')))
})

test('missions: public name and country, tokens never leave the server', async () => {
  await ok(getDoc(doc(fs(u.anon), 'missions/FR')))
  await denied(getDoc(doc(fs(u.anon), 'missionTokens/FR')))
  await denied(getDoc(doc(fs(u.admin), 'missionTokens/FR')))
  await denied(setDoc(doc(fs(u.admin), 'missionTokens/SN'), { token: 'x' }))
  await denied(updateDoc(doc(fs(u.moderator), 'missions/FR'), { name: 'x' }))
  await denied(updateDoc(doc(fs(u.editor), 'missions/FR'), { name: 'x' }))
  await ok(updateDoc(doc(fs(u.maeiage), 'missions/FR'), { contact: 'paris@example.org' }))
  await ok(updateDoc(doc(fs(u.admin), 'missions/FR'), { name: 'Ambassade de Guinée en France' }))
})

test('config: everyone reads the flags, editors and admins flip them', async () => {
  await ok(getDoc(doc(fs(u.anon), 'config/app')))
  await denied(updateDoc(doc(fs(u.anon), 'config/app'), { degraded: true }))
  await denied(updateDoc(doc(fs(u.citizen), 'config/app'), { degraded: true }))
  await denied(updateDoc(doc(fs(u.moderator), 'config/app'), { degraded: true }))
  await denied(updateDoc(doc(fs(u.maeiage), 'config/app'), { degraded: true }))
  await ok(updateDoc(doc(fs(u.editor), 'config/app'), { degraded: true }))
  await ok(updateDoc(doc(fs(u.admin), 'config/app'), { safeSearch: false }))
})

test('unknown collections are closed', async () => {
  await denied(getDoc(doc(fs(u.admin), 'staff/adm-1')))
  await denied(setDoc(doc(fs(u.admin), 'anything/x'), { a: 1 }))
})
