import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { bucket, db, exportsConfig, rtdb } from './lib.js'
import { hourKey, type LatencyBucket } from './moderate.js'

const BUCKETS: [LatencyBucket, number][] = [['lt5', 5], ['lt15', 15], ['lt30', 30], ['lt60', 60], ['lt120', 120], ['ge120', 999]]
const REFIRE_MS = 60 * 60_000
type Check = { key: string; failing: boolean; text: string }

/** Approximate p95 (minutes) from the histogram of the last two UTC hours; null when nothing was approved. */
async function p95Minutes(): Promise<number | null> {
  const now = new Date()
  const keys = [hourKey(new Date(now.getTime() - 3_600_000)), hourKey(now)]
  const sums = Object.fromEntries(BUCKETS.map(([b]) => [b, 0])) as Record<LatencyBucket, number>
  for (const k of keys) {
    const v = (await rtdb.ref(`stats/latencyHist/${k}`).get()).val() as Partial<Record<LatencyBucket, number>> | null
    for (const [b] of BUCKETS) sums[b] += v?.[b] ?? 0
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  let acc = 0
  for (const [b, min] of BUCKETS) { acc += sums[b]; if (acc / total >= 0.95) return min }
  return 999
}

async function snapshotAgeMin(): Promise<number | null> {
  try {
    const [buf] = await bucket().file('snapshot/latest.json').download()
    const { updatedAt } = JSON.parse(buf.toString('utf8')) as { updatedAt?: string }
    return updatedAt ? (Date.now() - Date.parse(updatedAt)) / 60_000 : null
  } catch { return null }
}

async function notify(text: string) {
  logger.error(`[alert] ${text}`)
  const { alertWebhook } = await exportsConfig()
  if (!alertWebhook) return
  try {
    const res = await fetch(alertWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    if (!res.ok) logger.warn('watchdog: webhook refused', { status: res.status })
  } catch (e) { logger.warn('watchdog: webhook failed', { error: String(e) }) }
}

/**
 * Every 5 minutes: backlog, moderation p95 and snapshot freshness. Fires once per hour per check into
 * Cloud Logging (log-based alert) and the war-room webhook, then a recovery line when it clears.
 * Error rate and budget alerts live in Cloud Monitoring (see FIREBASE_SETUP §12).
 */
export const watchdog = onSchedule({ schedule: 'every 5 minutes', timeoutSeconds: 60 }, async () => {
  const [pending, review, p95, age] = await Promise.all([
    db.collection('contributions').where('status', '==', 'pending').count().get().then((s) => s.data().count),
    db.collection('contributions').where('status', '==', 'review').count().get().then((s) => s.data().count),
    p95Minutes(),
    snapshotAgeMin(),
  ])
  const backlog = pending + review
  const checks: Check[] = [
    { key: 'backlog', failing: backlog > 2000, text: `Backlog de modération : ${backlog} (pending ${pending}, review ${review})` },
    { key: 'latency', failing: p95 !== null && p95 > 120, text: `Délai de modération p95 ≈ ${p95} min sur 2 h` },
    { key: 'snapshot', failing: age === null || age > 10, text: age === null ? 'Snapshot illisible' : `Snapshot vieux de ${Math.round(age)} min` },
  ]
  const state = ((await rtdb.ref('alerts').get()).val() ?? {}) as Record<string, number>
  const now = Date.now()
  for (const c of checks) {
    const last = state[c.key] ?? 0
    if (c.failing) {
      if (now - last < REFIRE_MS) continue
      await notify(`🔴 ${c.text}`)
      await rtdb.ref(`alerts/${c.key}`).set(now)
    } else if (last) {
      await notify(`🟢 Rétabli : ${c.text}`)
      await rtdb.ref(`alerts/${c.key}`).remove()
    }
  }
  logger.info('watchdog', { backlog, p95, snapshotAgeMin: age })
})
