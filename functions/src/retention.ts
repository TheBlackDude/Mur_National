import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { bucket, db, FieldValue } from './lib.js'

/**
 * Retention (day 60): the personal originals are deleted, the Wall stays.
 *
 * Every day at 04:00 Conakry the job deletes every object older than `config/app.retention.days` (default 60)
 * under uploads/ (framed selfies and video-selfie clips as sent by the phone), videos/ (diaspora films, already
 * copied to the film editors' Drive by exportSelected) and staging/ (renditions kept for moderation). public/ and
 * thumbs/ are never touched: an approved selfie keeps its place on the Wall. The matching contribution documents
 * lose the dangling paths (files.original, files.video, staging thumb/public) and get `purgedAt`, so /admin and
 * the exports never point at a deleted object. Idempotent: a second run finds nothing.
 *
 * config/app.retention: { days?: number (>= 7, default 60), enabled?: boolean (default true), dryRun?: boolean }.
 *
 * The same run purges the invitation guest photos (events/{id}/guests.photo, data URLs shown to the gate agents):
 * once `events.photoPurgeOn` (ISO day set by the Cabinet, 7 days after the event) is reached, every photo of that
 * event is nulled and the event gets `photosPurgedAt`. Gate phones drop their offline copy at the next sync.
 */
const PREFIXES = ['uploads/', 'videos/', 'staging/']
const DEFAULT_DAYS = 60
const MIN_DAYS = 7
const DELETE_PARALLEL = 50
const DOC_PAGE = 400

const GUEST_PAGE = 400
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

type RetentionConfig = { days: number; enabled: boolean; dryRun: boolean }
export type RetentionResult = { days: number; cutoff: string; enabled: boolean; dryRun: boolean; deletedFiles: number; deletedBytes: number; updatedDocs: number; purgedPhotoEvents: number; purgedPhotos: number }

export async function retentionConfig(): Promise<RetentionConfig> {
  const r = ((await db.doc('config/app').get()).data()?.retention ?? {}) as Record<string, unknown>
  const days = Number(r.days)
  return {
    days: Number.isFinite(days) && days >= MIN_DAYS ? Math.round(days) : DEFAULT_DAYS,
    enabled: r.enabled !== false,
    dryRun: r.dryRun === true,
  }
}

const isPurgeable = (p: unknown): p is string => typeof p === 'string' && PREFIXES.some((prefix) => p.startsWith(prefix))

/** The field patch for one contribution, or null when nothing on it points at a purged prefix. */
export function purgePatch(c: DocumentData): Record<string, unknown> | null {
  const f = (c.files ?? {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const key of ['original', 'video', 'thumb', 'public']) if (isPurgeable(f[key])) patch[`files.${key}`] = null
  if (Object.keys(patch).length === 0) return null
  patch.purgedAt = FieldValue.serverTimestamp()
  return patch
}

/** Deletes the old objects under one prefix, page by page. Returns count and bytes. */
async function purgePrefix(prefix: string, cutoffMs: number, dryRun: boolean): Promise<{ files: number; bytes: number }> {
  let files = 0, bytes = 0
  let pageToken: string | undefined
  do {
    const [page, , resp] = await bucket().getFiles({ prefix, maxResults: 1000, pageToken, autoPaginate: false })
    const old = page.filter((f) => Date.parse(String(f.metadata.timeCreated ?? '')) < cutoffMs)
    for (let i = 0; i < old.length; i += DELETE_PARALLEL) {
      await Promise.all(old.slice(i, i + DELETE_PARALLEL).map(async (f) => {
        if (!dryRun) await f.delete({ ignoreNotFound: true })
        files++
        bytes += Number(f.metadata.size ?? 0)
      }))
    }
    pageToken = (resp as { nextPageToken?: string } | undefined)?.nextPageToken
  } while (pageToken)
  return { files, bytes }
}

/** Strips the purged paths from every contribution created before the cutoff. */
async function purgeDocs(cutoff: Timestamp, dryRun: boolean): Promise<number> {
  let updated = 0
  let last: QueryDocumentSnapshot | null = null
  for (;;) {
    let q = db.collection('contributions').where('createdAt', '<', cutoff).orderBy('createdAt', 'asc').limit(DOC_PAGE)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    const batch = db.batch()
    let n = 0
    for (const d of snap.docs) {
      const patch = purgePatch(d.data())
      if (!patch) continue
      batch.update(d.ref, patch)
      n++
    }
    if (n && !dryRun) await batch.commit()
    updated += n
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < DOC_PAGE) break
  }
  return updated
}

/** Which events are due: photoPurgeOn reached (Conakry is UTC, so the ISO day of `now` is the local day) and not purged yet. */
export function photoPurgeDue(ev: DocumentData, now: number): boolean {
  const on = ev.photoPurgeOn
  return typeof on === 'string' && ISO_DAY.test(on) && on <= new Date(now).toISOString().slice(0, 10) && !ev.photosPurgedAt
}

/** Nulls the guest photos of every event whose purge day has come. Idempotent: the event is marked, the guests lose the field. */
export async function purgeGuestPhotos(now: number, dryRun: boolean): Promise<{ events: number; photos: number }> {
  const events = await db.collection('events').get()
  let n = 0, photos = 0
  for (const ev of events.docs) {
    if (!photoPurgeDue(ev.data(), now)) continue
    const withPhoto = ev.ref.collection('guests').where('photo', '!=', null)
    let purged = 0
    if (dryRun) purged = (await withPhoto.count().get()).data().count
    else for (;;) {
      const snap = await withPhoto.select().limit(GUEST_PAGE).get() // ids only: the photos themselves are never read
      if (snap.empty) break
      const batch = db.batch()
      for (const d of snap.docs) batch.update(d.ref, { photo: null, photoPurgedAt: FieldValue.serverTimestamp() })
      await batch.commit()
      purged += snap.size
    }
    if (!dryRun) await ev.ref.update({ photosPurgedAt: FieldValue.serverTimestamp(), photosPurged: purged })
    logger.info(dryRun ? 'retention: guest photos due (dry run)' : 'retention: guest photos purged', { eventId: ev.id, code: ev.get('code'), photoPurgeOn: ev.get('photoPurgeOn'), purged })
    n++; photos += purged
  }
  return { events: n, photos }
}

export async function runRetention(now = Date.now()): Promise<RetentionResult> {
  const cfg = await retentionConfig()
  const cutoffMs = now - cfg.days * 86_400_000
  const result: RetentionResult = { ...cfg, cutoff: new Date(cutoffMs).toISOString(), deletedFiles: 0, deletedBytes: 0, updatedDocs: 0, purgedPhotoEvents: 0, purgedPhotos: 0 }
  if (!cfg.enabled) { logger.info('retention: disabled by config/app.retention.enabled', result); return result }
  for (const prefix of PREFIXES) {
    const r = await purgePrefix(prefix, cutoffMs, cfg.dryRun)
    result.deletedFiles += r.files
    result.deletedBytes += r.bytes
  }
  result.updatedDocs = await purgeDocs(Timestamp.fromMillis(cutoffMs), cfg.dryRun)
  const photos = await purgeGuestPhotos(now, cfg.dryRun)
  result.purgedPhotoEvents = photos.events
  result.purgedPhotos = photos.photos
  logger.info(cfg.dryRun ? 'retention (dry run)' : 'retention', result)
  return result
}

export const retention = onSchedule({ schedule: '0 4 * * *', timeZone: 'Africa/Conakry', timeoutSeconds: 540, memory: '512MiB' }, async () => { await runRetention() })
