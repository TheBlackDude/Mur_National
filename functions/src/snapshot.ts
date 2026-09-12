import { onSchedule } from 'firebase-functions/v2/scheduler'
import { bucket, db, rtdb } from './lib.js'

/**
 * Every 2 minutes: counters + last 120 approved thumbs into one public JSON.
 * The screen feed, the map and the Wall's first paint read this file; with config/app.degraded
 * the Wall reads nothing else. Cache-Control keeps CDN reads cheap.
 */
export const snapshot = onSchedule({ schedule: 'every 2 minutes', timeoutSeconds: 60 }, async () => {
  const [counters, recent] = await Promise.all([
    rtdb.ref('counters').get(),
    db.collection('contributions').where('status', '==', 'approved').orderBy('createdAt', 'desc').limit(120).get(),
  ])
  const c = counters.val() ?? {}
  const body = {
    updatedAt: new Date().toISOString(),
    national: c.national ?? 0,
    prefectures: c.prefectures ?? {},
    countries: c.countries ?? {},
    recent: recent.docs.map((d) => {
      const x = d.data()
      return { id: d.id, type: x.type ?? 'photo', thumbUrl: x.thumbUrl, videoUrl: x.videoUrl ?? null, participantNumber: x.participantNumber, prefecture: x.prefecture, country: x.country, featured: !!x.featured }
    }),
  }
  await bucket().file('snapshot/latest.json').save(JSON.stringify(body), {
    contentType: 'application/json',
    metadata: { cacheControl: 'public, max-age=60' },
  })
})
