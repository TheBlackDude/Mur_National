import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { app, db } from './firebase'

/** Shape written by the `snapshot` scheduled function every 2 minutes. */
export type SnapshotItem = { id: string; type?: 'photo' | 'video'; thumbUrl: string; videoUrl?: string | null; participantNumber: number; prefecture?: string | null; country?: string | null; featured?: boolean }
export type Snapshot = {
  updatedAt: string
  national: number
  prefectures: Record<string, number>
  countries: Record<string, number>
  recent: SnapshotItem[]
}

const bucket = (app.options.storageBucket as string | undefined) ?? 'guinea68.firebasestorage.app'
/** World-readable, Cache-Control 60 s: the Wall's degraded mode, the map and the screen all read this one file. */
export const SNAPSHOT_URL = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent('snapshot/latest.json')}?alt=media`

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch(SNAPSHOT_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`snapshot ${res.status}`)
  return res.json()
}

/** Polls the snapshot; keeps the last good copy when a fetch fails. `ageMin` is minutes since it was written. */
export function useSnapshot(intervalMs = 120_000, enabled = true): { snap: Snapshot | null; error: boolean; ageMin: number | null } {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer = 0
    async function tick() {
      try { const s = await fetchSnapshot(); if (alive) { setSnap(s); setError(false) } }
      catch { if (alive) setError(true) }
      if (alive) timer = window.setTimeout(tick, intervalMs)
    }
    tick()
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { alive = false; clearTimeout(timer); clearInterval(clock) }
  }, [intervalMs, enabled])
  const ageMin = snap ? Math.max(0, Math.round((now - Date.parse(snap.updatedAt)) / 60_000)) : null
  return { snap, error, ageMin }
}

/** config/app: editable in the Firebase console without a deploy. Public read. */
export type AppConfig = {
  launchAt: Date | null
  revealAt: Date | null
  degraded: boolean
  targets: { national: number; perPrefecture: number }
}
const DEFAULTS: AppConfig = { launchAt: null, revealAt: null, degraded: false, targets: { national: 100_000, perPrefecture: 1_000 } }

export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULTS)
  useEffect(() => onSnapshot(doc(db, 'config', 'app'), (s) => {
    const d = s.data() ?? {}
    const toDate = (v: unknown): Date | null => (v && typeof v === 'object' && 'toDate' in v ? (v as { toDate(): Date }).toDate() : typeof v === 'string' ? new Date(v) : null)
    setCfg({
      launchAt: toDate(d.launchAt),
      revealAt: toDate(d.revealAt),
      degraded: d.degraded === true,
      targets: { national: Number(d.targets?.national) || DEFAULTS.targets.national, perPrefecture: Number(d.targets?.perPrefecture) || DEFAULTS.targets.perPrefecture },
    })
  }, () => setCfg(DEFAULTS)), [])
  return cfg
}
