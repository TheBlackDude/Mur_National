import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db, issueInvitations } from '../lib/firebase'
import { useI18n, type TKey } from '../lib/i18n'
import { CATEGORY_SUGGESTIONS, guestName, newGuestId, parseGuestCsv, photoDataUrl, type Checkin, type EventDoc, type Guest, type ImportRow, type Scan } from '../lib/invitations'
import { canvasJpeg, download, renderCard, renderVerso, safeFile } from '../lib/card'
import { A5_PT, pdfFromJpegs } from '../lib/pdf'
import { fmtDate } from './hooks'

const PDF_CHUNK = 100
const PRINT_PX = 1748 // 300 dpi
const EMPTY: ImportRow = { civility: '', firstName: '', lastName: '', title: '', category: '', zone: '', seat: '', phone: '' }

/** One event: its card settings, the guest list (import, edit, photos, cards, PDF) and the live entries. */
export default function EventPage() {
  const { t, lang } = useI18n()
  const { eventId = '' } = useParams()
  const [ev, setEv] = useState<EventDoc | null | undefined>(undefined)
  const [guests, setGuests] = useState<Guest[]>([])
  const [checkins, setCheckins] = useState<Record<string, Checkin>>({})
  const [scans, setScans] = useState<Scan[]>([])
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Guest | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'events', eventId), (s) => setEv(s.exists() ? ({ id: s.id, ...(s.data() as Omit<EventDoc, 'id'>) }) : null), () => setEv(null)), [eventId])
  useEffect(() => onSnapshot(query(collection(db, 'events', eventId, 'guests'), orderBy('lastName')), (s) => setGuests(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Guest, 'id'>) })))), [eventId])
  useEffect(() => onSnapshot(collection(db, 'events', eventId, 'checkins'), (s) => setCheckins(Object.fromEntries(s.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Omit<Checkin, 'id'>) }])))), [eventId])
  useEffect(() => onSnapshot(query(collection(db, 'events', eventId, 'scans'), orderBy('at', 'desc'), limit(40)), (s) => setScans(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Scan, 'id'>) })))), [eventId])

  const say = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => { setMsg({ text, tone }); window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 6000) }, [])
  const fail = useCallback((e: unknown) => say((e as Error).message, 'error'), [say])

  const byId = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return guests
    return guests.filter((g) => [guestName(g), g.title, g.category, g.zone, g.seat, g.code ?? '', g.phone].join(' ').toLowerCase().includes(q))
  }, [guests, search])
  const unissued = guests.filter((g) => !g.token && g.status !== 'revoked')
  const printable = guests.filter((g) => g.token && g.status === 'active')
  const admitted = Object.keys(checkins).length

  /* ---- guests ---- */
  async function saveGuest(g: Guest) {
    setBusy(true)
    try {
      const { id, code: _c, token: _t, createdAt: _ca, issuedAt: _ia, ...rest } = g // eslint-disable-line @typescript-eslint/no-unused-vars
      const ref = doc(db, 'events', eventId, 'guests', id)
      if (byId.has(id)) await updateDoc(ref, { ...rest, updatedAt: serverTimestamp() })
      else { const b = writeBatch(db); b.set(ref, { ...rest, status: 'active', photo: g.photo ?? null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); await b.commit() }
      setEditing(null)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  async function setStatus(g: Guest, status: Guest['status']) {
    try { await updateDoc(doc(db, 'events', eventId, 'guests', g.id), { status, revokedAt: status === 'revoked' ? serverTimestamp() : null, updatedAt: serverTimestamp() }) } catch (e) { fail(e) }
  }
  async function remove(g: Guest) {
    try { await deleteDoc(doc(db, 'events', eventId, 'guests', g.id)) } catch (e) { fail(e) }
  }
  async function importRows(rows: ImportRow[]) {
    setBusy(true)
    try {
      for (let i = 0; i < rows.length; i += 400) {
        const b = writeBatch(db)
        for (const r of rows.slice(i, i + 400)) b.set(doc(db, 'events', eventId, 'guests', newGuestId()), { ...r, photo: null, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        await b.commit()
        setProgress({ done: Math.min(i + 400, rows.length), total: rows.length, label: t('inv.importing') })
      }
      say(t('inv.imported', { n: rows.length })); setImportOpen(false)
    } catch (e) { fail(e) } finally { setBusy(false); setProgress(null) }
  }
  async function issue(reissueIds?: string[]) {
    setBusy(true)
    try {
      const r = await issueInvitations({ eventId, ...(reissueIds ? { guestIds: reissueIds, reissue: true } : {}) })
      say(t('inv.issuedMsg', { n: r.issued }))
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  /* ---- cards ---- */
  async function showPreview(g: Guest) {
    if (!ev) return
    try { const c = await renderCard(ev, g, 740); setPreview(c.toDataURL('image/jpeg', 0.85)) } catch (e) { fail(e) }
  }
  async function downloadPng(g: Guest) {
    if (!ev) return
    try {
      const c = await renderCard(ev, g, PRINT_PX)
      c.toBlob((b) => b && download(b, `carte-${ev.code}-${safeFile(guestName(g))}.png`), 'image/png')
    } catch (e) { fail(e) }
  }
  async function exportPdf(kind: 'recto' | 'verso') {
    if (!ev) return
    setBusy(true)
    try {
      if (kind === 'verso') {
        const c = await renderVerso(ev, PRINT_PX)
        const jpeg = await canvasJpeg(c)
        download(pdfFromJpegs([{ jpeg, widthPx: c.width, heightPx: c.height }], A5_PT.width, A5_PT.height), `verso-${ev.code}.pdf`)
        return
      }
      const list = [...printable].sort((a, b) => `${a.zone} ${a.seat} ${a.lastName}`.localeCompare(`${b.zone} ${b.seat} ${b.lastName}`, 'fr'))
      for (let i = 0; i < list.length; i += PDF_CHUNK) {
        const chunk = list.slice(i, i + PDF_CHUNK)
        const pages = []
        for (const [j, g] of chunk.entries()) {
          const c = await renderCard(ev, g, PRINT_PX)
          pages.push({ jpeg: await canvasJpeg(c), widthPx: c.width, heightPx: c.height })
          setProgress({ done: i + j + 1, total: list.length, label: t('inv.rendering') })
          await new Promise((r) => setTimeout(r, 0))
        }
        download(pdfFromJpegs(pages, A5_PT.width, A5_PT.height), `cartes-${ev.code}-${String(i + 1).padStart(3, '0')}-${String(i + chunk.length).padStart(3, '0')}.pdf`)
      }
      say(t('inv.pdfDone', { n: list.length }))
    } catch (e) { fail(e) } finally { setBusy(false); setProgress(null) }
  }

  if (ev === undefined) return <p className="p-8 text-center text-muted">…</p>
  if (ev === null) return <p className="card p-8 text-center text-muted">{t('inv.notFound')}</p>

  const status = (g: Guest) => {
    const c = checkins[g.id]
    if (c) return <Tag tone="ok">{t('inv.st.in', { gate: c.gate, time: c.at ? c.at.toDate().toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '…' })}</Tag>
    if (g.status === 'revoked') return <Tag tone="danger">{t('inv.st.revoked')}</Tag>
    if (!g.token) return <Tag>{t('inv.st.unissued')}</Tag>
    return <Tag tone="primary">{t('inv.st.issued')}</Tag>
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <Link to="/admin/invitations" className="text-sm text-muted hover:text-primary">← {t('inv.title')}</Link>
          <h2 className="text-lg font-bold mt-1 flex items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular ${ev.kind === 'dinner' ? 'bg-ink text-gold' : 'bg-primary text-white'}`}>{ev.code}</span>{ev.name}</h2>
          <p className="text-sm text-muted">{[ev.date, ev.venue, ev.time, ev.dressCode].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="btn-outline h-10 px-4 text-sm" onClick={() => setSettingsOpen((o) => !o)}>{t('inv.settings')}</button>
      </div>
      {msg && <p role="status" className={`rounded-xl text-sm px-4 py-3 ${msg.tone === 'ok' ? 'bg-ink text-white' : 'bg-danger/10 text-danger'}`}>{msg.text}</p>}
      {progress && (
        <div className="grid gap-1" role="status"><div className="h-2 rounded-full bg-rule overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div><p className="text-xs text-muted tabular">{progress.label} · {progress.done} / {progress.total}</p></div>
      )}

      {settingsOpen && <Settings ev={ev} onSaved={() => { setSettingsOpen(false); say(t('inv.saved')) }} onError={fail} />}

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[[guests.length, 'inv.guests'], [printable.length, 'inv.issued'], [guests.filter((g) => g.status === 'revoked').length, 'inv.revokedN'], [admitted, 'inv.admitted']].map(([n, k]) => (
          <div key={k as string} className="card p-4"><p className="text-2xl font-bold tabular">{n as number}</p><p className="text-xs text-muted">{t(k as TKey)}</p></div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input className="input h-10 w-56" placeholder={t('inv.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-outline h-10 px-3 text-sm" onClick={() => setEditing({ id: newGuestId(), ...EMPTY, photo: null, status: 'active' })}>{t('inv.addGuest')}</button>
        <button className="btn-outline h-10 px-3 text-sm" onClick={() => setImportOpen((o) => !o)}>{t('inv.import')}</button>
        <button className="btn-primary h-10 px-3 text-sm" disabled={busy || unissued.length === 0} onClick={() => issue()}>{t('inv.issue', { n: unissued.length })}</button>
        <span className="ml-auto flex gap-2">
          <button className="btn-gold h-10 px-3 text-sm" disabled={busy || printable.length === 0} onClick={() => exportPdf('recto')}>{t('inv.pdfRecto', { n: printable.length })}</button>
          <button className="btn-outline h-10 px-3 text-sm" disabled={busy || !ev.verso} onClick={() => exportPdf('verso')}>{t('inv.pdfVerso')}</button>
        </span>
      </div>
      <p className="text-xs text-muted -mt-3">{t('inv.pdfHint', { n: PDF_CHUNK })}</p>

      {importOpen && <Import onImport={importRows} onClose={() => setImportOpen(false)} busy={busy} />}
      {editing && <GuestForm g={editing} isNew={!byId.has(editing.id)} onSave={saveGuest} onClose={() => setEditing(null)} busy={busy} />}

      {/* Guests */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">{t('inv.col.guest')}</th><th className="p-3">{ev.zoneLabel}</th><th className="p-3">{t('inv.col.code')}</th><th className="p-3">{t('inv.col.status')}</th><th className="p-3"></th></tr></thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.id} className="border-t border-rule align-middle">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-12 rounded-md overflow-hidden bg-primary-tint shrink-0 grid place-items-center text-[10px] text-muted">{g.photo ? <img src={g.photo} alt="" className="w-full h-full object-cover" /> : t('inv.noPhoto')}</span>
                    <span className="min-w-0"><span className="font-medium block truncate">{guestName(g)}</span><span className="text-xs text-muted block truncate">{[g.title, g.category].filter(Boolean).join(' · ')}</span></span>
                  </div>
                </td>
                <td className="p-3 whitespace-nowrap">{[g.zone, g.seat].filter(Boolean).join(' · ') || '—'}</td>
                <td className="p-3 tabular whitespace-nowrap">{g.code ?? '—'}</td>
                <td className="p-3">{status(g)}</td>
                <td className="p-3 whitespace-nowrap text-right">
                  <button className="text-primary text-xs mr-3" onClick={() => showPreview(g)}>{t('inv.preview')}</button>
                  {g.token && <button className="text-primary text-xs mr-3" onClick={() => downloadPng(g)}>PNG</button>}
                  <button className="text-primary text-xs mr-3" onClick={() => setEditing(g)}>{t('inv.edit')}</button>
                  {g.status === 'active'
                    ? <button className="text-danger text-xs mr-3" onClick={() => setStatus(g, 'revoked')}>{t('inv.revoke')}</button>
                    : <><button className="text-primary text-xs mr-3" onClick={() => setStatus(g, 'active')}>{t('inv.restore')}</button><button className="text-primary text-xs mr-3" onClick={() => issue([g.id])}>{t('inv.reissue')}</button></>}
                  {!g.token && <button className="text-muted text-xs" onClick={() => remove(g)}>{t('inv.delete')}</button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted">{t('inv.noGuests')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Live */}
      <section className="card p-5">
        <p className="label mb-2">{t('inv.live')} · {admitted} / {printable.length}</p>
        {scans.length === 0 ? <p className="text-sm text-muted">{t('inv.noScans')}</p> : (
          <ul className="grid gap-1 text-sm">
            {scans.map((s) => {
              const g = s.guestId ? byId.get(s.guestId) : null
              return <li key={s.id} className="flex flex-wrap gap-x-3 border-b border-rule py-1.5">
                <span className={`font-medium ${s.result === 'admitted' ? 'text-ok' : 'text-danger'}`}>{t(s.result === 'admitted' ? 'inv.scan.admitted' : 'inv.scan.refused')}{s.reason ? ` · ${t(`gate.reason.${s.reason}` as TKey)}` : ''}</span>
                <span>{g ? guestName(g) : s.guestId ?? '—'}</span>
                <span className="text-muted ml-auto tabular">{t('gate.gateN', { n: s.gate })} · {s.byEmail ?? s.by} · {fmtDate(s.at ?? undefined, lang)}</span>
              </li>
            })}
          </ul>
        )}
      </section>

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(18,24,38,.8)' }} onClick={() => setPreview(null)}>
          <img src={preview} alt="" className="max-h-[92vh] rounded-md shadow-2xl" />
        </div>
      )}
    </div>
  )
}

function Tag({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'primary' | 'ok' | 'danger' }) {
  const cls = { muted: 'bg-bg text-muted', primary: 'bg-primary-tint text-primary', ok: 'bg-ok/10 text-ok', danger: 'bg-danger/10 text-danger' }[tone]
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

/** Card settings: everything printed on the cards, saved on the event document (rules keep code and key untouchable). */
function Settings({ ev, onSaved, onError }: { ev: EventDoc; onSaved: () => void; onError: (e: unknown) => void }) {
  const { t } = useI18n()
  const [f, setF] = useState({ name: ev.name, venue: ev.venue ?? '', date: ev.date ?? '', time: ev.time ?? '', dressCode: ev.dressCode ?? '', intro: ev.intro ?? '', lead: ev.lead ?? '', titleLines: (ev.titleLines ?? []).join('\n'), zoneLabel: ev.zoneLabel ?? '', verso: ev.verso ?? '', gates: ev.gates ?? 2 })
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try { await updateDoc(doc(db, 'events', ev.id), { ...f, titleLines: f.titleLines.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3), gates: Math.min(20, Math.max(1, Number(f.gates) || 1)), updatedAt: serverTimestamp() }); onSaved() }
    catch (e) { onError(e) } finally { setBusy(false) }
  }
  const field = (k: keyof typeof f, label: string, wide = false) => (
    <label className={`grid gap-1 ${wide ? 'sm:col-span-2' : ''}`}><span className="label">{label}</span><input className="input" value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  )
  return (
    <form className="card p-5 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save() }}>
      {field('name', t('inv.f.name'), true)}
      {field('venue', t('inv.f.venue'))}{field('date', t('inv.f.date'))}{field('time', t('inv.f.time'))}{field('dressCode', t('inv.f.dressCode'))}
      {field('intro', t('inv.f.intro'))}{field('lead', t('inv.f.lead'))}
      <label className="grid gap-1 sm:col-span-2"><span className="label">{t('inv.f.titleLines')}</span><textarea className="input min-h-20" value={f.titleLines} onChange={(e) => setF({ ...f, titleLines: e.target.value })} /></label>
      {field('zoneLabel', t('inv.f.zoneLabel'))}
      <label className="grid gap-1"><span className="label">{t('inv.f.gates')}</span><input className="input" type="number" min={1} max={20} value={f.gates} onChange={(e) => setF({ ...f, gates: Number(e.target.value) })} /></label>
      <label className="grid gap-1 sm:col-span-2"><span className="label">{t('inv.f.verso')}</span><textarea className="input min-h-32" value={f.verso} onChange={(e) => setF({ ...f, verso: e.target.value })} /></label>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary h-11 px-5" type="submit" disabled={busy}>{t('inv.save')}</button></div>
    </form>
  )
}

function GuestForm({ g, isNew, onSave, onClose, busy }: { g: Guest; isNew: boolean; onSave: (g: Guest) => void; onClose: () => void; busy: boolean }) {
  const { t } = useI18n()
  const [f, setF] = useState<Guest>({ ...EMPTY, ...g })
  const file = useRef<HTMLInputElement>(null)
  async function onPhoto(fl?: File) { if (fl) setF({ ...f, photo: await photoDataUrl(fl) }) }
  const field = (k: keyof ImportRow, label: string, list?: string) => (
    <label className="grid gap-1"><span className="label">{label}</span><input className="input" list={list} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  )
  return (
    <form className="card p-5 grid gap-3 sm:grid-cols-[140px_1fr_1fr]" onSubmit={(e) => { e.preventDefault(); onSave(f) }}>
      <div className="grid gap-2 content-start">
        <button type="button" className="w-[140px] h-[175px] rounded-xl overflow-hidden bg-primary-tint grid place-items-center text-xs text-muted" onClick={() => file.current?.click()}>
          {f.photo ? <img src={f.photo} alt="" className="w-full h-full object-cover" /> : t('inv.addPhoto')}
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        {f.photo && <button type="button" className="text-xs text-danger" onClick={() => setF({ ...f, photo: null })}>{t('inv.removePhoto')}</button>}
        <p className="text-[11px] text-muted">{t('inv.photoHint')}</p>
      </div>
      {field('civility', t('inv.g.civility'), 'civilities')}
      {field('firstName', t('inv.g.firstName'))}
      {field('lastName', t('inv.g.lastName'))}
      {field('title', t('inv.g.title'))}
      {field('category', t('inv.g.category'), 'categories')}
      {field('zone', t('inv.g.zone'))}
      {field('seat', t('inv.g.seat'))}
      {field('phone', t('inv.g.phone'))}
      <datalist id="civilities"><option value="Monsieur" /><option value="Madame" /><option value="S.E.M." /><option value="S.E.Mme" /><option value="Général" /><option value="Docteur" /></datalist>
      <datalist id="categories">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="sm:col-span-3 flex gap-2 justify-end">
        <button type="button" className="btn-outline h-11 px-4" onClick={onClose}>{t('inv.cancel')}</button>
        <button type="submit" className="btn-primary h-11 px-5" disabled={busy || (!f.lastName && !f.firstName)}>{isNew ? t('inv.addGuest') : t('inv.save')}</button>
      </div>
    </form>
  )
}

function Import({ onImport, onClose, busy }: { onImport: (rows: ImportRow[]) => void; onClose: () => void; busy: boolean }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parseGuestCsv(text) : null), [text])
  async function onFile(f?: File) { if (f) setText(await f.text()) }
  return (
    <div className="card p-5 grid gap-3">
      <p className="text-sm text-muted">{t('inv.importHint')}</p>
      <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
      <textarea className="input min-h-32 font-mono text-xs" placeholder="civilite,prenom,nom,fonction,categorie,tribune,siege,telephone" value={text} onChange={(e) => setText(e.target.value)} />
      {parsed && (
        <p className="text-sm">
          <b className="tabular">{parsed.rows.length}</b> {t('inv.importRows')}{parsed.skipped ? ` · ${t('inv.importSkipped', { n: parsed.skipped })}` : ''}
          {parsed.unknownColumns.length > 0 && <span className="text-warn"> · {t('inv.importUnknown', { cols: parsed.unknownColumns.join(', ') })}</span>}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button className="btn-outline h-11 px-4" onClick={onClose}>{t('inv.cancel')}</button>
        <button className="btn-primary h-11 px-5" disabled={busy || !parsed || parsed.rows.length === 0} onClick={() => parsed && onImport(parsed.rows)}>{t('inv.importGo')}</button>
      </div>
    </div>
  )
}
