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
/** World-readable, Cache-Control 60 s: the Wall's first paint, its degraded mode, the map and the screen all read this one file. */
export const SNAPSHOT_URL = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent('snapshot/latest.json')}?alt=media`

const LS_KEY = 'snapshot.v1'
/** Last snapshot this device saw: painted before the network answers, so a refresh on a slow link still shows faces. */
export function cachedSnapshot(): Snapshot | null {
  try {
    const v = localStorage.getItem(LS_KEY)
    const s = v ? (JSON.parse(v) as Snapshot) : null
    return s && Array.isArray(s.recent) && typeof s.updatedAt === 'string' ? s : null
  } catch { return null }
}
function remember(s: Snapshot) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* private mode, quota */ } }

/** Bounded fetch: a request that never settles on 3G is worse than an error, which keeps the last copy on screen. */
export async function fetchSnapshot(timeoutMs = 15_000): Promise<Snapshot> {
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
  // 'no-cache' revalidates against the 60 s edge copy (ETag → 304) instead of bypassing the browser cache entirely.
  const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache', signal })
  if (!res.ok) throw new Error(`snapshot ${res.status}`)
  const s = (await res.json()) as Snapshot
  remember(s)
  return s
}

/**
 * Snapshot with the device's last copy as the initial value; polls every `intervalMs` (0 = fetch once),
 * re-fetches when the tab comes back to the foreground, keeps the last good copy when a fetch fails.
 * `ageMin` is minutes since the file was written; `fresh` is false until the network answered once.
 */
export function useSnapshot(intervalMs = 120_000, enabled = true): { snap: Snapshot | null; error: boolean; ageMin: number | null; fresh: boolean } {
  const [snap, setSnap] = useState<Snapshot | null>(cachedSnapshot)
  const [error, setError] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer = 0
    let inflight = false
    async function tick() {
      if (inflight) return
      inflight = true
      try { const s = await fetchSnapshot(); if (alive) { setSnap(s); setError(false); setFresh(true) } }
      catch { if (alive) setError(true) }
      inflight = false
      if (alive && intervalMs > 0) { clearTimeout(timer); timer = window.setTimeout(tick, intervalMs) }
    }
    tick()
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { alive = false; clearTimeout(timer); clearInterval(clock); document.removeEventListener('visibilitychange', onVisible) }
  }, [intervalMs, enabled])
  const ageMin = snap ? Math.max(0, Math.round((now - Date.parse(snap.updatedAt)) / 60_000)) : null
  return { snap, error, ageMin, fresh }
}

/** config/app: editable in the Firebase console without a deploy. Public read. */
export type AppConfig = {
  launchAt: Date | null
  revealAt: Date | null
  degraded: boolean
  /** false → home counters poll the snapshot instead of holding an RTDB connection (200 000 simultaneous connections cap). */
  liveCounter: boolean
  targets: { national: number; perPrefecture: number }
}
const DEFAULTS: AppConfig = { launchAt: null, revealAt: null, degraded: false, liveCounter: true, targets: { national: 500_000, perPrefecture: 1_000 } }

export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULTS)
  useEffect(() => onSnapshot(doc(db, 'config', 'app'), (s) => {
    const d = s.data() ?? {}
    const toDate = (v: unknown): Date | null => (v && typeof v === 'object' && 'toDate' in v ? (v as { toDate(): Date }).toDate() : typeof v === 'string' ? new Date(v) : null)
    setCfg({
      launchAt: toDate(d.launchAt),
      revealAt: toDate(d.revealAt),
      degraded: d.degraded === true,
      liveCounter: d.liveCounter !== false,
      targets: { national: Number(d.targets?.national) || DEFAULTS.targets.national, perPrefecture: Number(d.targets?.perPrefecture) || DEFAULTS.targets.perPrefecture },
    })
  }, () => setCfg(DEFAULTS)), [])
  return cfg
}
