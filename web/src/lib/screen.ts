/**
 * Giant-screen sequence (Minister's request, 19 Sept 2026): from the admin, an editor launches a choreography on
 * /ecran — the faces disappear, the chosen selfies appear one by one (the President first), then every selfie of the
 * snapshot flies into place to form the map of Guinea, which stays on screen until « Retour à la normale ».
 *
 * config/screen (public read, editor/admin write):
 *   leads: Lead[]                              up to 10 selfies shown in order before the map
 *   sequence: { id, startAt } | null           set = play (every screen follows the same clock), null = normal board
 *   updatedAt, updatedByEmail
 */
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import guinea from '../data/geo/guinea.json'

export type Lead = {
  id: string; participantNumber: number; thumbUrl: string; publicUrl?: string | null
  type?: 'photo' | 'video'; vip?: 'president' | 'minister' | null; prefecture?: string | null; country?: string | null
}
export type ScreenConfig = { leads: Lead[]; sequence: { id: string; startAt: Date } | null; updatedByEmail?: string | null }
export const MAX_LEADS = 10
/** A sequence older than this is ignored by a screen that loads late (forgotten « Retour à la normale » from another day). */
export const SEQUENCE_MAX_AGE_MS = 12 * 3_600_000

export function useScreenConfig(): ScreenConfig | null {
  const [cfg, setCfg] = useState<ScreenConfig | null>(null)
  useEffect(() => onSnapshot(doc(db, 'config', 'screen'), (s) => {
    const d = s.data() ?? {}
    const seq = d.sequence as { id?: unknown; startAt?: { toDate(): Date } | null } | null | undefined
    const startAt = seq?.startAt && typeof seq.startAt === 'object' && 'toDate' in seq.startAt ? seq.startAt.toDate() : null
    setCfg({
      leads: Array.isArray(d.leads) ? (d.leads as Lead[]).slice(0, MAX_LEADS) : [],
      sequence: seq && typeof seq.id === 'string' && startAt ? { id: seq.id, startAt } : null,
      updatedByEmail: (d.updatedByEmail as string | null | undefined) ?? null,
    })
  }, () => setCfg({ leads: [], sequence: null })), [])
  return cfg
}

/* ---------- timeline: milliseconds since sequence.startAt ---------- */

export const T = {
  out: 2_400,        // the board's faces leave
  leadFirst: 9_000,  // the first selfie (the President) stays longer
  lead: 6_000,       // each following selfie
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
