import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { db, FieldValue, requireAuth, rtdb } from './lib.js'

const THRESHOLD = 3

/** Public reporting. At THRESHOLD distinct reports an approved item goes back to L2 review and leaves the Wall. */
export const report = onCall<{ id: string; reason: string }>(async (req) => {
  const { uid } = requireAuth(req)
  const { id, reason } = req.data
  if (!id) throw new HttpsError('invalid-argument', 'id required')
  const reportRef = db.doc(`reports/${id}_${uid}`) // one report per uid per item
  if ((await reportRef.get()).exists) return { ok: true }
  await reportRef.set({ contributionId: id, uid, reason: String(reason ?? '').slice(0, 200), createdAt: FieldValue.serverTimestamp() })

  const ref = db.doc(`contributions/${id}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const c = snap.data()!
    const reports = (c.reports ?? 0) + 1
    const pull = c.status === 'approved' && reports >= THRESHOLD
    tx.update(ref, { reports, ...(pull ? { status: 'review' } : {}) })
    if (pull) {
      const updates: Record<string, object> = { 'counters/national': { '.sv': { increment: -1 } } }
      if (c.prefecture) updates[`counters/prefectures/${c.prefecture}`] = { '.sv': { increment: -1 } }
      if (c.country) updates[`counters/countries/${c.country}`] = { '.sv': { increment: -1 } }
      await rtdb.ref().update(updates)
    }
  })
  return { ok: true }
})
