import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { createEvent, db, type EventKind } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import { EVENT_PRESETS, type EventDoc } from '../lib/invitations'

/** Invitations protocolaires: the list of events and the form that creates one (the callable generates its signing key). */
export default function Invitations() {
  const { t } = useI18n()
  const [events, setEvents] = useState<EventDoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<EventKind>('parade')
  const [form, setForm] = useState({ ...EVENT_PRESETS.parade })
  const [busy, setBusy] = useState(false)

  useEffect(() => onSnapshot(query(collection(db, 'events'), orderBy('createdAt', 'desc')), (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, 'id'>) }))), (e) => setError(e.message)), [])

  function pick(k: EventKind) { setKind(k); setForm({ ...EVENT_PRESETS[k] }) }
  async function create() {
    setBusy(true); setError(null)
    try {
      await createEvent({ kind, ...form, titleLines: form.titleLines.filter(Boolean) })
      setOpen(false)
    } catch (e: unknown) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const field = (k: keyof typeof form, label: string, opts: { wide?: boolean } = {}) => (
    <label className={`grid gap-1 ${opts.wide ? 'sm:col-span-2' : ''}`}><span className="label">{label}</span>
      <input className="input" value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
  )

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-bold">{t('inv.title')}</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">{t('inv.lede')}</p>
        </div>
        <button className="btn-primary h-11 px-5" onClick={() => setOpen((o) => !o)}>{t('inv.newEvent')}</button>
      </div>
      {error && <p className="rounded-xl bg-danger/10 text-danger text-sm p-3">{error}</p>}

      {open && (
        <form className="card p-5 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create() }}>
          <div className="sm:col-span-2 flex gap-2">
            {(['parade', 'dinner'] as EventKind[]).map((k) => (
              <button type="button" key={k} onClick={() => pick(k)} className={`h-11 px-4 rounded-[var(--radius-btn)] border font-medium ${kind === k ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>{t(`inv.kind.${k}`)}</button>
            ))}
          </div>
          {field('name', t('inv.f.name'), { wide: true })}
          <label className="grid gap-1"><span className="label">{t('inv.f.code')}</span>
            <input className="input uppercase" maxLength={3} pattern="[A-Za-z]{3}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
          <label className="grid gap-1"><span className="label">{t('inv.f.gates')}</span>
            <input className="input" type="number" min={1} max={20} value={form.gates} onChange={(e) => setForm({ ...form, gates: Number(e.target.value) })} /></label>
          {field('venue', t('inv.f.venue'))}
          {field('date', t('inv.f.date'))}
          {field('time', t('inv.f.time'))}
          {field('dressCode', t('inv.f.dressCode'))}
          {field('intro', t('inv.f.intro'))}
          {field('lead', t('inv.f.lead'))}
          <label className="grid gap-1 sm:col-span-2"><span className="label">{t('inv.f.titleLines')}</span>
            <textarea className="input min-h-20" value={form.titleLines.join('\n')} onChange={(e) => setForm({ ...form, titleLines: e.target.value.split('\n').slice(0, 3) })} /></label>
          {field('zoneLabel', t('inv.f.zoneLabel'))}
          <p className="text-xs text-muted self-end">{t('inv.f.codeHint')}</p>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button type="button" className="btn-outline h-11 px-4" onClick={() => setOpen(false)}>{t('inv.cancel')}</button>
            <button type="submit" className="btn-primary h-11 px-5" disabled={busy || !form.name || form.code.length !== 3}>{busy ? '…' : t('inv.create')}</button>
          </div>
        </form>
      )}

      {events.length === 0 && !open && <p className="card p-10 text-center text-muted">{t('inv.empty')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {events.map((ev) => (
          <li key={ev.id}>
            <Link to={`/admin/invitations/${ev.id}`} className="card p-5 block hover:shadow-lg transition">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular ${ev.kind === 'dinner' ? 'bg-ink text-gold' : 'bg-primary text-white'}`}>{ev.code}</span>
                <span className="text-xs text-muted">{t(`inv.kind.${ev.kind}`)}</span>
              </div>
              <p className="text-lg font-bold mt-2">{ev.name}</p>
              <p className="text-sm text-muted">{[ev.date, ev.venue, ev.time].filter(Boolean).join(' · ')}</p>
              <p className="text-sm mt-3 tabular"><b>{ev.guestCount ?? 0}</b> {t('inv.guests')} · <b>{ev.issuedCount ?? 0}</b> {t('inv.issued')} · {ev.gates} {t('inv.gatesN')}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
