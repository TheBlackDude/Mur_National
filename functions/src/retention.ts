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
 */
const PREFIXES = ['uploads/', 'videos/', 'staging/']
const DEFAULT_DAYS = 60
const MIN_DAYS = 7
const DELETE_PARALLEL = 50
const DOC_PAGE = 400

type RetentionConfig = { days: number; enabled: boolean; dryRun: boolean }
export type RetentionResult = { days: number; cutoff: string; enabled: boolean; dryRun: boolean; deletedFiles: number; deletedBytes: number; updatedDocs: number }

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

export async function runRetention(now = Date.now()): Promise<RetentionResult> {
  const cfg = await retentionConfig()
  const cutoffMs = now - cfg.days * 86_400_000
  const result: RetentionResult = { ...cfg, cutoff: new Date(cutoffMs).toISOString(), deletedFiles: 0, deletedBytes: 0, updatedDocs: 0 }
  if (!cfg.enabled) { logger.info('retention: disabled by config/app.retention.enabled', result); return result }
  for (const prefix of PREFIXES) {
    const r = await purgePrefix(prefix, cutoffMs, cfg.dryRun)
    result.deletedFiles += r.files
    result.deletedBytes += r.bytes
  }
  result.updatedDocs = await purgeDocs(Timestamp.fromMillis(cutoffMs), cfg.dryRun)
  logger.info(cfg.dryRun ? 'retention (dry run)' : 'retention', result)
  return result
}

export const retention = onSchedule({ schedule: '0 4 * * *', timeZone: 'Africa/Conakry', timeoutSeconds: 540, memory: '512MiB' }, async () => { await runRetention() })
