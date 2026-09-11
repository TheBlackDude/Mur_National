import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db, report } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

type Item = { id: string; thumbUrl?: string; publicUrl?: string; prefecture?: string; country?: string; participantNumber: number; featured?: boolean }
const PAGE = 30
const regions = Array.from(new Set(prefectures.map((p) => p.region)))

export default function Wall() {
  const { t } = useI18n()
  const [filter, setFilter] = useState<{ field: 'region' | 'prefecture' | 'country'; value: string } | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load(reset = false) {
    setLoading(true)
    const base = [where('status', '==', 'approved'), ...(filter ? [where(filter.field, '==', filter.value)] : []), orderBy('createdAt', 'desc'), limit(PAGE)]
    const q = query(collection(db, 'contributions'), ...base, ...(!reset && cursor ? [startAfter(cursor)] : []))
    const snap = await getDocs(q)
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }))
    setItems((prev) => (reset ? rows : [...prev, ...rows]))
    setCursor(snap.docs.at(-1) ?? null)
    setDone(snap.size < PAGE)
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(true) }, [filter])

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <h1 className="text-2xl font-bold">{t('wall.title')}</h1>
        <div className="flex gap-2">
          <select className="input h-10 w-auto" value={filter?.field === 'region' ? filter.value : ''} onChange={(e) => setFilter(e.target.value ? { field: 'region', value: e.target.value } : null)}>
            <option value="">{t('wall.filter.region')}</option>{regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="input h-10 w-auto" value={filter?.field === 'prefecture' ? filter.value : ''} onChange={(e) => setFilter(e.target.value ? { field: 'prefecture', value: e.target.value } : null)}>
            <option value="">{t('wall.filter.prefecture')}</option>{prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <select className="input h-10 w-auto" value={filter?.field === 'country' ? filter.value : ''} onChange={(e) => setFilter(e.target.value ? { field: 'country', value: e.target.value } : null)}>
            <option value="">{t('wall.filter.country')}</option>{countries.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {items.length === 0 && !loading && <p className="card p-10 mt-6 text-center text-muted">{t('wall.empty')}</p>}

      <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {items.map((it) => (
          <li key={it.id} className={`relative aspect-square rounded-xl overflow-hidden bg-primary-tint ${it.featured ? 'ring-2 ring-gold' : ''}`}>
            {it.thumbUrl && <img src={it.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
            <span className="absolute left-2 bottom-2 text-[11px] font-medium bg-white/90 text-ink rounded-full px-2 py-0.5 tabular">#{it.participantNumber}</span>
            <button
              className="absolute right-1 top-1 text-[10px] text-white/70 hover:text-white bg-black/30 rounded-full px-2 py-0.5"
              onClick={() => report({ id: it.id, reason: 'public' }).catch(() => {})}>
              {t('wall.report')}
            </button>
          </li>
        ))}
      </ul>
      {!done && items.length > 0 && <div className="text-center mt-6"><button className="btn-outline" disabled={loading} onClick={() => load()}>{t('wall.more')}</button></div>}
    </div>
  )
}
