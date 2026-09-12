import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { timingSafeEqual } from 'node:crypto'
import { bucket, checkRate, db, FieldValue, nextParticipantNumber, requireAuth, requireRole } from './lib.js'

const MAX_BYTES = 150 * 1024 * 1024
const MIN_SEC = 55, MAX_SEC = 95
const EXT = /\.(mp4|mov|webm)$/i

type Mission = { code: string; name: string; country: string; contact: string | null }

/** Looks up the public mission doc and checks the token stored in missionTokens (Admin SDK only). */
async function verifyMission(code: unknown, token: unknown): Promise<Mission> {
  if (typeof code !== 'string' || !/^[A-Z0-9-]{2,20}$/.test(code)) throw new HttpsError('invalid-argument', 'Bad mission')
  if (typeof token !== 'string' || token.length < 8 || token.length > 128) throw new HttpsError('permission-denied', 'Bad token')
  const [pub, secret] = await Promise.all([db.doc(`missions/${code}`).get(), db.doc(`missionTokens/${code}`).get()])
  if (!pub.exists || !secret.exists) throw new HttpsError('not-found', 'No such mission')
  const expected = String(secret.data()?.token ?? '')
  const a = Buffer.from(token), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpsError('permission-denied', 'Bad token')
  const m = pub.data()!
  return { code, name: String(m.name ?? code), country: String(m.country ?? ''), contact: m.contact ? String(m.contact) : null }
}

/** Validates a mission link before the citizen uploads anything. */
export const missionInfo = onCall<{ mission: string; token: string }>(async (req) => {
  requireAuth(req)
  return verifyMission(req.data?.mission, req.data?.token)
})

type SubmitReq = { path: string; mission: string; token: string; durationSec: number; firstName?: string; city?: string; consent: { film: true } }

/** Registers an uploaded diaspora video as a contribution of type 'video' with its own participant number. */
export const submitVideo = onCall<SubmitReq>(async (req) => {
  const { uid } = requireAuth(req)
  const d = req.data ?? ({} as SubmitReq)
  const path = typeof d.path === 'string' ? d.path : ''
  if (!path.startsWith(`videos/${d.mission}/`) || !EXT.test(path) || path.includes('..')) throw new HttpsError('invalid-argument', 'Bad path')

  let mission: Mission
  try { mission = await verifyMission(d.mission, d.token) }
  catch (e) { await bucket().file(path).delete().catch(() => {}); throw e }

  if (d.consent?.film !== true) throw new HttpsError('failed-precondition', 'Consent required')
  const durationSec = Number(d.durationSec)
  if (!Number.isFinite(durationSec) || durationSec < MIN_SEC || durationSec > MAX_SEC) throw new HttpsError('failed-precondition', 'Duration out of range')
  await checkRate(uid, 3)

  const file = bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'Upload not found')
  const [meta] = await file.getMetadata()
  const sizeBytes = Number(meta.size ?? 0)
  const contentType = String(meta.contentType ?? '')
  if (sizeBytes > MAX_BYTES || !contentType.startsWith('video/')) {
    await file.delete().catch(() => {})
    throw new HttpsError('invalid-argument', 'Not a video under 150 MB')
  }

  const participantNumber = await nextParticipantNumber()
  const ref = db.collection('contributions').doc()
  await ref.set({
    uid, participantNumber,
    type: 'video', status: 'received',
    mission: mission.code, country: mission.country, isDiaspora: true,
    firstName: clean(d.firstName, 40), city: clean(d.city, 60),
    durationSec: Math.round(durationSec),
    files: { original: path }, sizeBytes, contentType,
    selected: false, tags: [], notes: '', exportedAt: null,
    consent: { film: true, at: FieldValue.serverTimestamp() },
    createdAt: FieldValue.serverTimestamp(),
  })
  return { id: ref.id, participantNumber }
})

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null

type SelectReq = { id: string; selected?: boolean; tags?: string[]; notes?: string }

/** MAEIAGE selectors mark, tag and annotate videos. Only the provided fields change. */
export const selectVideo = onCall<SelectReq>(async (req) => {
  const auth = requireRole(req, 'maeiage', 'editor')
  const { id } = req.data ?? ({} as SelectReq)
  if (!id || typeof id !== 'string') throw new HttpsError('invalid-argument', 'id required')
  const ref = db.doc(`contributions/${id}`)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.type !== 'video') throw new HttpsError('not-found', 'No such video')

  const patch: Record<string, unknown> = {}
  if (typeof req.data.selected === 'boolean') patch.selected = req.data.selected
  if (Array.isArray(req.data.tags)) {
    if (req.data.tags.length > 10 || req.data.tags.some((t) => typeof t !== 'string' || t.length > 30)) throw new HttpsError('invalid-argument', 'Bad tags')
    patch.tags = Array.from(new Set(req.data.tags))
  }
  if (typeof req.data.notes === 'string') {
    if (req.data.notes.length > 500) throw new HttpsError('invalid-argument', 'Notes too long')
    patch.notes = req.data.notes
  }
  if (Object.keys(patch).length === 0) throw new HttpsError('invalid-argument', 'Nothing to update')
  await ref.update({ ...patch, selectedBy: auth.uid, selectedByEmail: (auth.token.email as string | undefined) ?? null, selectedAt: FieldValue.serverTimestamp() })
  return { ok: true }
})
