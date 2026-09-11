import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { bucket, db, FieldValue, publicUrl, requireRole, rtdb } from './lib.js'

type Req = { id: string; action: 'approve' | 'reject' | 'feature' | 'unfeature' | 'review'; reason?: string; block?: boolean }

/** The only path from pending/review to approved. Approve publishes the files and increments the counters atomically. */
export const moderate = onCall<Req>(async (req) => {
  const auth = requireRole(req, 'moderator', 'editor')
  const { id, action } = req.data
  const ref = db.doc(`contributions/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No such contribution')
  const c = snap.data()!

  // Level 2 actions are for editors.
  if ((action === 'feature' || action === 'unfeature' || c.status === 'review') && auth.token.editor !== true && auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Editor role required')
  }

  const audit = { moderatedBy: auth.uid, moderatedAt: FieldValue.serverTimestamp() }

  if (action === 'approve') {
    if (c.status === 'approved') return { ok: true }
    if (!c.files?.thumb) throw new HttpsError('failed-precondition', 'Still processing, retry in a few seconds')
    const thumbPath = `thumbs/${id}.jpg`, publicPath = `public/${id}.jpg`
    await Promise.all([
      bucket().file(c.files.thumb).copy(bucket().file(thumbPath)),
      bucket().file(c.files.public).copy(bucket().file(publicPath)),
    ])
    await ref.update({ status: 'approved', 'files.thumb': thumbPath, 'files.public': publicPath, thumbUrl: publicUrl(thumbPath), publicUrl: publicUrl(publicPath), ...audit })
    await bump(c, +1)
    return { ok: true }
  }

  if (action === 'reject') {
    const wasApproved = c.status === 'approved'
    await ref.update({ status: 'rejected', rejectReason: req.data.reason ?? null, ...audit })
    if (wasApproved) {
      await bump(c, -1)
      await Promise.allSettled([bucket().file(`thumbs/${id}.jpg`).delete(), bucket().file(`public/${id}.jpg`).delete()])
    }
    if (req.data.block) await db.doc(`blocklist/uid:${c.uid}`).set({ type: 'uid', reason: req.data.reason ?? 'moderation', createdAt: FieldValue.serverTimestamp() })
    return { ok: true }
  }

  if (action === 'review') { await ref.update({ status: 'review', ...audit }); if (c.status === 'approved') await bump(c, -1); return { ok: true } }
  if (action === 'feature') { await ref.update({ featured: true, ...audit }); return { ok: true } }
  if (action === 'unfeature') { await ref.update({ featured: false, ...audit }); return { ok: true } }
  throw new HttpsError('invalid-argument', 'Unknown action')
})

/** National + prefecture or country counters in one multi-path RTDB update. */
async function bump(c: FirebaseFirestore.DocumentData, delta: 1 | -1) {
  const updates: Record<string, object> = { 'counters/national': increment(delta) }
  if (c.prefecture) updates[`counters/prefectures/${c.prefecture}`] = increment(delta)
  if (c.country) updates[`counters/countries/${c.country}`] = increment(delta)
  await rtdb.ref().update(updates)
}
const increment = (n: number) => ({ '.sv': { increment: n } })
