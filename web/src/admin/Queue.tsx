import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { onDisconnect, ref as rref, remove, serverTimestamp, set } from 'firebase/database'
import { db, moderate, rtdb, type RejectReason } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import Item from './Item'
import RejectDialog from './RejectDialog'
import { useLocks, useStorageUrl } from './hooks'
import type { Action, Contribution } from './types'

const UNDO_MS = 5000
const LOCK_MS = 60_000

type Pending = { id: string; number: number; action: Action; timer: number }

/** L1 (pending) and L2 (review) queues: oldest first, keyboard driven, 5 s undo, soft locks, live count and hourly rate. */
export default function Queue({ level, uid, canEdit }: { level: 'pending' | 'review'; uid: string; canEdit: boolean }) {
  const { t } = useI18n()
  const [items, setItems] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Pending | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [stamps, setStamps] = useState<number[]>([])
  const locks = useLocks()
  const pendingRef = useRef<Pending | null>(null)
  pendingRef.current = pending

  useEffect(() => {
    setError(null)
    const q = query(collection(db, 'contributions'), where('status', '==', level), orderBy('priority', 'desc'), orderBy('createdAt', 'asc'), limit(40))
    return onSnapshot(q, (s) => {
      // Presidency / Government items are handled in the Protocole tab by editors; they never reach L1/L2.
      setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contribution, 'id'>) })).filter((c) => !c.vip))
      if (s.size < 40) { setCount(null); return } // the whole queue is on screen: count what is shown
      getCountFromServer(query(collection(db, 'contributions'), where('status', '==', level))).then((r) => setCount(r.data().count)).catch(() => {})
    }, (e) => setError(e.message))
  }, [level])

  const now = Date.now()
  const lockedByOther = useCallback((id: string) => { const l = locks[id]; return l && l.uid !== uid && now - l.at < LOCK_MS ? l.uid : null }, [locks, uid, now])
  const visible = useMemo(() => items.filter((c) => !hidden.has(c.id)), [items, hidden])
  const candidates = visible.filter((c) => !lockedByOther(c.id))
  const current = candidates.find((c) => !skipped.has(c.id)) ?? candidates[0] ?? null
  const upNext = visible.filter((c) => c.id !== current?.id).slice(0, 8)

  // Soft lock on the item being looked at; released on change, unmount or disconnect.
  useEffect(() => {
    if (!current) return
    const r = rref(rtdb, `locks/${current.id}`)
    set(r, { uid, at: serverTimestamp() }).catch(() => {})
    onDisconnect(r).remove().catch(() => {})
    return () => { remove(r).catch(() => {}) }
  }, [current?.id, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const rate = stamps.filter((s) => Date.now() - s < 3_600_000).length

  function say(msg: string) { setToast(msg); window.setTimeout(() => setToast((m) => (m === msg ? null : m)), 4000) }

  const commit = useCallback(async (p: Pending) => {
    try {
      await moderate({ id: p.id, ...p.action })
      setStamps((s) => [...s.filter((x) => Date.now() - x < 3_600_000), Date.now()])
    } catch (e: unknown) {
      setHidden((h) => { const n = new Set(h); n.delete(p.id); return n })
      say(t('admin.failed', { msg: (e as Error).message }))
    }
  }, [t])

  const queueAction = useCallback((c: Contribution, action: Action) => {
    if (pendingRef.current) { window.clearTimeout(pendingRef.current.timer); commit(pendingRef.current) }
    setHidden((h) => new Set(h).add(c.id))
    const p: Pending = { id: c.id, number: c.participantNumber, action, timer: 0 }
    p.timer = window.setTimeout(() => { setPending((cur) => (cur?.id === p.id ? null : cur)); commit(p) }, UNDO_MS)
    setPending(p)
    say(t('admin.undoHint', { action: t(action.action === 'approve' ? 'admin.actionApprove' : 'admin.actionReject'), n: c.participantNumber }))
  }, [commit, t])

  const undo = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    window.clearTimeout(p.timer)
    setPending(null)
    setHidden((h) => { const n = new Set(h); n.delete(p.id); return n })
    setToast(null)
  }, [])

  const approve = useCallback(() => {
    if (!current) return
    if (!current.files?.thumb) { say(t('admin.processing')); return }
    queueAction(current, { action: 'approve' })
  }, [current, queueAction, t])

  const immediate = useCallback(async (c: Contribution, action: Action) => {
    try { await moderate({ id: c.id, ...action }) } catch (e: unknown) { say(t('admin.failed', { msg: (e as Error).message })) }
  }, [t])

  const skip = useCallback(() => {
    if (!current) return
    setSkipped((s) => { const n = new Set(s).add(current.id); return n.size >= candidates.length ? new Set() : n })
  }, [current, candidates.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (rejectOpen || (e.target as HTMLElement)?.closest('input, select, textarea')) return
      const k = e.key.toLowerCase()
      if (k === 'a') approve()
      else if (k === 'r' && current) setRejectOpen(true)
      else if (k === 'u') undo()
      else if (k === ' ') { e.preventDefault(); skip() }
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approve, undo, skip, current, rejectOpen])

  function onAction(a: Action) {
    if (!current) return
    if (a.action === 'approve') approve()
    else immediate(current, a)
  }
  function onRejectConfirm(reason: RejectReason, block: boolean) {
    setRejectOpen(false)
    if (current) queueAction(current, { action: 'reject', reason, block })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-bold tabular">{t('admin.remaining', { n: count ?? visible.length })}</span>
        <span className="text-muted tabular">{t('admin.rate', { n: rate })}</span>
        <span className="text-muted ml-auto hidden md:inline">{t('admin.shortcuts')}</span>
      </div>
      {error && <p className="rounded-xl bg-danger/10 text-danger text-sm p-3">{t('admin.error')} <code className="text-xs">{error}</code></p>}
      {toast && (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-ink text-white text-sm px-4 py-3">
          <span>{toast}</span>
          {pending && <button className="ml-auto btn-white h-8 px-3 text-xs" onClick={undo}>{t('admin.undo')}</button>}
        </div>
      )}
      {!error && !current && <p className="card p-10 text-center text-muted">{t('admin.allDone')}</p>}
      {current && (
        <Item key={current.id} c={current} canEdit={canEdit} lockedBy={null} onAction={onAction} onReject={() => setRejectOpen(true)} />
      )}
      {upNext.length > 0 && (
        <section>
          <p className="label mb-2">{t('admin.next')}</p>
          <ul className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {upNext.map((c) => <Thumb key={c.id} c={c} dim={!!lockedByOther(c.id)} onClick={() => setSkipped(new Set(visible.filter((x) => x.id !== c.id && visible.indexOf(x) < visible.indexOf(c)).map((x) => x.id)))} />)}
          </ul>
        </section>
      )}
      <RejectDialog open={rejectOpen} canBlock={canEdit} onConfirm={onRejectConfirm} onCancel={() => setRejectOpen(false)} />
    </div>
  )
}

function Thumb({ c, dim, onClick }: { c: Contribution; dim: boolean; onClick: () => void }) {
  const url = useStorageUrl(c.thumbUrl ? null : c.files?.thumb, c.thumbUrl)
  return (
    <li>
      <button onClick={onClick} className={`relative block w-full aspect-square rounded-lg overflow-hidden bg-primary-tint ${dim ? 'opacity-40' : ''}`} title={`#${c.participantNumber}`}>
        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
        <span className="absolute left-1 bottom-1 text-[10px] bg-white/90 rounded-full px-1.5 tabular">#{c.participantNumber}</span>
        {c.priority === 1 && <span className="absolute right-1 top-1 w-2 h-2 rounded-full bg-gold" />}
      </button>
    </li>
  )
}
