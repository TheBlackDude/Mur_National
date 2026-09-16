import { onCall, HttpsError } from 'firebase-functions/v2/https'
import type { DocumentReference, DocumentData } from 'firebase-admin/firestore'
import { bucket, db, FieldValue, IMMUTABLE_CACHE, publicUrl, requireRole, rtdb } from './lib.js'

export type ModerateAction = 'approve' | 'reject' | 'review' | 'feature' | 'unfeature' | 'personality' | 'unpersonality' | 'block' | 'unblock'
export type RejectReason = 'inappropriate' | 'not_person' | 'duplicate' | 'minor' | 'other'
type Req = { id: string; action: ModerateAction; reason?: RejectReason; block?: boolean }

const ACTIONS: ModerateAction[] = ['approve', 'reject', 'review', 'feature', 'unfeature', 'personality', 'unpersonality', 'block', 'unblock']
const REASONS: RejectReason[] = ['inappropriate', 'not_person', 'duplicate', 'minor', 'other']
const EDITOR_ACTIONS: ModerateAction[] = ['feature', 'unfeature', 'personality', 'unpersonality', 'block', 'unblock']

/** Who did it. `system` is used by the kiosk auto-approve path in onPhotoUploaded. */
export type Audit = { by: string; byEmail: string | null }

/**
 * The only path from pending/review to approved: publishes the staging renditions to public/ and thumbs/,
 * stamps the URLs and increments the counters. Idempotent when the item is already approved.
 * Shared by the moderate callable and the kiosk auto-approve rule.
 */
export async function approveContribution(ref: DocumentReference, c: DocumentData, audit: Audit): Promise<void> {
  if (c.status === 'approved') return
  if (!c.files?.thumb || !c.files?.public) throw new HttpsError('failed-precondition', 'Still processing, retry in a few seconds')
  const id = ref.id
  const thumbPath = `thumbs/${id}.jpg`, publicPath = `public/${id}.jpg`
  // Video selfies: the clip goes public next to its poster, keeping its extension.
  const videoPath = typeof c.files?.video === 'string' && c.files.video ? `public/${id}.${videoExt(c.files.video)}` : null
  const immutable = { cacheControl: IMMUTABLE_CACHE }
  await Promise.all([
    bucket().file(c.files.thumb).copy(bucket().file(thumbPath), immutable),
    bucket().file(c.files.public).copy(bucket().file(publicPath), immutable),
    ...(videoPath ? [bucket().file(c.files.video).copy(bucket().file(videoPath), immutable)] : []),
  ])
  await ref.update({
    status: 'approved',
    'files.thumb': thumbPath, 'files.public': publicPath,
    thumbUrl: publicUrl(thumbPath), publicUrl: publicUrl(publicPath),
    ...(videoPath ? { 'files.video': videoPath, videoUrl: publicUrl(videoPath) } : {}),
    ...stamp(audit),
  })
  await bump(c, +1)
  await history(ref, 'approve', audit)
}

export const moderate = onCall<Req>(async (req) => {
  const auth = requireRole(req, 'moderator', 'editor')
  const { id, action } = req.data ?? ({} as Req)
  if (!id || typeof id !== 'string') throw new HttpsError('invalid-argument', 'id required')
  if (!ACTIONS.includes(action)) throw new HttpsError('invalid-argument', 'Unknown action')
  const reason = req.data.reason
  if (action === 'reject' && !REASONS.includes(reason as RejectReason)) throw new HttpsError('invalid-argument', 'Bad reason')
  if (reason !== undefined && !REASONS.includes(reason)) throw new HttpsError('invalid-argument', 'Bad reason')
  const block = !!req.data.block

  const ref = db.doc(`contributions/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No such contribution')
  const c = snap.data()!

  // Level 2 decisions are for editors: anything on a reviewed item, editorial switches, and device blocks.
  const isEditor = auth.token.editor === true || auth.token.admin === true
  if ((EDITOR_ACTIONS.includes(action) || c.status === 'review' || block) && !isEditor) {
    throw new HttpsError('permission-denied', 'Editor role required')
  }

  const audit: Audit = { by: auth.uid, byEmail: (auth.token.email as string | undefined) ?? null }

  switch (action) {
    case 'approve':
      await approveContribution(ref, c, audit)
      return { ok: true }

    case 'reject': {
      const wasApproved = c.status === 'approved'
      await ref.update({ status: 'rejected', rejectReason: reason, ...stamp(audit) })
      if (wasApproved) {
        await bump(c, -1)
        await Promise.allSettled([
          bucket().file(`thumbs/${id}.jpg`).delete(),
          bucket().file(`public/${id}.jpg`).delete(),
          ...(typeof c.files?.video === 'string' && c.files.video.startsWith('public/') ? [bucket().file(c.files.video).delete()] : []),
        ])
      }
      if (block) await blockDevice(c.uid, reason ?? 'moderation', audit)
      await history(ref, 'reject', audit, reason, block)
      return { ok: true }
    }

    case 'review':
      await ref.update({ status: 'review', reviewReason: c.reviewReason ?? 'manual', ...stamp(audit) })
      if (c.status === 'approved') await bump(c, -1)
      await history(ref, 'review', audit, reason)
      return { ok: true }

    case 'feature':
    case 'unfeature':
      await ref.update({ featured: action === 'feature', ...stamp(audit) })
      await history(ref, action, audit)
      return { ok: true }

    case 'personality':
    case 'unpersonality':
      await ref.update({ personality: action === 'personality', ...stamp(audit) })
      await history(ref, action, audit)
      return { ok: true }

    case 'block':
      await blockDevice(c.uid, reason ?? 'moderation', audit)
      await ref.update(stamp(audit))
      await history(ref, 'block', audit, reason, true)
      return { ok: true }

    case 'unblock':
      await db.doc(`blocklist/uid:${c.uid}`).delete()
      await ref.update(stamp(audit))
      await history(ref, 'unblock', audit)
      return { ok: true }
  }
})

const videoExt = (p: string) => (p.match(/\.(mp4|webm|mov)$/i)?.[1] ?? 'mp4').toLowerCase()

const stamp = (a: Audit) => ({ moderatedBy: a.by, moderatedByEmail: a.byEmail, moderatedAt: FieldValue.serverTimestamp() })

/** Per-item audit trail, readable by staff: contributions/{id}/history/{auto}. */
export function history(ref: DocumentReference, action: ModerateAction, a: Audit, reason?: RejectReason | string, block = false) {
  return ref.collection('history').add({ action, reason: reason ?? null, block, by: a.by, byEmail: a.byEmail, at: FieldValue.serverTimestamp() })
}

async function blockDevice(uid: string, reason: string, a: Audit) {
  await db.doc(`blocklist/uid:${uid}`).set({ type: 'uid', uid, reason, by: a.by, byEmail: a.byEmail, createdAt: FieldValue.serverTimestamp() })
}

/**
 * National + prefecture or country counters in one multi-path RTDB update.
 * An approval (+1) also feeds the dashboard: stats/hourly/{UTC hour} and a moderation-latency
 * histogram stats/latencyHist/{UTC hour}/{bucket}. Approvals are events, so -1 never touches stats.
 */
export async function bump(c: DocumentData, delta: 1 | -1) {
  const updates: Record<string, object> = { 'counters/national': increment(delta) }
  if (c.prefecture) updates[`counters/prefectures/${c.prefecture}`] = increment(delta)
  if (c.country) updates[`counters/countries/${c.country}`] = increment(delta)
  if (delta === 1) {
    const hour = hourKey(new Date())
    updates[`stats/hourly/${hour}`] = increment(1)
    const created: Date | undefined = typeof c.createdAt?.toDate === 'function' ? c.createdAt.toDate() : undefined
    if (created) updates[`stats/latencyHist/${hour}/${latencyBucket((Date.now() - created.getTime()) / 60_000)}`] = increment(1)
  }
  await rtdb.ref().update(updates)
}
const increment = (n: number) => ({ '.sv': { increment: n } })

/** YYYYMMDDHH in UTC: sortable, and the dashboard rebuilds the last 48 keys the same way. */
export function hourKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`
}

export type LatencyBucket = 'lt5' | 'lt15' | 'lt30' | 'lt60' | 'lt120' | 'ge120'
export function latencyBucket(minutes: number): LatencyBucket {
  if (minutes < 5) return 'lt5'
  if (minutes < 15) return 'lt15'
  if (minutes < 30) return 'lt30'
  if (minutes < 60) return 'lt60'
  if (minutes < 120) return 'lt120'
  return 'ge120'
}
