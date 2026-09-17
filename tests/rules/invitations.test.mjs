// Invitations protocolaires: events, guests, check-ins and scans (firestore.rules).
import { test, before, after, beforeEach } from 'node:test'
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore'
import { env, who, ok, denied } from './env.mjs'

let t, u
before(async () => { t = await env(); u = who(t) })
after(async () => { await t.cleanup() })
beforeEach(async () => {
  await t.clearFirestore()
  await t.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'events/ev1'), { name: 'Défilé', code: 'DEF', kind: 'parade', venue: 'Palais du Peuple', publicKey: 'PUB', gates: 6 })
    await setDoc(doc(db, 'events/ev1/guests/g1'), { firstName: 'Aïssatou', lastName: 'Sow', status: 'active', photo: null })
    await setDoc(doc(db, 'events/ev1/guests/g2'), { firstName: 'Mamadou', lastName: 'Diallo', status: 'active', photo: null, code: 'ABCD-EFGH', token: 'A68.DEF.g2.ABCD-EFGH.sig' })
    await setDoc(doc(db, 'events/ev1/checkins/g2'), { gate: 2, by: 'gate-2', at: new Date() })
    await setDoc(doc(db, 'eventKeys/ev1'), { privateKey: 'PEM' })
  })
})
const fs = (c) => c.firestore()

test('events: staff of the invitations read them, citizens and moderators do not', async () => {
  await ok(getDoc(doc(fs(u.protocol), 'events/ev1')))
  await ok(getDoc(doc(fs(u.gate), 'events/ev1')))
  await ok(getDoc(doc(fs(u.admin), 'events/ev1')))
  await denied(getDoc(doc(fs(u.moderator), 'events/ev1')))
  await denied(getDoc(doc(fs(u.editor), 'events/ev1')))
  await denied(getDoc(doc(fs(u.citizen), 'events/ev1')))
  await denied(getDoc(doc(fs(u.anon), 'events/ev1')))
})

test('events: the Cabinet edits the sheet but never the code or the key; creation is the callable only', async () => {
  await ok(updateDoc(doc(fs(u.protocol), 'events/ev1'), { venue: 'Palais présidentiel', time: '9 h' }))
  await denied(updateDoc(doc(fs(u.protocol), 'events/ev1'), { code: 'XYZ' }))
  await denied(updateDoc(doc(fs(u.protocol), 'events/ev1'), { publicKey: 'OTHER' }))
  await denied(updateDoc(doc(fs(u.gate), 'events/ev1'), { venue: 'x' }))
  await denied(setDoc(doc(fs(u.protocol), 'events/ev2'), { name: 'x', code: 'DIN', kind: 'dinner', publicKey: 'p' }))
  await denied(setDoc(doc(fs(u.admin), 'events/ev2'), { name: 'x', code: 'DIN', kind: 'dinner', publicKey: 'p' }))
  await denied(deleteDoc(doc(fs(u.admin), 'events/ev1')))
})

test('eventKeys: nobody reads the signing key', async () => {
  await denied(getDoc(doc(fs(u.admin), 'eventKeys/ev1')))
  await denied(getDoc(doc(fs(u.protocol), 'eventKeys/ev1')))
})

test('guests: the Cabinet creates and edits without touching code or token; gates only read', async () => {
  await ok(setDoc(doc(fs(u.protocol), 'events/ev1/guests/g3'), { firstName: 'A', lastName: 'B', status: 'active', photo: null }))
  await denied(setDoc(doc(fs(u.protocol), 'events/ev1/guests/g4'), { firstName: 'A', lastName: 'B', status: 'active', token: 'forged' }))
  await denied(setDoc(doc(fs(u.protocol), 'events/ev1/guests/g5'), { firstName: 'A', lastName: 'B', status: 'active', code: 'ABCD-EFGH' }))
  await ok(updateDoc(doc(fs(u.protocol), 'events/ev1/guests/g2'), { zone: 'Tribune B', status: 'revoked' }))
  await denied(updateDoc(doc(fs(u.protocol), 'events/ev1/guests/g2'), { token: 'other' }))
  await denied(updateDoc(doc(fs(u.protocol), 'events/ev1/guests/g2'), { code: 'ZZZZ-ZZZZ' }))
  await ok(getDocs(collection(fs(u.gate), 'events/ev1/guests')))
  await denied(updateDoc(doc(fs(u.gate), 'events/ev1/guests/g1'), { zone: 'x' }))
  await denied(getDoc(doc(fs(u.moderator), 'events/ev1/guests/g1')))
  await denied(getDoc(doc(fs(u.citizen), 'events/ev1/guests/g1')))
})

test('guests: deletion only while no card was issued', async () => {
  await ok(deleteDoc(doc(fs(u.protocol), 'events/ev1/guests/g1')))
  await denied(deleteDoc(doc(fs(u.protocol), 'events/ev1/guests/g2')))
})

test('checkins: first gate creates, a second create is refused, gates never change one', async () => {
  await ok(setDoc(doc(fs(u.gate), 'events/ev1/checkins/g1'), { gate: 1, by: 'gate-1', at: new Date() }))
  await denied(setDoc(doc(fs(u.gate2), 'events/ev1/checkins/g1'), { gate: 3, by: 'gate-2', at: new Date() }))
  await denied(setDoc(doc(fs(u.gate), 'events/ev1/checkins/g3'), { gate: 1, by: 'someone-else', at: new Date() }))
  await denied(updateDoc(doc(fs(u.gate2), 'events/ev1/checkins/g2'), { gate: 9 }))
  await denied(deleteDoc(doc(fs(u.gate2), 'events/ev1/checkins/g2')))
  await ok(deleteDoc(doc(fs(u.protocol), 'events/ev1/checkins/g2'))) // the Cabinet can lift an entry after verification
  await ok(getDocs(collection(fs(u.gate), 'events/ev1/checkins')))
  await denied(getDocs(collection(fs(u.editor), 'events/ev1/checkins')))
})

test('scans: gates append their own scans, nothing else', async () => {
  await ok(addDoc(collection(fs(u.gate), 'events/ev1/scans'), { result: 'refused', reason: 'already', guestId: 'g2', gate: 1, by: 'gate-1', at: new Date() }))
  await denied(addDoc(collection(fs(u.gate), 'events/ev1/scans'), { result: 'admitted', guestId: 'g1', gate: 1, by: 'gate-2', at: new Date() }))
  await denied(addDoc(collection(fs(u.citizen), 'events/ev1/scans'), { result: 'admitted', guestId: 'g1', gate: 1, by: 'citizen-1', at: new Date() }))
})
