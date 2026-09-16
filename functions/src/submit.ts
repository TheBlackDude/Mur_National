import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { timingSafeEqual } from 'node:crypto'
import { bucket, checkRate, db, FieldValue, isBlocked, nextParticipantNumber, requireAuth } from './lib.js'
import { finishIfAlreadyProcessed } from './onPhotoUploaded.js'
import { PREFECTURE_CODES, REGION_OF } from './prefectures.js'

type Req = {
  path: string
  frame: 'A' | 'B' | 'C'
  prefecture?: string
  country?: string
  kiosk?: boolean
  consent: { public: true; minorSupervised?: boolean }
  /** Video selfie: `path` is the framed poster JPEG, `videoPath` the 40–90 s clip with the same id. */
  type?: 'photo' | 'video'
  videoPath?: string
  durationSec?: number
  /** Set when the studio was opened from a diplomatic mission link (/selfie?mission=XX&t=…). */
  mission?: string
  token?: string
}

const VIDEO_EXT = /\.(mp4|webm|mov)$/i
const VIDEO_MAX_BYTES = 80 * 1024 * 1024
const VIDEO_MIN_SEC = 40, VIDEO_MAX_SEC = 90

/** Same check as video.ts: the public mission doc plus the private token, compared in constant time. */
async function verifyMission(code: unknown, token: unknown): Promise<string> {
  if (typeof code !== 'string' || !/^[A-Z0-9-]{2,20}$/.test(code)) throw new HttpsError('invalid-argument', 'Bad mission')
  if (typeof token !== 'string' || token.length < 8 || token.length > 128) throw new HttpsError('permission-denied', 'Bad token')
  const [pub, secret] = await Promise.all([db.doc(`missions/${code}`).get(), db.doc(`missionTokens/${code}`).get()])
  if (!pub.exists || !secret.exists) throw new HttpsError('not-found', 'No such mission')
  const a = Buffer.from(token), b = Buffer.from(String(secret.data()?.token ?? ''))
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpsError('permission-denied', 'Bad token')
  return code
}

/**
 * Creates the pending contribution and returns the participant number in ~1 s.
 * Image processing (thumb, rendition, pHash, SafeSearch) happens in onPhotoUploaded on the JPEG;
 * for a video selfie that JPEG is the framed poster and the clip is published at approval.
 */
// Two warm instances for the week (24 Sept → 3 Oct): the D7 load test put p95 at 4 s only because of cold starts
// (median 1.35 s). Idle instances cost a few dollars a week each; set back to 0 after 3 Oct.
export const submitContribution = onCall<Req>({ minInstances: 2 }, async (req) => {
  const { uid, token } = requireAuth(req)
  const d = req.data
  if (!d?.path?.startsWith(`uploads/${uid}/`) || !d.path.endsWith('.jpg') || d.path.includes('..')) throw new HttpsError('invalid-argument', 'Bad path')
  if (!['A', 'B', 'C'].includes(d.frame)) throw new HttpsError('invalid-argument', 'Bad frame')
  if (!d.consent?.public) throw new HttpsError('failed-precondition', 'Consent required')
  if (!!d.prefecture === !!d.country) throw new HttpsError('invalid-argument', 'Exactly one of prefecture or country')
  if (d.prefecture && !PREFECTURE_CODES.has(d.prefecture)) throw new HttpsError('invalid-argument', 'Unknown prefecture')
  const type: 'photo' | 'video' = d.type === 'video' ? 'video' : 'photo'

  let videoPath: string | null = null
  let durationSec: number | null = null
  if (type === 'video') {
    const vp = typeof d.videoPath === 'string' ? d.videoPath : ''
    const id = d.path.slice(`uploads/${uid}/`.length, -'.jpg'.length)
    if (!vp.startsWith(`uploads/${uid}/${id}.`) || !VIDEO_EXT.test(vp) || vp.includes('..')) throw new HttpsError('invalid-argument', 'Bad video path')
    durationSec = Math.round(Number(d.durationSec))
    if (!Number.isFinite(durationSec) || durationSec < VIDEO_MIN_SEC || durationSec > VIDEO_MAX_SEC) throw new HttpsError('failed-precondition', 'Duration out of range')
    videoPath = vp
  }

  // A mission link tags the contribution for the per-mission counts; a bad token is refused outright.
  const mission = d.mission || d.token ? await verifyMission(d.mission, d.token) : null

  if (await isBlocked(`uid:${uid}`)) throw new HttpsError('permission-denied', 'Blocked')

  // Kiosk mode is only honoured for staff-signed devices; citizens get the standard ceiling.
  // A mission phone (token-gated) serves many people in a row, so it gets the kiosk ceiling too.
  const kiosk = !!d.kiosk && (token.moderator === true || token.kiosk === true)
  await checkRate(uid, kiosk || mission ? 20 : 5, 'selfie')

  const [exists] = await bucket().file(d.path).exists()
  if (!exists) throw new HttpsError('not-found', 'Upload not found')

  let sizeBytes: number | null = null
  if (videoPath) {
    const file = bucket().file(videoPath)
    const [vExists] = await file.exists()
    if (!vExists) throw new HttpsError('not-found', 'Video upload not found')
    const [meta] = await file.getMetadata()
    sizeBytes = Number(meta.size ?? 0)
    const contentType = String(meta.contentType ?? '')
    if (sizeBytes > VIDEO_MAX_BYTES || !contentType.startsWith('video/')) {
      await Promise.allSettled([file.delete(), bucket().file(d.path).delete()])
      throw new HttpsError('invalid-argument', 'Not a video under 80 MB')
    }
  }

  const participantNumber = await nextParticipantNumber()
  const ref = db.collection('contributions').doc()
  await ref.set({
    uid,
    participantNumber,
    type,
    status: 'pending',
    frame: d.frame,
    prefecture: d.prefecture ?? null,
    region: d.prefecture ? (REGION_OF[d.prefecture] ?? null) : null, // the Wall's « Région » filter queries this field
    country: d.country ?? null,
    isDiaspora: !!d.country,
    mission,
    kiosk,
    consent: { public: true, minorSupervised: kiosk && !!d.consent.minorSupervised, at: FieldValue.serverTimestamp() },
    files: { original: d.path, video: videoPath, public: null, thumb: null },
    durationSec,
    sizeBytes,
    phash: null,
    safeSearch: null,
    duplicateOf: null,
    reviewReason: null,
    priority: 0,
    featured: false,
    personality: false,
    reports: 0,
    createdAt: FieldValue.serverTimestamp(),
  })
  // If the poster was processed before this doc existed, complete the processing now (never blocks the answer on failure).
  await finishIfAlreadyProcessed(ref, d.path).catch((e) => console.warn('finishIfAlreadyProcessed', e))
  return { id: ref.id, participantNumber }
})
