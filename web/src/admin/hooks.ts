import { useEffect, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { onValue, ref as rref } from 'firebase/database'
import { getDownloadURL, ref as sref } from 'firebase/storage'
import { db, rtdb, storage } from '../lib/firebase'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'
import type { Contribution, HistoryEntry } from './types'

/** Resolves a Storage path to a URL; a ready-made public URL short-circuits. */
export function useStorageUrl(path?: string | null, direct?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(direct ?? null)
  useEffect(() => {
    let live = true
    if (direct) { setUrl(direct); return }
    setUrl(null)
    if (path) getDownloadURL(sref(storage, path)).then((u) => live && setUrl(u)).catch(() => {})
    return () => { live = false }
  }, [path, direct])
  return url
}

export type Lock = { uid: string; at: number }
/** Soft locks written by moderators while they look at an item (RTDB locks/{id}). */
export function useLocks(): Record<string, Lock> {
  const [locks, setLocks] = useState<Record<string, Lock>>({})
  useEffect(() => onValue(rref(rtdb, 'locks'), (s) => setLocks(s.val() ?? {}), () => setLocks({})), [])
  return locks
}

export function useHistory(id: string | null): HistoryEntry[] {
  const [rows, setRows] = useState<HistoryEntry[]>([])
  useEffect(() => {
    if (!id) { setRows([]); return }
    const q = query(collection(db, 'contributions', id, 'history'), orderBy('at', 'asc'))
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HistoryEntry, 'id'>) }))), () => setRows([]))
  }, [id])
  return rows
}

export function useContribution(id: string | null): Contribution | null {
  const [c, setC] = useState<Contribution | null>(null)
  useEffect(() => {
    let live = true
    setC(null)
    if (id) getDoc(doc(db, 'contributions', id)).then((d) => live && d.exists() && setC({ id: d.id, ...(d.data() as Omit<Contribution, 'id'>) })).catch(() => {})
    return () => { live = false }
  }, [id])
  return c
}

export function placeName(c: Pick<Contribution, 'prefecture' | 'country'>): string {
  if (c.prefecture) { const p = prefectures.find((x) => x.code === c.prefecture); return p ? `${p.name} · ${p.region}` : c.prefecture }
  if (c.country) return countries.find((x) => x.iso === c.country)?.name ?? c.country
  return '—'
}

export const fmtDate = (ts: { toDate(): Date } | undefined, lang: 'fr' | 'en') =>
  ts ? ts.toDate().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
