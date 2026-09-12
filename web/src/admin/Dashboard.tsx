import { useEffect, useMemo, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { onValue, ref } from 'firebase/database'
import { db, rtdb } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import { useAppConfig } from '../lib/snapshot'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

type Status = 'approved' | 'pending' | 'review' | 'rejected'
const STATUSES: Status[] = ['approved', 'pending', 'review', 'rejected']
const BUCKETS = ['lt5', 'lt15', 'lt30', 'lt60', 'lt120', 'ge120'] as const
const BUCKET_LABEL: Record<(typeof BUCKETS)[number], string> = { lt5: '< 5 min', lt15: '< 15 min', lt30: '< 30 min', lt60: '< 60 min', lt120: '< 2 h', ge120: '≥ 2 h' }
const HOURS = 48

/** Same YYYYMMDDHH (UTC) key as functions/src/moderate.ts writes. */
function hourKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`
}
function lastHours(n: number): { key: string; date: Date }[] {
  const now = new Date()
  now.setUTCMinutes(0, 0, 0)
  return Array.from({ length: n }, (_, i) => { const d = new Date(now.getTime() - (n - 1 - i) * 3_600_000); return { key: hourKey(d), date: d } })
}

function useRtdb<T>(path: string): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => onValue(ref(rtdb, path), (s) => setV((s.val() as T) ?? null), () => setV(null)), [path])
  return v
}

/** SGG / DCI briefing page: totals, hourly curve, territory and diaspora progress, moderation latency. Refreshes every minute. */
export default function Dashboard({ canEdit: _canEdit }: { canEdit: boolean }) {
  const { t, lang } = useI18n()
  const loc = lang === 'fr' ? 'fr-FR' : 'en-GB'
  const fmt = (n: number) => n.toLocaleString(loc)
  const cfg = useAppConfig()
  const [counts, setCounts] = useState<Record<Status, number> | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const hourly = useRtdb<Record<string, number>>('stats/hourly')
  const hist = useRtdb<Record<string, Partial<Record<(typeof BUCKETS)[number], number>>>>('stats/latencyHist')
  const perPref = useRtdb<Record<string, number>>('counters/prefectures')
  const perCountry = useRtdb<Record<string, number>>('counters/countries')

  useEffect(() => {
    let alive = true
    async function load() {
      const r = await Promise.all(STATUSES.map((s) => getCountFromServer(query(collection(db, 'contributions'), where('status', '==', s))).then((c) => c.data().count).catch(() => 0)))
      if (!alive) return
      setCounts(Object.fromEntries(STATUSES.map((s, i) => [s, r[i]])) as Record<Status, number>)
      setUpdatedAt(new Date())
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const hours = useMemo(() => lastHours(HOURS), [updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const series = hours.map((h) => hourly?.[h.key] ?? 0)
  const maxH = Math.max(1, ...series)

  const regions = useMemo(() => {
    const byRegion = new Map<string, { count: number; n: number }>()
    for (const p of prefectures) {
      const r = byRegion.get(p.region) ?? { count: 0, n: 0 }
      r.count += perPref?.[p.code] ?? 0; r.n += 1
      byRegion.set(p.region, r)
    }
    return Array.from(byRegion, ([name, r]) => ({ name, count: r.count, target: r.n * cfg.targets.perPrefecture })).sort((a, b) => b.count - a.count)
  }, [perPref, cfg.targets.perPrefecture])
  const prefLit = prefectures.filter((p) => (perPref?.[p.code] ?? 0) > 0).length
  const countryRows = countries.map((c) => ({ ...c, count: perCountry?.[c.iso] ?? 0 })).filter((c) => c.count > 0).sort((a, b) => b.count - a.count)

  const latency = useMemo(() => {
    const total: Record<string, number> = {}
    for (const h of hours) for (const b of BUCKETS) total[b] = (total[b] ?? 0) + (hist?.[h.key]?.[b] ?? 0)
    const sum = BUCKETS.reduce((a, b) => a + (total[b] ?? 0), 0)
    if (sum === 0) return null
    const at = (q: number) => { let acc = 0; for (const b of BUCKETS) { acc += total[b] ?? 0; if (acc / sum >= q) return BUCKET_LABEL[b] } return BUCKET_LABEL.ge120 }
    return { median: at(0.5), p95: at(0.95), sum }
  }, [hist, hours])

  const approved = counts?.approved ?? 0
  const pct = Math.min(100, (approved / cfg.targets.national) * 100)

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted">{updatedAt ? t('dash.updated', { t: updatedAt.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) }) : '…'}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUSES.map((s) => (
          <div key={s} className="card p-4">
            <p className="label">{t(`dash.${s}`)}</p>
            <p className={`text-3xl font-bold tabular mt-1 ${s === 'approved' ? 'text-primary' : ''}`}>{counts ? fmt(counts[s]) : '—'}</p>
            {s === 'approved' && (
              <>
                <div className="mt-2 h-1.5 rounded-full bg-primary-tint overflow-hidden" role="progressbar" aria-valuenow={approved} aria-valuemax={cfg.targets.national}><div className="h-full bg-gold" style={{ width: `${pct}%` }} /></div>
                <p className="text-xs text-muted mt-1">{t('dash.target', { n: fmt(cfg.targets.national) })}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <section className="card p-4">
        <p className="label">{t('dash.hourly')}</p>
        <svg viewBox={`0 0 ${HOURS * 10} 170`} className="w-full h-40 mt-2" role="img" aria-label={t('dash.hourly')}>
          {series.map((v, i) => {
            const h = Math.round((v / maxH) * 140)
            return <rect key={hours[i].key} x={i * 10 + 1} y={150 - h} width={8} height={h} rx={1.5} className="fill-primary" />
          })}
          {hours.map((h, i) => (i % 6 === 0 ? <text key={h.key} x={i * 10 + 5} y={166} textAnchor="middle" className="fill-muted" fontSize="9">{h.date.toLocaleTimeString(loc, { hour: '2-digit' })}</text> : null))}
          <text x={HOURS * 10 - 2} y={10} textAnchor="end" className="fill-muted" fontSize="9">{fmt(maxH)}</text>
        </svg>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-4">
          <div className="flex justify-between items-baseline">
            <p className="label">{t('dash.regions')}</p>
            <p className="text-sm tabular"><b>{prefLit}</b> <span className="text-muted">/ {prefectures.length} · {t('dash.prefecturesLit')}</span></p>
          </div>
          <ul className="mt-3 grid gap-2">
            {regions.map((r) => (
              <li key={r.name} className="text-sm">
                <div className="flex justify-between"><span>{r.name}</span><span className="tabular text-muted">{fmt(r.count)} / {fmt(r.target)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-rule overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (r.count / r.target) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <div className="flex justify-between items-baseline">
            <p className="label">{t('dash.countries')}</p>
            <p className="text-sm tabular"><b>{countryRows.length}</b> <span className="text-muted">/ {countries.length} · {t('dash.countriesLit')}</span></p>
          </div>
          {countryRows.length === 0 ? <p className="text-sm text-muted mt-3">{t('dash.noData')}</p> : (
            <table className="w-full text-sm mt-3">
              <tbody>
                {countryRows.map((c) => <tr key={c.iso} className="border-t border-rule"><td className="py-1">{c.name}</td><td className="py-1 text-right tabular">{fmt(c.count)}</td></tr>)}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card p-4">
        <p className="label">{t('dash.latency')}</p>
        {latency ? (
          <div className="mt-2 flex flex-wrap gap-6">
            <div><p className="text-2xl font-bold">{latency.median}</p><p className="text-xs text-muted">{t('dash.median')}</p></div>
            <div><p className="text-2xl font-bold">{latency.p95}</p><p className="text-xs text-muted">{t('dash.p95')}</p></div>
            <div><p className="text-2xl font-bold tabular">{fmt(latency.sum)}</p><p className="text-xs text-muted">{t('dash.approved')} · 48 h</p></div>
          </div>
        ) : <p className="text-sm text-muted mt-2">{t('dash.noData')}</p>}
      </section>
    </div>
  )
}
