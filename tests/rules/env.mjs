// Shared emulator harness for the three rule sets. `firebase emulators:exec` sets the *_EMULATOR_HOST variables.
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'

const root = new URL('../../', import.meta.url)
const read = (f) => readFileSync(new URL(f, root), 'utf8')
const hostPort = (v, defPort) => { const [host, port] = (v ?? `127.0.0.1:${defPort}`).split(':'); return { host, port: Number(port) } }

export const PROJECT = 'guinea68'
export const BUCKET = 'guinea68.firebasestorage.app'

export async function env() {
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: read('firestore.rules'), ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080) },
    storage: { rules: read('storage.rules'), ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199) },
    database: { rules: read('database.rules.json'), ...hostPort(process.env.FIREBASE_DATABASE_EMULATOR_HOST, 9000) },
  })
}

/** Contexts by role. Custom claims are what the rules read; `moderator` is L1, `editor` L2, `maeiage` video selection. */
/** Storage contexts need the bucket spelled out: the emulator serves any bucket, the client SDK needs a name. */
export const storageOf = (ctx) => ctx.storage(`gs://${BUCKET}`)

export const who = (t) => ({
  anon: t.unauthenticatedContext(),
  citizen: t.authenticatedContext('citizen-1', { firebase: { sign_in_provider: 'anonymous' } }),
  other: t.authenticatedContext('citizen-2', { firebase: { sign_in_provider: 'anonymous' } }),
  moderator: t.authenticatedContext('mod-1', { moderator: true, email: 'mod@example.com' }),
  editor: t.authenticatedContext('ed-1', { editor: true, email: 'ed@example.com' }),
  maeiage: t.authenticatedContext('mae-1', { maeiage: true, email: 'mae@example.com' }),
  admin: t.authenticatedContext('adm-1', { admin: true, email: 'adm@example.com' }),
  protocol: t.authenticatedContext('prot-1', { protocol: true, email: 'prot@example.com' }),
  gate: t.authenticatedContext('gate-1', { gate: true, email: 'gate@example.com' }),
  gate2: t.authenticatedContext('gate-2', { gate: true, email: 'gate2@example.com' }),
})

export const ok = assertSucceeds
export const denied = assertFails
