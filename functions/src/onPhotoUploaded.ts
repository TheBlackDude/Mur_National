import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { logger } from 'firebase-functions/v2'
import { getApp } from 'firebase-admin/app'
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore'
import sharp from 'sharp'
import { bucket, db, FieldValue, IMMUTABLE_CACHE } from './lib.js'
import { approveContribution } from './moderate.js'

type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY'
export type SafeSearch = { adult: Likelihood; spoof: Likelihood; medical: Likelihood; violence: Likelihood; racy: Likelihood }
type ReviewReason = 'duplicate' | 'safesearch' | null

const FLAGGED: Likelihood[] = ['LIKELY', 'VERY_LIKELY']
const DUPLICATE_WINDOW_MS = 48 * 3_600_000

/**
 * Runs after every upload under uploads/{uid}/. Produces the thumbnail and the 1080 px rendition
 * in staging paths, computes a perceptual hash and a Vision SafeSearch verdict, and writes them on
 * the matching contribution document. Routing (S6.7): duplicates and adult/violence hits go to L2
 * review, clean kiosk items get the L1 fast lane, and nothing is auto-approved unless
 * config/app.kioskAutoApprove is on. Files only become public at approval (moderate.ts).
 */
// cpu 1 + concurrency 4: with the default fractional CPU an instance processes one photo at a time, so 50 instances
// cap at ~25 photos/s. Four sharp pipelines fit in 1 GiB (a 1600 px JPEG decodes to ~10 MB); 100 instances leave margin.
export const onPhotoUploaded = onObjectFinalized({ memory: '1GiB', cpu: 1, concurrency: 4, maxInstances: 100, timeoutSeconds: 60 }, async (event) => {
  const path = event.data.name
  if (!path?.startsWith('uploads/') || !path.endsWith('.jpg')) return
  if (event.data.contentType !== 'image/jpeg') return

  const [buf] = await bucket().file(path).download()
  const id = idFromPath(path)
  const rendition = await renderRenditions(buf, id)
  const analysis = await analyze(buf, rendition)

  // The doc may not exist yet if the callable is still running (a video clip can take minutes on 3G to
  // arrive after its poster): retry briefly, then leave it to submitContribution, which calls
  // finishIfAlreadyProcessed once the doc exists.
  const q = db.collection('contributions').where('files.original', '==', path).limit(1)
  for (let i = 0; i < 6; i++) {
    const snap = await q.get()
    if (!snap.empty) { await annotate(snap.docs[0].ref, id, analysis); return }
    await new Promise((r) => setTimeout(r, 1500))
  }
  logger.info('onPhotoUploaded: no contribution yet, renditions staged', { path })
})

export const idFromPath = (path: string) => path.replace(/^uploads\//, '').replace(/\.jpg$/, '').split('/')[1]

/** Thumbnail + 1080 rendition into staging/. Returns the rendition buffer for SafeSearch. */
export async function renderRenditions(buf: Buffer, id: string): Promise<Buffer> {
  const [thumb, rendition] = await Promise.all([
    sharp(buf).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer(),
    sharp(buf).rotate().resize(1080, 1080, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(),
  ])
  await Promise.all([
    bucket().file(`staging/thumbs/${id}.jpg`).save(thumb, { contentType: 'image/jpeg', metadata: { cacheControl: IMMUTABLE_CACHE } }),
    bucket().file(`staging/public/${id}.jpg`).save(rendition, { contentType: 'image/jpeg', metadata: { cacheControl: IMMUTABLE_CACHE } }),
  ])
  return rendition
}

type Config = { safeSearch: boolean; kioskAutoApprove: boolean; autoApproveClean: boolean }
type Analysis = { phash: string; safeSearch: SafeSearch | null; config: Config }

export async function analyze(buf: Buffer, rendition: Buffer): Promise<Analysis> {
  const config = await appConfig()
  const [phash, safeSearch] = await Promise.all([
    averageHash(buf),
    config.safeSearch ? safeSearchDetect(rendition) : Promise.resolve(null),
  ])
  return { phash, safeSearch, config }
}

/** Writes the analysis and routing (S6.7) on the contribution. Idempotent. */
export async function annotate(ref: DocumentReference, id: string, { phash, safeSearch, config }: Analysis): Promise<void> {
  const snap = await ref.get()
  const c = snap.data()
  if (!c) return
  const duplicateOf = await findDuplicate(phash, ref.id)
  const flagged = safeSearch !== null && (FLAGGED.includes(safeSearch.adult) || FLAGGED.includes(safeSearch.violence))
  const clean = safeSearch !== null && !FLAGGED.includes(safeSearch.adult) && !FLAGGED.includes(safeSearch.violence) && !FLAGGED.includes(safeSearch.racy)
  const reviewReason: ReviewReason = duplicateOf ? 'duplicate' : flagged ? 'safesearch' : null
  const kiosk = c.kiosk === true
  // Protocol items (Presidency / Government) stay on top of every queue and never take the automatic paths.
  const priority = c.vip ? 2 : kiosk && clean ? 1 : 0

  await ref.update({
    phash, duplicateOf, safeSearch, reviewReason, priority,
    'files.thumb': `staging/thumbs/${id}.jpg`,
    'files.public': `staging/public/${id}.jpg`,
    ...(reviewReason && c.status === 'pending' ? { status: 'review' } : {}),
    processedAt: FieldValue.serverTimestamp(),
  })

  // Auto-approval paths (both off by default): clean kiosk items, or every clean item when config/app.autoApproveClean
  // is on — the volume lever for the week if the moderation backlog outgrows the team. Duplicates always wait for L2.
  const auto = (config.kioskAutoApprove && kiosk) || config.autoApproveClean
  if (auto && clean && !duplicateOf && c.status === 'pending' && !c.vip) {
    const fresh = (await ref.get()).data()!
    await approveContribution(ref, fresh, { by: 'system', byEmail: null })
  }
}

/**
 * Called by submitContribution right after the doc is created: if onPhotoUploaded already staged the
 * renditions but found no doc (slow client, slow clip upload), finish the job now.
 */
export async function finishIfAlreadyProcessed(ref: DocumentReference, originalPath: string): Promise<void> {
  const id = idFromPath(originalPath)
  const thumb = bucket().file(`staging/thumbs/${id}.jpg`)
  const [exists] = await thumb.exists()
  if (!exists) return
  const [buf] = await bucket().file(originalPath).download()
  const [rendition] = await bucket().file(`staging/public/${id}.jpg`).download().catch(() => [buf] as [Buffer])
  await annotate(ref, id, await analyze(buf, rendition))
}

/** Feature flags editors can flip without a deploy. Defaults are the safe ones. */
async function appConfig(): Promise<Config> {
  try {
    const d = (await db.doc('config/app').get()).data() ?? {}
    return { safeSearch: d.safeSearch !== false, kioskAutoApprove: d.kioskAutoApprove === true, autoApproveClean: d.autoApproveClean === true }
  } catch (e) {
    logger.warn('config/app unreadable, using defaults', e)
    return { safeSearch: true, kioskAutoApprove: false, autoApproveClean: false }
  }
}

/** Vision SafeSearch on the 1080 rendition. Any failure returns null so the pipeline never blocks on it. */
async function safeSearchDetect(image: Buffer): Promise<SafeSearch | null> {
  try {
    const cred = getApp().options.credential
    if (!cred) throw new Error('no credential on the admin app')
    const { access_token } = await cred.getAccessToken()
    const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: image.toString('base64') }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }] }),
    })
    if (!res.ok) throw new Error(`Vision ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = (await res.json()) as { responses?: { safeSearchAnnotation?: Partial<SafeSearch>; error?: { message?: string } }[] }
    const r = body.responses?.[0]
    if (!r || r.error || !r.safeSearchAnnotation) throw new Error(r?.error?.message ?? 'empty SafeSearch response')
    const a = r.safeSearchAnnotation
    return { adult: a.adult ?? 'UNKNOWN', spoof: a.spoof ?? 'UNKNOWN', medical: a.medical ?? 'UNKNOWN', violence: a.violence ?? 'UNKNOWN', racy: a.racy ?? 'UNKNOWN' }
  } catch (e) {
    logger.warn('SafeSearch failed, storing null', { error: String(e) })
    return null
  }
}

/** Exact-hash match among the last 48 h, excluding the item itself. Index: (phash asc, createdAt desc). */
async function findDuplicate(phash: string, selfId: string): Promise<string | null> {
  const since = Timestamp.fromMillis(Date.now() - DUPLICATE_WINDOW_MS)
  const snap = await db.collection('contributions')
    .where('phash', '==', phash)
    .where('createdAt', '>', since)
    .orderBy('createdAt', 'desc')
    .limit(2)
    .get()
  const hit = snap.docs.find((d) => d.id !== selfId)
  return hit ? hit.id : null
}

/** 8×8 average hash: 64-bit hex string. Good enough to catch re-uploads of the same photo. */
async function averageHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).rotate().grayscale().resize(8, 8, { fit: 'fill' }).raw().toBuffer()
  const mean = px.reduce((a, b) => a + b, 0) / px.length
  let bits = ''
  for (const v of px) bits += v > mean ? '1' : '0'
  return BigInt('0b' + bits).toString(16).padStart(16, '0')
}
