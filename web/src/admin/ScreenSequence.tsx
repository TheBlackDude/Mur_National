import { useState } from 'react'
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { getDownloadURL, ref as sref } from 'firebase/storage'
import { auth, db, storage } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import { placeName } from '../lib/places'
import { MAX_LEADS, sequenceDurationMs, useScreenConfig, type Lead } from '../lib/screen'
import type { Contribution } from './types'

/**
 * Operator panel for the giant screen (Dashboard, editors): pick up to 10 approved selfies in order — the President
 * first — then « Lancer la séquence »: every /ecran empties, shows them one by one and gathers all faces into the map
 * of Guinea, held until « Retour à la normale ». The list lives in config/screen so every operator sees the same one.
 */
export default function ScreenSequence() {
  const { t, lang } = useI18n()
  const cfg = useScreenConfig()
  const [num, setNum] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const leads = cfg?.leads ?? []
  const running = cfg?.sequence ?? null
  const say = (text: string, tone: 'ok' | 'error' = 'ok') => setMsg({ text, tone })

  async function write(patch: Record<string, unknown>) {
    await setDoc(doc(db, 'config', 'screen'), { ...patch, updatedAt: serverTimestamp(), updatedByEmail: auth.currentUser?.email ?? null }, { merge: true })
  }
  async function saveLeads(next: Lead[]) {
    setBusy(true)
    try { await write({ leads: next.slice(0, MAX_LEADS) }) } catch (e) { say((e as Error).message, 'error') } finally { setBusy(false) }
  }

  /** A contribution as a lead: approved only, URLs resolved now so the screen never has to talk to Storage. */
  async function toLead(c: Contribution): Promise<Lead> {
    const url = async (direct: string | undefined, path: string | null | undefined) => direct ?? (path ? await getDownloadURL(sref(storage, path)).catch(() => null) : null)
    const thumbUrl = (await url(c.thumbUrl, c.files?.thumb)) ?? ''
    const publicUrl = await url(c.publicUrl, c.files?.public)
    return { id: c.id, participantNumber: c.participantNumber, thumbUrl, publicUrl, type: c.type ?? 'photo', vip: c.vip ?? null, prefecture: c.prefecture ?? null, country: c.country ?? null }
  }
  async function addNumber() {
    const n = Number(num)
    if (!Number.isInteger(n) || n <= 0) return
    setBusy(true); setMsg(null)
    try {
      if (leads.length >= MAX_LEADS) { say(t('dash.seq.max'), 'error'); return }
      const s = await getDocs(query(collection(db, 'contributions'), where('participantNumber', '==', n), limit(1)))
      if (s.empty) { say(t('dash.seq.notFound', { n }), 'error'); return }
      const c = { id: s.docs[0].id, ...(s.docs[0].data() as Omit<Contribution, 'id'>) }
      if (leads.some((l) => l.id === c.id)) { say(t('dash.seq.dup', { n }), 'error'); return }
      if (c.status !== 'approved') { say(t('dash.seq.notApproved', { n }), 'error'); return }
      await write({ leads: [...leads, await toLead(c)] })
      setNum('')
    } catch (e) { say((e as Error).message, 'error') } finally { setBusy(false) }
  }
  /** The Presidency's or the Government's approved selfies (protocol links), oldest first, the President ahead. */
  async function addVip(vip: 'president' | 'minister') {
    setBusy(true); setMsg(null)
    try {
      const s = await getDocs(query(collection(db, 'contributions'), where('vip', '==', vip), limit(30)))
      const items = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contribution, 'id'>) })).filter((c) => c.status === 'approved' && !leads.some((l) => l.id === c.id)).sort((a, b) => a.participantNumber - b.participantNumber)
      if (items.length === 0) { say(t('dash.seq.noVip'), 'error'); return }
      const room = MAX_LEADS - leads.length
      const picked = items.slice(0, room)
      const resolved = await Promise.all(picked.map(toLead))
      await write({ leads: vip === 'president' ? [...resolved, ...leads] : [...leads, ...resolved] })
      if (items.length > room) say(t('dash.seq.max'), 'error')
    } catch (e) { say((e as Error).message, 'error') } finally { setBusy(false) }
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= leads.length) return
    const next = [...leads]; [next[i], next[j]] = [next[j], next[i]]
    saveLeads(next)
  }
  async function launch() {
    setBusy(true); setMsg(null)
    try { await write({ sequence: { id: crypto.randomUUID(), startAt: serverTimestamp() } }); say(t('dash.seq.launched')) }
    catch (e) { say((e as Error).message, 'error') } finally { setBusy(false) }
  }
  async function reset() {
    setBusy(true); setMsg(null)
    try { await write({ sequence: null }); say(t('dash.seq.resetDone')) }
    catch (e) { say((e as Error).message, 'error') } finally { setBusy(false) }
  }

  const who = (l: Lead) => l.vip === 'president' ? t('screen.lead.president') : l.vip === 'minister' ? t('screen.lead.minister') : t('screen.lead.participant', { n: l.participantNumber })
  const seconds = Math.round(sequenceDurationMs(leads.length) / 1000)
  return (
    <section className="card p-4 grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="label">{t('dash.seq.title')}</p>
        <a className="text-xs text-primary underline ml-auto" href={`${import.meta.env.BASE_URL}ecran`} target="_blank" rel="noreferrer">{t('dash.seq.open')}</a>
      </div>
      <p className="text-sm text-muted">{t('dash.seq.lede')}</p>
      <p className={`text-sm font-medium ${running ? 'text-ok' : 'text-muted'}`}>
        {running ? t('dash.seq.running', { time: running.startAt.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }), who: cfg?.updatedByEmail ?? '—' }) : t('dash.seq.idle')}
      </p>
      {msg && <p role="status" className={`rounded-xl text-sm px-3 py-2 ${msg.tone === 'ok' ? 'bg-primary-tint text-primary' : 'bg-danger/10 text-danger'}`}>{msg.text}</p>}

      <ol className="grid gap-1">
        {leads.map((l, i) => (
          <li key={l.id} className="flex items-center gap-3 rounded-xl border border-rule px-2 py-1.5">
            <span className="w-6 text-center text-xs font-bold tabular text-muted">{i + 1}</span>
            <span className="w-10 h-10 rounded-md overflow-hidden bg-primary-tint shrink-0">{l.thumbUrl && <img src={l.thumbUrl} alt="" className="w-full h-full object-cover" />}</span>
            <span className="min-w-0 flex-1 text-sm"><span className="font-medium block truncate">{who(l)}</span><span className="text-xs text-muted tabular">n° {l.participantNumber}{placeName(l) ? ` · ${placeName(l)}` : ''}{l.type === 'video' ? ' · ▶' : ''}</span></span>
            <button className="text-muted text-sm px-1 disabled:opacity-30" disabled={busy || i === 0} onClick={() => move(i, -1)} title={t('dash.seq.up')}>↑</button>
            <button className="text-muted text-sm px-1 disabled:opacity-30" disabled={busy || i === leads.length - 1} onClick={() => move(i, 1)} title={t('dash.seq.down')}>↓</button>
            <button className="text-danger text-xs px-1" disabled={busy} onClick={() => saveLeads(leads.filter((x) => x.id !== l.id))}>{t('dash.seq.remove')}</button>
          </li>
        ))}
        {leads.length === 0 && <li className="text-sm text-muted">{t('dash.seq.empty')}</li>}
      </ol>

      <form className="flex flex-wrap gap-2 items-center" onSubmit={(e) => { e.preventDefault(); addNumber() }}>
        <input className="input h-10 w-40" inputMode="numeric" pattern="[0-9]*" placeholder={t('dash.seq.number')} value={num} onChange={(e) => setNum(e.target.value)} disabled={busy || leads.length >= MAX_LEADS} />
        <button className="btn-outline h-10 px-3 text-sm" type="submit" disabled={busy || !num || leads.length >= MAX_LEADS}>{t('dash.seq.add')}</button>
        <button className="btn-outline h-10 px-3 text-sm" type="button" disabled={busy || leads.length >= MAX_LEADS} onClick={() => addVip('president')}>{t('dash.seq.presidency')}</button>
        <button className="btn-outline h-10 px-3 text-sm" type="button" disabled={busy || leads.length >= MAX_LEADS} onClick={() => addVip('minister')}>{t('dash.seq.government')}</button>
        <span className="text-xs text-muted">{t('dash.seq.count', { n: leads.length, max: MAX_LEADS })}</span>
      </form>

      <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-rule">
        <button className="btn-gold h-11 px-5" disabled={busy} onClick={launch}>{t('dash.seq.launch')}</button>
        <button className="btn-outline h-11 px-5" disabled={busy || !running} onClick={reset}>{t('dash.seq.reset')}</button>
        <span className="text-xs text-muted">{t('dash.seq.duration', { s: seconds })}</span>
      </div>
    </section>
  )
}
