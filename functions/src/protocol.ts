import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { timingSafeEqual } from 'node:crypto'
import { db, requireAuth, type Tier } from './lib.js'

/**
 * The two protocol links: /presidence?t=… (PRESIDENCE) and /gouvernement?t=… (GOUVERNEMENT).
 * protocolTokens/{code} = { token, tier } is written by scripts/seed-protocol.mjs and only ever read here (Admin SDK).
 */
export type Protocol = { code: string; tier: Tier }

export async function verifyProtocol(code: unknown, token: unknown): Promise<Protocol> {
  if (typeof code !== 'string' || !/^[A-Z]{4,20}$/.test(code)) throw new HttpsError('invalid-argument', 'Bad protocol code')
  if (typeof token !== 'string' || token.length < 8 || token.length > 128) throw new HttpsError('permission-denied', 'Bad token')
  const doc = await db.doc(`protocolTokens/${code}`).get()
  if (!doc.exists) throw new HttpsError('not-found', 'No such link')
  const d = doc.data()!
  const a = Buffer.from(token), b = Buffer.from(String(d.token ?? ''))
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpsError('permission-denied', 'Bad token')
  const tier: Tier = d.tier === 'president' ? 'president' : 'minister'
  return { code, tier }
}

/** Validates a protocol link before the landing page shows anything. */
export const protocolInfo = onCall<{ code: string; token: string }>(async (req) => {
  requireAuth(req)
  return verifyProtocol(req.data?.code, req.data?.token)
})
