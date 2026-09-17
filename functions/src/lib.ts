import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getDatabase } from 'firebase-admin/database'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export const db = getFirestore()
export const rtdb = getDatabase()
export const bucket = () => getStorage().bucket()
export { FieldValue }

/** public/, thumbs/ and their staging copies are content-addressed by contribution id and never change: browsers
 *  and Google's edge keep them for a year, so a Wall view costs one request per thumbnail per device, not per visit. */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

export type Role = 'moderator' | 'editor' | 'maeiage' | 'admin'

export function requireAuth(req: CallableRequest) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first')
  return req.auth
}

export function requireRole(req: CallableRequest, ...roles: Role[]) {
  const auth = requireAuth(req)
  const has = roles.some((r) => auth.token[r] === true) || auth.token.admin === true
  if (!has) throw new HttpsError('permission-denied', `Requires ${roles.join(' or ')}`)
  return auth
}

/**
 * Hourly rate limit per uid and per action kept in RTDB: cheap, atomic, auto-expiring by bucket name.
 * `scope` keeps the counters apart: a phone that made three selfies must still be able to send a film video.
 */
export async function checkRate(uid: string, max: number, scope: 'selfie' | 'film' | 'report' = 'selfie') {
  const bucketKey = Math.floor(Date.now() / 3_600_000)
  const ref = rtdb.ref(`rate/${uid}/${scope}/${bucketKey}`)
  const { snapshot } = await ref.transaction((n: number | null) => (n ?? 0) + 1)
  if ((snapshot.val() as number) > max) throw new HttpsError('resource-exhausted', 'Rate limit')
}

/** Next participant number: one RTDB transaction, no Firestore hot document. */
export async function nextParticipantNumber(): Promise<number> {
  const { snapshot } = await rtdb.ref('seq/participant').transaction((n: number | null) => (n ?? 0) + 1)
  return snapshot.val() as number
}

export async function isBlocked(key: string) {
  const d = await db.doc(`blocklist/${key}`).get()
  return d.exists
}

/** Public, long-lived URL for a world-readable Storage object (public/, thumbs/, snapshot/). */
export function publicUrl(path: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media`
}

/**
 * Access token for Google APIs outside Firebase (Sheets, Drive). Gen 2 functions run on Cloud Run as the
 * compute service account; its metadata server mints tokens for the requested scopes. Outside Cloud Run
 * (emulator) fall back to the Admin SDK credential.
 */
export async function googleAccessToken(scopes: string[]): Promise<string> {
  try {
    const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(scopes.join(','))}`
    const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const { access_token } = (await res.json()) as { access_token: string }
      if (access_token) return access_token
    }
  } catch { /* not on Cloud Run */ }
  const { getApp } = await import('firebase-admin/app')
  const cred = getApp().options.credential
  if (!cred) throw new HttpsError('internal', 'No credential for Google APIs')
  return (await cred.getAccessToken()).access_token
}

/** config/app.exports: destinations the editors fill in without a deploy. All optional. */
export async function exportsConfig(): Promise<{ sheetId: string | null; driveFolderId: string | null; alertWebhook: string | null }> {
  const d = (await db.doc('config/app').get()).data()?.exports ?? {}
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return { sheetId: s(d.sheetId), driveFolderId: s(d.driveFolderId), alertWebhook: s(d.alertWebhook) }
}

/**
 * Protocol numbers. The first 60 participant numbers are reserved for the Presidency and the Government (decision of
 * 17 Sept 2026): 1–10 for the Presidency link (1 = the President's photo, 2 = the President's video), 11–60 for the
 * Government link. Everyone else counts from 61. The pool lives in RTDB `protocol/{n} = contribution id`; a number is
 * freed when its contribution is rejected and can be reassigned by an editor (moderate → renumber).
 */
export type Tier = 'president' | 'minister'
export const PROTOCOL_MAX = 60
const PRESIDENCY_MAX = 10
type Pool = Record<string, string>

function candidates(tier: Tier, type: 'photo' | 'video'): number[] {
  if (tier === 'minister') return Array.from({ length: PROTOCOL_MAX - PRESIDENCY_MAX }, (_, i) => PRESIDENCY_MAX + 1 + i)
  const rest = Array.from({ length: PRESIDENCY_MAX - 2 }, (_, i) => 3 + i)
  return [type === 'photo' ? 1 : 2, ...rest]
}

/** First free number for this tier and media type, or null when the range is full (the caller falls back to seq). */
export async function reserveProtocolNumber(tier: Tier, type: 'photo' | 'video', id: string): Promise<number | null> {
  let picked: number | null = null
  const { snapshot } = await rtdb.ref('protocol').transaction((cur: Pool | null) => {
    const pool: Pool = { ...(cur ?? {}) }
    picked = candidates(tier, type).find((n) => !pool[n]) ?? null
    if (picked === null) return cur
    pool[picked] = id
    return pool
  })
  const pool = (snapshot.val() as Pool | null) ?? {}
  return picked !== null && pool[picked] === id ? picked : null
}

/** Editors move a protocol item to an exact number. Throws already-exists when another contribution holds it. */
export async function assignProtocolNumber(id: string, n: number): Promise<void> {
  if (!Number.isInteger(n) || n < 1 || n > PROTOCOL_MAX) throw new HttpsError('invalid-argument', `Number must be 1–${PROTOCOL_MAX}`)
  let taken = false
  await rtdb.ref('protocol').transaction((cur: Pool | null) => {
    const pool: Pool = { ...(cur ?? {}) }
    taken = !!pool[n] && pool[n] !== id
    if (taken) return cur
    for (const k of Object.keys(pool)) if (pool[k] === id) delete pool[k]
    pool[n] = id
    return pool
  })
  if (taken) throw new HttpsError('already-exists', `Number ${n} is taken`)
}

export async function releaseProtocolNumber(id: string): Promise<void> {
  await rtdb.ref('protocol').transaction((cur: Pool | null) => {
    if (!cur) return cur
    const pool: Pool = { ...cur }
    let changed = false
    for (const k of Object.keys(pool)) if (pool[k] === id) { delete pool[k]; changed = true }
    return changed ? pool : cur
  })
}

/** Who holds protocol number `n` right now (contribution id), or null. */
export async function protocolOwner(n: number): Promise<string | null> {
  const s = await rtdb.ref(`protocol/${n}`).get()
  return (s.val() as string | null) ?? null
}
