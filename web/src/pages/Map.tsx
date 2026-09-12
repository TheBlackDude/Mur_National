import { useMemo, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useAppConfig, useSnapshot } from '../lib/snapshot'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'
import guinea from '../data/geo/guinea.json'
import world from '../data/geo/world.json'

type Tip = { x: number; y: number; title: string; lines: string[] } | null

const RAMP = ['#EAF1F8', '#A9C6E0', '#7FAAD0', '#4E8FBD', '#3273AC', '#275E90']
const MISSION_ISOS = countries.filter((c) => c.iso !== 'XX').map((c) => c.iso)
const centroids = world.centroids as unknown as Record<string, [number, number]>

/** The Map of the Nation: prefectures shaded against the per-prefecture target, missions lit country by country. Reads the 2-minute snapshot only. */
export default function MapPage() {
  const { t, lang } = useI18n()
  const { snap, ageMin } = useSnapshot(120_000)
  const { targets } = useAppConfig()
  const [tip, setTip] = useState<Tip>(null)
  const fmt = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')

  // Conakry is one polygon for five communes.
  const pref = useMemo(() => {
    const src = snap?.prefectures ?? {}
    const out: Record<string, number> = { ...src }
    out.CKY = Object.entries(src).filter(([k]) => k.startsWith('CKY-')).reduce((a, [, v]) => a + v, 0)
    return out
  }, [snap])
  const ctry = snap?.countries ?? {}
  const litP = prefectures.filter((p) => (snap?.prefectures?.[p.code] ?? 0) > 0).length
  const litC = MISSION_ISOS.filter((iso) => (ctry[iso] ?? 0) > 0).length
  const maxC = Math.max(1, ...MISSION_ISOS.map((iso) => ctry[iso] ?? 0))

  const fill = (n: number) => {
    if (n <= 0) return RAMP[0]
    const r = n / Math.max(1, targets.perPrefecture)
    return RAMP[Math.min(5, 1 + Math.floor(r * 4.999))]
  }
  const show = (e: React.SyntheticEvent<SVGElement>, title: string, lines: string[]) => {
    const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
    const p = 'clientX' in e ? (e as unknown as React.MouseEvent) : null
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: (p ? p.clientX : r.left + r.width / 2) - box.left, y: (p ? p.clientY : r.top) - box.top, title, lines })
  }
  const hide = () => setTip(null)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('map.title')}</h1>
        {ageMin !== null && <p className="text-xs text-muted">{ageMin === 0 ? t('wall.updatedNow') : t('map.updated', { m: ageMin })}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <div className="card p-6">
          <p className="label">{t('map.prefectures')}</p>
          <p className="text-4xl font-bold text-primary tabular mt-1">{litP} <span className="text-lg text-muted">/ {prefectures.length}</span></p>
        </div>
        <div className="card p-6">
          <p className="label">{t('map.countries')}</p>
          <p className="text-4xl font-bold text-primary tabular mt-1">{litC} <span className="text-lg text-muted">/ {MISSION_ISOS.length}</span></p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <section className="card p-4 sm:p-6 relative" onMouseLeave={hide}>
          <p className="label mb-3">{t('map.legend')}</p>
          <svg viewBox={guinea.viewBox} className="w-full h-auto max-w-full" role="group" aria-label={t('map.legend')}>
            {guinea.shapes.map((s) => {
              const n = pref[s.code] ?? 0
              const lines = [t('map.count', { n: fmt(n) }), t('map.target', { n: fmt(targets.perPrefecture) })]
              return (
                <path key={s.code} d={s.d} fill={fill(n)} stroke={n > 0 ? '#FFFFFF' : '#E3E8EF'} strokeWidth={2} tabIndex={0} role="img"
                  aria-label={`${s.name}: ${lines.join(', ')}`} className="outline-none focus:stroke-gold hover:stroke-gold transition-colors"
                  onMouseEnter={(e) => show(e, s.name, lines)} onMouseMove={(e) => show(e, s.name, lines)} onFocus={(e) => show(e, s.name, lines)} onBlur={hide}
                  onClick={(e) => show(e, s.name, lines)} />
              )
            })}
          </svg>
          <Legend target={targets.perPrefecture} fmt={fmt} />
          <Tooltip tip={tip} />
        </section>

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
              const r = n > 0 ? 4 + 8 * Math.sqrt(n / maxC) : 3
              return (
                <circle key={iso} cx={c[0]} cy={c[1]} r={r} fill={n > 0 ? '#EBAB58' : 'none'} stroke={n > 0 ? '#FFFFFF' : '#5F6B7A'} strokeWidth={n > 0 ? 1 : 1.2}
                  tabIndex={0} role="img" aria-label={`${name}: ${lines.join(', ')}`} className="outline-none focus:stroke-primary hover:stroke-primary"
                  onMouseEnter={(e) => show(e, name, lines)} onMouseMove={(e) => show(e, name, lines)} onFocus={(e) => show(e, name, lines)} onBlur={hide}
                  onClick={(e) => show(e, name, lines)} />
              )
            })}
            {centroids.GN && <circle cx={centroids.GN[0]} cy={centroids.GN[1]} r={3.5} fill="#3273AC" stroke="#FFFFFF" strokeWidth={1} />}
          </svg>
          <Tooltip tip={tip} />
        </section>
      </div>
    </div>
  )
}

function Legend({ target, fmt }: { target: number; fmt: (n: number) => string }) {
  return (
    <div className="mt-3 flex items-center gap-1 text-[11px] text-muted">
      <span>0</span>
      {RAMP.map((c) => <i key={c} className="h-2.5 w-6 rounded-sm" style={{ background: c }} />)}
      <span>{fmt(target)}</span>
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
