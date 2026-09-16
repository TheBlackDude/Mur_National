import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useAppConfig, useSnapshot } from '../lib/snapshot'
import { MISSION_ISOS } from '../lib/places'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'
import guinea from '../data/geo/guinea.json'
import world from '../data/geo/world.json'

type Tip = { x: number; y: number; title: string; lines: string[] } | null
type Shape = { code: string; name: string; d: string; cx: number; cy: number; parent?: string }

/** Six steps of the primary blue; the leader takes the deepest one, the rest scale on a square root so small counts still show. */
const RAMP = ['#EAF1F8', '#BFD5EA', '#8FB5D7', '#5F95C4', '#3273AC', '#245985']
const GOLD = '#EBAB58'
const centroids = world.centroids as unknown as Record<string, [number, number]>
const shapes = guinea.shapes as Shape[]
/** The 44 prefectures; Conakry's five communes form one unit shown apart. */
const PREFS = prefectures.filter((p) => !p.code.startsWith('CKY-'))
const REGION_COUNT = new Set(prefectures.map((p) => p.region)).size
const NEW_2026 = new Set(shapes.filter((s) => s.parent).map((s) => s.code))

/**
 * The Map of the Nation: prefectures shaded relative to the leader (gold outline), a ranking beside the map,
 * missions lit country by country. Reads the 2-minute snapshot only.
 */
export default function MapPage() {
  const { t, lang } = useI18n()
  const { snap, ageMin } = useSnapshot(120_000)
  const { targets } = useAppConfig()
  const [tip, setTip] = useState<Tip>(null)
  const fmt = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')

  // Conakry is one polygon for five communes.
  const counts = useMemo(() => {
    const src = snap?.prefectures ?? {}
    const out: Record<string, number> = { ...src }
    out.CKY = Object.entries(src).filter(([k]) => k.startsWith('CKY-')).reduce((a, [, v]) => a + v, 0)
    return out
  }, [snap])
  const ctry = snap?.countries ?? {}

  const ranking = useMemo(() => PREFS.map((p) => ({ ...p, n: counts[p.code] ?? 0 })).filter((p) => p.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)), [counts])
  const leader = ranking[0]
  const maxP = Math.max(1, leader?.n ?? 0)
  const litP = ranking.length
  const litCommunes = prefectures.filter((p) => p.code.startsWith('CKY-') && (counts[p.code] ?? 0) > 0).length
  const diaspora = useMemo(() => MISSION_ISOS.map((iso) => ({ iso, name: countries.find((c) => c.iso === iso)?.name ?? iso, n: ctry[iso] ?? 0 })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n), [ctry])
  const litC = diaspora.length
  const maxC = Math.max(1, diaspora[0]?.n ?? 0)

  const fill = (n: number) => {
    if (n <= 0) return RAMP[0]
    if (n >= maxP) return RAMP[5]
    return RAMP[Math.min(4, 1 + Math.floor(Math.sqrt(n / maxP) * 3.999))]
  }
  const show = (e: React.SyntheticEvent<SVGElement>, title: string, lines: string[]) => {
    const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
    const p = 'clientX' in e ? (e as unknown as React.MouseEvent) : null
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: (p ? p.clientX : r.left + r.width / 2) - box.left, y: (p ? p.clientY : r.top) - box.top, title, lines })
  }
  const hide = () => setTip(null)
  const linesFor = (code: string, n: number) => [
    t('map.count', { n: fmt(n) }),
    ...(code === 'CKY' ? [t('map.communes', { n: litCommunes })] : [t('map.target', { n: fmt(targets.perPrefecture) })]),
    ...(NEW_2026.has(code) ? [t('map.newPref')] : []),
  ]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('map.title')}</h1>
        {ageMin !== null && <p className="text-xs text-muted">{ageMin === 0 ? t('wall.updatedNow') : t('map.updated', { m: ageMin })}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
        <Stat label={t('map.prefectures')} value={litP} total={PREFS.length} sub={t('map.regionCount', { n: REGION_COUNT })} />
        <Stat label={t('map.conakry')} value={counts.CKY ?? 0} sub={t('map.communes', { n: litCommunes })} />
        <Stat label={t('map.countries')} value={litC} total={MISSION_ISOS.length} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-4 mt-4">
        <section className="card p-4 sm:p-6 relative" onMouseLeave={hide}>
          <p className="label mb-3">{t('map.legend')}</p>
          <svg viewBox={guinea.viewBox} className="w-full h-auto max-w-full" role="group" aria-label={t('map.legend')}>
            {shapes.map((s) => {
              const n = counts[s.code] ?? 0
              const isLeader = !!leader && s.code === leader.code
              const lines = linesFor(s.code, n)
              return (
                <path key={s.code} d={s.d} fill={fill(n)} stroke={isLeader ? GOLD : n > 0 ? '#FFFFFF' : '#E3E8EF'} strokeWidth={isLeader ? 5 : 2} strokeLinejoin="round"
                  tabIndex={0} role="img" aria-label={`${s.name}: ${lines.join(', ')}`} className="outline-none focus:stroke-gold hover:stroke-gold transition-colors"
                  onMouseEnter={(e) => show(e, s.name, lines)} onMouseMove={(e) => show(e, s.name, lines)} onFocus={(e) => show(e, s.name, lines)} onBlur={hide}
                  onClick={(e) => show(e, s.name, lines)} />
              )
            })}
            {/* Counts on the lit prefectures; Conakry's polygon is a sliver so its number sits to the side. */}
            {shapes.filter((s) => (counts[s.code] ?? 0) > 0).map((s) => {
              const n = counts[s.code] ?? 0
              const dark = n / maxP > 0.3
              const cky = s.code === 'CKY'
              return (
                <text key={`n-${s.code}`} x={cky ? s.cx - 14 : s.cx} y={cky ? s.cy + 8 : s.cy + 7} textAnchor={cky ? 'end' : 'middle'} fontSize={cky ? 22 : 20} fontWeight={700}
                  fill={cky ? '#121826' : dark ? '#FFFFFF' : '#121826'} className="pointer-events-none select-none tabular" style={{ paintOrder: 'stroke', stroke: cky || !dark ? 'rgba(255,255,255,.85)' : 'transparent', strokeWidth: 3 }}>
                  {fmt(n)}
                </text>
              )
            })}
          </svg>
          <Legend maxLabel={leader ? `${fmt(leader.n)} · ${t('map.legendMax')}` : t('map.legendMax')} />
          <Tooltip tip={tip} />
        </section>

        <section className="card p-4 sm:p-6">
          <p className="label mb-3">{t('map.ranking')}</p>
          {ranking.length === 0 ? <p className="text-sm text-muted">{t('map.noneYet')}</p> : (
            <ol className="grid gap-2">
              {ranking.slice(0, 10).map((p, i) => (
                <li key={p.code}>
                  <Link to={`/mur?prefecture=${p.code}`} className="grid grid-cols-[1.6rem_1fr_auto] items-center gap-x-2 gap-y-1 group">
                    <span className={`tabular text-sm font-bold ${i === 0 ? 'text-gold-strong' : 'text-muted'}`}>{i + 1}</span>
                    <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">{p.name} <span className="text-muted font-normal">· {p.region}</span></span>
                    <span className="tabular text-sm font-bold">{fmt(p.n)}</span>
                    <span className="col-start-2 col-span-2 h-1.5 rounded-full bg-primary-tint overflow-hidden">
                      <span className={`block h-full rounded-full ${i === 0 ? 'bg-gold' : 'bg-primary'}`} style={{ width: `${Math.max(3, (p.n / maxP) * 100)}%` }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {leader && <p className="mt-4 text-xs text-muted">{t('map.leader')} : <b className="text-ink">{leader.name}</b> · {t('map.target', { n: fmt(targets.perPrefecture) })}</p>}
        </section>
      </div>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-4 mt-4">
        <section className="card p-4 sm:p-6 relative" onMouseLeave={hide}>
          <p className="label mb-3">{t('map.world')}</p>
          <svg viewBox={world.viewBox} className="w-full h-auto max-w-full" role="group" aria-label={t('map.world')}>
            <path d={world.land} fill="#E3E8EF" />
            {MISSION_ISOS.map((iso) => {
              const c = centroids[iso]
              if (!c) return null
              const n = ctry[iso] ?? 0
              const name = countries.find((x) => x.iso === iso)?.name ?? iso
              const lines = [n > 0 ? t('map.count', { n: fmt(n) }) : t('map.noData')]
              const r = n > 0 ? 4 + 9 * Math.sqrt(n / maxC) : 3
              return (
                <circle key={iso} cx={c[0]} cy={c[1]} r={r} fill={n > 0 ? GOLD : 'none'} fillOpacity={n > 0 ? 0.9 : 1} stroke={n > 0 ? '#FFFFFF' : '#5F6B7A'} strokeWidth={n > 0 ? 1.2 : 1.2}
                  tabIndex={0} role="img" aria-label={`${name}: ${lines.join(', ')}`} className="outline-none focus:stroke-primary hover:stroke-primary"
                  onMouseEnter={(e) => show(e, name, lines)} onMouseMove={(e) => show(e, name, lines)} onFocus={(e) => show(e, name, lines)} onBlur={hide}
                  onClick={(e) => show(e, name, lines)} />
              )
            })}
            {centroids.GN && <circle cx={centroids.GN[0]} cy={centroids.GN[1]} r={4} fill="#3273AC" stroke="#FFFFFF" strokeWidth={1.2} />}
          </svg>
          <Tooltip tip={tip} />
        </section>

        <section className="card p-4 sm:p-6">
          <p className="label mb-3">{t('map.rankingDiaspora')}</p>
          {diaspora.length === 0 ? <p className="text-sm text-muted">{t('map.noneYet')}</p> : (
            <ol className="grid gap-2">
              {diaspora.slice(0, 8).map((c, i) => (
                <li key={c.iso}>
                  <Link to={`/mur?country=${c.iso}`} className="grid grid-cols-[1.6rem_1fr_auto] items-center gap-x-2 gap-y-1 group">
                    <span className={`tabular text-sm font-bold ${i === 0 ? 'text-gold-strong' : 'text-muted'}`}>{i + 1}</span>
                    <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
                    <span className="tabular text-sm font-bold">{fmt(c.n)}</span>
                    <span className="col-start-2 col-span-2 h-1.5 rounded-full bg-gold-tint overflow-hidden">
                      <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.max(3, (c.n / maxC) * 100)}%` }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, total, sub, className = '' }: { label: string; value: number; total?: number; sub?: string; className?: string }) {
  return (
    <div className={`card p-4 sm:p-6 ${className}`}>
      <p className="label">{label}</p>
      <p className="text-3xl sm:text-4xl font-bold text-primary tabular mt-1 leading-none">
        {value.toLocaleString('fr-FR')}{total !== undefined && <span className="text-base sm:text-lg text-muted font-medium"> / {total}</span>}
      </p>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </div>
  )
}

function Legend({ maxLabel }: { maxLabel: string }) {
  return (
    <div className="mt-3 flex items-center gap-1 text-[11px] text-muted">
      <span>0</span>
      {RAMP.map((c) => <i key={c} className="h-2.5 w-6 rounded-sm" style={{ background: c }} />)}
      <span>{maxLabel}</span>
    </div>
  )
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 card px-3 py-2 text-xs" style={{ left: tip.x + 12, top: tip.y + 12 }}>
      <b>{tip.title}</b>
      {tip.lines.map((l) => <span key={l} className="block text-muted">{l}</span>)}
    </div>
  )
}
