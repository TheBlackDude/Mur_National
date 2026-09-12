import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { bucket, checkRate, db, FieldValue, isBlocked, nextParticipantNumber, requireAuth } from './lib.js'

type Req = {
  path: string
  frame: 'A' | 'B' | 'C'
  prefecture?: string
  country?: string
  kiosk?: boolean
  consent: { public: true; minorSupervised?: boolean }
}

const REGION_BY_PREFECTURE_PREFIX: Record<string, string> = { CKY: 'Conakry' }

/**
 * Creates the pending contribution and returns the participant number in ~1 s.
 * Image processing (thumb, rendition, pHash, SafeSearch) happens in onPhotoUploaded.
 */
export const submitContribution = onCall<Req>(async (req) => {
  const { uid, token } = requireAuth(req)
  const d = req.data
  if (!d?.path?.startsWith(`uploads/${uid}/`) || !d.path.endsWith('.jpg')) throw new HttpsError('invalid-argument', 'Bad path')
  if (!['A', 'B', 'C'].includes(d.frame)) throw new HttpsError('invalid-argument', 'Bad frame')
  if (!d.consent?.public) throw new HttpsError('failed-precondition', 'Consent required')
  if (!!d.prefecture === !!d.country) throw new HttpsError('invalid-argument', 'Exactly one of prefecture or country')

  if (await isBlocked(`uid:${uid}`)) throw new HttpsError('permission-denied', 'Blocked')

  // Kiosk mode is only honoured for staff-signed devices; citizens get the standard ceiling.
  const kiosk = !!d.kiosk && (token.moderator === true || token.kiosk === true)
  await checkRate(uid, kiosk ? 20 : 5)

  const [exists] = await bucket().file(d.path).exists()
  if (!exists) throw new HttpsError('not-found', 'Upload not found')

  const participantNumber = await nextParticipantNumber()
  const ref = db.collection('contributions').doc()
  await ref.set({
    uid,
    participantNumber,
    type: 'photo',
    status: 'pending',
    frame: d.frame,
    prefecture: d.prefecture ?? null,
    region: d.prefecture ? (REGION_BY_PREFECTURE_PREFIX[d.prefecture.split('-')[0]] ?? null) : null, // filled properly by onPhotoUploaded from the prefecture table
    country: d.country ?? null,
    isDiaspora: !!d.country,
    kiosk,
    consent: { public: true, minorSupervised: kiosk && !!d.consent.minorSupervised, at: FieldValue.serverTimestamp() },
    files: { original: d.path, public: null, thumb: null },
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
  return { id: ref.id, participantNumber }
})
