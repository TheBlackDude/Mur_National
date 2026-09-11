import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getDatabase } from 'firebase-admin/database'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export const db = getFirestore()
export const rtdb = getDatabase()
export const bucket = () => getStorage().bucket()
export { FieldValue }

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

/** Hourly rate limit per uid kept in RTDB: cheap, atomic, auto-expiring by bucket name. */
export async function checkRate(uid: string, max: number) {
  const bucketKey = Math.floor(Date.now() / 3_600_000)
  const ref = rtdb.ref(`rate/${uid}/${bucketKey}`)
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
