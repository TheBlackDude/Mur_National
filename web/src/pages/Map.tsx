import { useEffect, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

/** D5 replaces the two lists with inline SVG maps (geoBoundaries ADM2 for Guinea, Natural Earth 110m for the world). */
export default function MapPage() {
  const { t } = useI18n()
  const [pref, setPref] = useState<Record<string, number>>({})
  const [ctry, setCtry] = useState<Record<string, number>>({})
  useEffect(() => {
    const a = onValue(ref(rtdb, 'counters/prefectures'), (s) => setPref(s.val() ?? {}))
    const b = onValue(ref(rtdb, 'counters/countries'), (s) => setCtry(s.val() ?? {}))
    return () => { a(); b() }
  }, [])
  const litP = prefectures.filter((p) => (pref[p.code] ?? 0) > 0).length
  const litC = countries.filter((c) => (ctry[c.iso] ?? 0) > 0).length
  return (
    <div>
      <h1 className="text-2xl font-bold">{t('map.title')}</h1>
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <section className="card p-6">
          <p className="label">{t('map.prefectures')}</p>
          <p className="text-4xl font-bold text-primary tabular mt-1">{litP} <span className="text-lg text-muted">/ {prefectures.length}</span></p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 text-sm">
            {prefectures.map((p) => <li key={p.code} className="flex justify-between border-b border-rule py-1"><span className={(pref[p.code] ?? 0) > 0 ? '' : 'text-muted'}>{p.name}</span><span className="tabular">{(pref[p.code] ?? 0).toLocaleString('fr-FR')}</span></li>)}
          </ul>
        </section>
        <section className="card p-6">
          <p className="label">{t('map.countries')}</p>
          <p className="text-4xl font-bold text-primary tabular mt-1">{litC} <span className="text-lg text-muted">/ 51</span></p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 text-sm">
            {countries.filter((c) => (ctry[c.iso] ?? 0) > 0).map((c) => <li key={c.iso} className="flex justify-between border-b border-rule py-1"><span>{c.name}</span><span className="tabular">{ctry[c.iso].toLocaleString('fr-FR')}</span></li>)}
          </ul>
        </section>
      </div>
    </div>
  )
}
