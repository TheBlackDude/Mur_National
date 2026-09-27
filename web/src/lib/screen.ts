/**
 * Giant-screen sequence (Minister's request, 19 Sept 2026): from the admin, an editor launches a choreography on
 * /ecran — the faces disappear, the chosen selfies appear one by one (the President first), then every selfie of the
 * snapshot flies into place to form the map of Guinea, which stays on screen until « Retour à la normale ».
 *
 * RTDB `screen` (public read, editor/admin write) since 27 Sept 2026 — the venue's screen PC did not follow a launch
 * written to Firestore (config/screen): Firestore and the callables enforce App Check, so a PC or a laptop whose
 * reCAPTCHA script does not load is refused or hangs. The screens now poll this node over plain HTTPS (no SDK, no
 * App Check, no long-lived connection) and the operators write it over the same REST API with their ID token.
 *   leads: Lead[]                              up to 10 selfies shown in order before the map
 *   sequence: { id, startAt } | null           set = play (startAt is the server clock: every screen runs the same timeline), null = normal board
 *   updatedAt, updatedByEmail
 */
import { useEffect, useState } from 'react'
import { app, auth, withTimeout } from './firebase'
import guinea from '../data/geo/guinea.json'

export type Lead = {
  id: string; participantNumber: number; thumbUrl: string; publicUrl?: string | null
  type?: 'photo' | 'video'; vip?: 'president' | 'minister' | null; prefecture?: string | null; country?: string | null
}
export type ScreenConfig = { leads: Lead[]; sequence: { id: string; startAt: Date } | null; updatedByEmail?: string | null; exists: boolean }
export const MAX_LEADS = 10
/** A sequence older than this is ignored by a screen that loads late (forgotten « Retour à la normale » from another day). */
export const SEQUENCE_MAX_AGE_MS = 12 * 3_600_000
/** Screens and the admin poll this often; a launch reaches every screen within one tick. */
export const SCREEN_POLL_MS = 2_000

const SCREEN_URL = `${(app.options as { databaseURL?: string }).databaseURL ?? ''}/screen.json`

function parseScreen(d: Record<string, unknown> | null): ScreenConfig {
  // RTDB returns a sequential array as an array and a sparse one as an object keyed by index.
  const raw = d?.leads
  const leads = (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []) as Lead[]
  const seq = d?.sequence as { id?: unknown; startAt?: unknown } | null | undefined
  const sequence = seq && typeof seq.id === 'string' && typeof seq.startAt === 'number' ? { id: seq.id, startAt: new Date(seq.startAt) } : null
  return {
    leads: leads.filter((l) => l && typeof l.id === 'string' && typeof l.thumbUrl === 'string').slice(0, MAX_LEADS),
    sequence,
    updatedByEmail: typeof d?.updatedByEmail === 'string' ? d.updatedByEmail : null,
    exists: d !== null && d !== undefined,
  }
}

/** The screen state, polled over HTTPS. `null` until the first answer; the last good copy is kept when a poll fails. */
export function useScreenConfig(pollMs = SCREEN_POLL_MS): ScreenConfig | null {
  const [cfg, setCfg] = useState<ScreenConfig | null>(null)
  useEffect(() => {
    let alive = true
    let timer = 0
    async function tick() {
      try {
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8_000) : undefined
        const res = await fetch(SCREEN_URL, { cache: 'no-store', signal })
        if (!res.ok) throw new Error(`screen ${res.status}`)
        const d = (await res.json()) as Record<string, unknown> | null
        if (alive) setCfg(parseScreen(d))
      } catch { /* keep the last copy; the next tick retries */ }
      if (alive) timer = window.setTimeout(tick, pollMs)
    }
    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [pollMs])
  return cfg
}

/**
 * Operators' writes (editor/admin rule) over the RTDB REST API with the Firebase ID token — no SDK, no App Check,
 * a bounded round trip. `{ ".sv": "timestamp" }` is the server's clock, so every screen follows one timeline.
 */
export async function writeScreen(patch: { leads?: Lead[]; sequence?: 'launch' | null }, email: string | null): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in first')
  const p: Record<string, unknown> = { updatedAt: { '.sv': 'timestamp' }, updatedByEmail: email }
  // JSON round trip: RTDB rejects `undefined` values, which optional Lead fields may carry.
  if (patch.leads) p.leads = JSON.parse(JSON.stringify(patch.leads.slice(0, MAX_LEADS)))
  if (patch.sequence === 'launch') p.sequence = { id: crypto.randomUUID(), startAt: { '.sv': 'timestamp' } }
  else if (patch.sequence === null) p.sequence = null
  const token = await withTimeout(user.getIdToken(), 15_000, 'idtoken timeout')
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15_000) : undefined
  const res = await fetch(`${SCREEN_URL}?auth=${encodeURIComponent(token)}`, { method: 'PATCH', body: JSON.stringify(p), signal })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* not JSON */ }
    throw new Error(res.status === 401 ? `Permission denied (${msg})` : msg)
  }
}

/**
 * Server clock minus this device's clock, from the Date header of a same-origin HEAD request (1 s resolution).
 * A venue PC whose clock is minutes off would otherwise sit on a black screen (start in its future) or skip the leads.
 * Offsets under 2 s are ignored: that is the header's own imprecision.
 */
export function useServerOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    let alive = true
    async function probe() {
      try {
        const t0 = Date.now()
        const res = await fetch(`${import.meta.env.BASE_URL}?clock=${t0}`, { method: 'HEAD', cache: 'no-store' })
        const date = res.headers.get('date')
        const t1 = Date.now()
        if (!date || !alive) return
        const server = Date.parse(date) + 500 + (t1 - t0) / 2
        const off = Math.round(server - t1)
        setOffset(Math.abs(off) < 2_000 ? 0 : off)
      } catch { /* keep the last offset */ }
    }
    probe()
    const id = window.setInterval(probe, 10 * 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return offset
}

/* ---------- timeline: milliseconds since sequence.startAt ---------- */

export const T = {
  out: 2_400,        // the board's faces leave
  leadFirst: 10_000, // the first selfie (the President) stays longer (10 s, Ousmane 27 Sept 2026)
  lead: 7_000,       // each following selfie (7 s)
  build: 5_000,      // the tiles fly into the map
}
export type Phase =
  | { kind: 'out' }
  | { kind: 'lead'; index: number; sinceMs: number; durationMs: number }
  | { kind: 'map'; sinceMs: number }

export function phaseAt(elapsedMs: number, leads: number): Phase {
  let t = Math.max(0, elapsedMs)
  if (t < T.out) return { kind: 'out' }
  t -= T.out
  for (let i = 0; i < leads; i++) {
    const d = i === 0 ? T.leadFirst : T.lead
    if (t < d) return { kind: 'lead', index: i, sinceMs: t, durationMs: d }
    t -= d
  }
  return { kind: 'map', sinceMs: t }
}
export const sequenceDurationMs = (leads: number) => T.out + (leads > 0 ? T.leadFirst + (leads - 1) * T.lead : 0) + T.build

/* ---------- the map as a field of points ---------- */

export const GUINEA_VIEWBOX = { w: 1000, h: 748 }
export const GUINEA_PATHS: string[] = (guinea.shapes as { d: string }[]).map((s) => s.d)

/**
 * Centres of a square grid that fall inside Guinea (all prefecture polygons), in viewBox units, ordered west to east
 * so the map draws itself from the coast. `target` tiles wanted; the step is derived from the country's area.
 */
export function mapPoints(target: number): { points: [number, number][]; step: number } {
  const canvas = document.createElement('canvas')
  canvas.width = GUINEA_VIEWBOX.w; canvas.height = GUINEA_VIEWBOX.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { points: [], step: 40 }
  const paths = GUINEA_PATHS.map((d) => new Path2D(d))
  const inside = (x: number, y: number) => paths.some((p) => ctx.isPointInPath(p, x, y))
  // Area by coarse sampling, then the step that yields about `target` cells.
  let hits = 0
  const coarse = 8
  for (let y = coarse / 2; y < GUINEA_VIEWBOX.h; y += coarse) for (let x = coarse / 2; x < GUINEA_VIEWBOX.w; x += coarse) if (inside(x, y)) hits++
  const area = hits * coarse * coarse
  const step = Math.max(12, Math.sqrt(area / Math.max(1, target)))
  const points: [number, number][] = []
  for (let y = step / 2; y < GUINEA_VIEWBOX.h; y += step) for (let x = step / 2; x < GUINEA_VIEWBOX.w; x += step) if (inside(x, y)) points.push([x, y])
  points.sort((a, b) => a[0] - b[0] + (a[1] - b[1]) * 0.15)
  return { points, step }
}
