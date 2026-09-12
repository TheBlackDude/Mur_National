import { useEffect, useMemo, useState } from 'react'
import { collection, getCountFromServer, getDocs, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore'
import { getDownloadURL, ref as sref } from 'firebase/storage'
import { db, exportSelected, selectVideo, storage } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import { fmtDate } from './hooks'

const TAGS = ['fr', 'local', 'pride', 'message', 'good', 'poor'] as const
type Tag = (typeof TAGS)[number]
const TARGET = 500

type VideoDoc = { id: string; participantNumber: number; mission: string; country?: string; firstName?: string | null; city?: string | null; durationSec?: number; files?: { original?: string }; selected?: boolean; tags?: string[]; notes?: string; createdAt?: Timestamp }
type Mission = { code: string; name: string }

/** MAEIAGE selection queue: watch, tag, annotate and keep videos for the film; export kept ones to Drive. */
export default function Videos({ canSelect }: { canSelect: boolean }) {
  const { t } = useI18n()
  const [missions, setMissions] = useState<Mission[]>([])
  const [mission, setMission] = useState('')
  const [rows, setRows] = useState<VideoDoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedCount, setSelectedCount] = useState<number | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    getDocs(collection(db, 'missions')).then((s) => setMissions(s.docs.map((d) => ({ code: d.id, name: String(d.data().name ?? d.id) })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {})
  }, [])

  useEffect(() => {
    setError(null)
    const clauses = [where('type', '==', 'video'), ...(mission ? [where('mission', '==', mission)] : []), orderBy('createdAt', 'desc'), limit(50)]
    return onSnapshot(query(collection(db, 'contributions'), ...clauses),
      (s) => {
        setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VideoDoc, 'id'>) })))
        getCountFromServer(query(collection(db, 'contributions'), where('type', '==', 'video'), where('selected', '==', true))).then((r) => setSelectedCount(r.data().count)).catch(() => {})
      },
      (e) => setError(e.message))
  }, [mission])

  const missionName = (code: string) => missions.find((m) => m.code === code)?.name ?? code
  const perMission = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.selected) m.set(r.mission, (m.get(r.mission) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  async function doExport() {
    setExporting(true); setExportMsg(null)
    try { const r = await exportSelected({}); setExportMsg(t('vid.exported', { n: r.exported, s: r.skipped })) }
    catch (e: unknown) { setExportMsg(t('vid.exportError', { msg: (e as Error).message })) }
    finally { setExporting(false) }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="input h-10 w-auto" aria-label={t('vid.byMission')} value={mission} onChange={(e) => setMission(e.target.value)}>
          <option value="">{t('vid.all')}</option>
          {missions.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
        </select>
        <span className="font-bold tabular">{t('vid.selectedCount', { n: selectedCount ?? '…', target: TARGET })}</span>
        {canSelect && <button className="btn-primary h-10 px-4 ml-auto text-sm" disabled={exporting} onClick={doExport}>{t('vid.export')}</button>}
      </div>
      {exportMsg && <p className="rounded-xl bg-primary-tint text-primary text-sm p-3" role="status">{exportMsg}</p>}
      {perMission.length > 0 && (
        <p className="text-xs text-muted"><span className="label">{t('vid.perMission')}</span> · {perMission.map(([m, n]) => `${missionName(m)} ${n}`).join(' · ')}</p>
      )}
      {error && <p className="rounded-xl bg-danger/10 text-danger text-sm p-3">{t('admin.error')} <code className="text-xs">{error}</code></p>}
      {!error && rows.length === 0 && <p className="card p-8 text-center text-muted">{t('vid.none')}</p>}
      <ul className="grid gap-4 md:grid-cols-2">
        {rows.map((v) => <Card key={v.id} v={v} missionName={missionName(v.mission)} canSelect={canSelect} />)}
      </ul>
    </div>
  )
}

function Card({ v, missionName, canSelect }: { v: VideoDoc; missionName: string; canSelect: boolean }) {
  const { t, lang } = useI18n()
  const [src, setSrc] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>(v.tags ?? [])
  const [notes, setNotes] = useState(v.notes ?? '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (v.files?.original) getDownloadURL(sref(storage, v.files.original)).then((u) => live && setSrc(u)).catch(() => {})
    return () => { live = false }
  }, [v.files?.original])
  useEffect(() => { setTags(v.tags ?? []); setNotes(v.notes ?? '') }, [v.tags, v.notes])

  async function call(patch: { selected?: boolean; tags?: string[]; notes?: string }) {
    setBusy(true); setErr(null)
    try { await selectVideo({ id: v.id, ...patch }) } catch (e: unknown) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function save() { await call({ tags, notes }); setSaved(true); window.setTimeout(() => setSaved(false), 2000) }

  return (
    <li className={`card overflow-hidden ${v.selected ? 'ring-2 ring-gold' : ''}`}>
      <div className="bg-ink aspect-video">{src && <video controls preload="none" src={src} className="w-full h-full" />}</div>
      <div className="p-4 grid gap-3 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="tabular text-lg">#{v.participantNumber}</b>
          <span className="text-muted">{missionName}</span>
          {(v.firstName || v.city) && <span>{[v.firstName, v.city].filter(Boolean).join(' · ')}</span>}
          {typeof v.durationSec === 'number' && <span className="text-muted tabular">{t('vid.duration', { s: v.durationSec })}</span>}
          <span className="text-muted text-xs ml-auto">{fmtDate(v.createdAt, lang)}</span>
        </div>
        <label className="flex items-center gap-3 font-medium">
          <input type="checkbox" className="w-5 h-5" checked={!!v.selected} disabled={!canSelect || busy} onChange={(e) => call({ selected: e.target.checked })} />
          {t('vid.selected')}
        </label>
        <div>
          <p className="label mb-1.5">{t('vid.tags')}</p>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((tag: Tag) => {
              const on = tags.includes(tag)
              return <button key={tag} type="button" disabled={!canSelect} aria-pressed={on} onClick={() => setTags((x) => (on ? x.filter((y) => y !== tag) : [...x, tag]))}
                className={`h-8 px-3 rounded-full text-xs font-medium border ${on ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>{t(`vid.tag.${tag}`)}</button>
            })}
          </div>
        </div>
        <label className="grid gap-1"><span className="label">{t('vid.notes')}</span>
          <textarea className="input h-20 py-2" maxLength={500} value={notes} disabled={!canSelect} onChange={(e) => setNotes(e.target.value)} /></label>
        {err && <p className="text-danger text-xs">{err}</p>}
        {canSelect && <button className="btn-outline h-10" disabled={busy} onClick={save}>{saved ? t('vid.saved') : t('vid.save')}</button>}
      </div>
    </li>
  )
}
