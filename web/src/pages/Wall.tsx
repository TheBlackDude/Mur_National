import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db, report } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import Lightbox, { type LightboxItem } from '../components/Lightbox'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

type Item = { id: string; thumbUrl?: string; publicUrl?: string; prefecture?: string | null; country?: string | null; participantNumber: number; featured?: boolean; personality?: boolean }
type FilterField = 'region' | 'prefecture' | 'country'
type ReportState = 'idle' | 'sent' | 'already'

const PAGE = 30
const FEATURED_MAX = 10
const regions = Array.from(new Set(prefectures.map((p) => p.region)))

/** One report per device per contribution, remembered locally so a second tap says « Déjà signalé ». */
function readReported(): string[] {
  try { const v = JSON.parse(localStorage.getItem('reported') ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function rememberReported(id: string) {
  try { localStorage.setItem('reported', JSON.stringify(Array.from(new Set([...readReported(), id])))) } catch { /* private mode */ }
}

function placeName(it: { prefecture?: string | null; country?: string | null }): string | undefined {
  if (it.prefecture) { const p = prefectures.find((x) => x.code === it.prefecture); return p ? `${p.name} · ${p.region}` : it.prefecture }
  if (it.country) return countries.find((c) => c.iso === it.country)?.name ?? it.country
  return undefined
}

export default function Wall() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  // Filter and tab live in the URL so a prefecture link can be shared and restored.
  const filter = useMemo<{ field: FilterField; value: string } | null>(() => {
    for (const field of ['region', 'prefecture', 'country'] as FilterField[]) {
      const v = params.get(field)
      if (v) return { field, value: v }
    }
    return null
  }, [params])
  const personalities = params.get('tab') === 'personnalites'
  const openId = params.get('c')

  const [featured, setFeatured] = useState<Item[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [extra, setExtra] = useState<Item | null>(null) // a ?c= item not in the loaded list
  const [reported, setReported] = useState<Record<string, ReportState>>({})

  const setParam = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: false })
  }, [params, setParams])

  function setFilter(field: FilterField, value: string) {
    setParam({ region: null, prefecture: null, country: null, c: null, [field]: value || null })
  }
  function setTab(p: boolean) { setParam({ tab: p ? 'personnalites' : null, c: null }) }

  const load = useCallback(async (reset: boolean, after: QueryDocumentSnapshot<DocumentData> | null, exclude: Set<string>) => {
    setLoading(true)
    try {
      const clauses = [
        where('status', '==', 'approved'),
        ...(personalities ? [where('personality', '==', true)] : []),
        ...(filter && !personalities ? [where(filter.field, '==', filter.value)] : []),
        orderBy('createdAt', 'desc'),
        limit(PAGE),
      ]
      const q = query(collection(db, 'contributions'), ...clauses, ...(!reset && after ? [startAfter(after)] : []))
      const snap = await getDocs(q)
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) })).filter((r) => !exclude.has(r.id))
      setItems((prev) => (reset ? rows : [...prev, ...rows]))
      setCursor(snap.docs.at(-1) ?? null)
      setDone(snap.size < PAGE)
    } finally { setLoading(false) }
  }, [filter, personalities])

  // Reload on filter/tab change; on the unfiltered main tab, pin featured tiles first.
  useEffect(() => {
    let alive = true
    setItems([]); setFeatured([]); setCursor(null); setDone(false)
    ;(async () => {
      let pinned: Item[] = []
      if (!filter && !personalities) {
        try {
          const snap = await getDocs(query(collection(db, 'contributions'), where('status', '==', 'approved'), where('featured', '==', true), orderBy('createdAt', 'desc'), limit(FEATURED_MAX)))
          pinned = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }))
        } catch (e) { console.warn('[wall] featured', e) }
      }
      if (!alive) return
      setFeatured(pinned)
      await load(true, null, new Set(pinned.map((p) => p.id)))
    })()
    return () => { alive = false }
  }, [filter, personalities, load])

  useEffect(() => { setReported(Object.fromEntries(readReported().map((id) => [id, 'already' as ReportState]))) }, [])

  // Visible list, in display order.
  const all = useMemo(() => [...featured, ...items], [featured, items])
  const openIndex = openId ? all.findIndex((x) => x.id === openId) : -1
  const openItem: Item | null = openIndex >= 0 ? all[openIndex] : (extra && extra.id === openId ? extra : null)

  // /mur?c=ID for an item not in the loaded list: fetch it alone.
  useEffect(() => {
    let alive = true
    if (!openId || openIndex >= 0) { setExtra(null); return }
    getDoc(doc(db, 'contributions', openId)).then((s) => {
      if (!alive) return
      setExtra(s.exists() ? ({ id: s.id, ...(s.data() as Omit<Item, 'id'>) }) : null)
    }).catch(() => { if (alive) setExtra(null) })
    return () => { alive = false }
  }, [openId, openIndex])

  const close = useCallback(() => setParam({ c: null }), [setParam])
  const goPrev = useCallback(() => { if (openIndex > 0) setParam({ c: all[openIndex - 1].id }) }, [openIndex, all, setParam])
  const goNext = useCallback(() => { if (openIndex >= 0 && openIndex < all.length - 1) setParam({ c: all[openIndex + 1].id }) }, [openIndex, all, setParam])

  async function doReport(id: string) {
    if (reported[id]) { setReported((r) => ({ ...r, [id]: 'already' })); return }
    setReported((r) => ({ ...r, [id]: 'sent' }))
    rememberReported(id)
    try { await report({ id, reason: 'public' }) } catch { /* keep the local mark: no dialogs, no retries loop */ }
  }

  const filterPlace = filter
    ? filter.field === 'region' ? filter.value
      : filter.field === 'prefecture' ? (prefectures.find((p) => p.code === filter.value)?.name ?? filter.value)
        : (countries.find((c) => c.iso === filter.value)?.name ?? filter.value)
    : ''

  const shareUrl = (id: string) => {
    const u = new URL(location.href)
    u.searchParams.set('c', id)
    return u.toString()
  }

  const tabClass = (active: boolean) => `px-4 h-10 rounded-[var(--radius-btn)] text-sm font-medium border ${active ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted hover:text-ink'}`

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <h1 className="text-2xl font-bold">{t('wall.title')}</h1>
        <div className="flex gap-2" role="tablist">
          <button role="tab" aria-selected={!personalities} className={tabClass(!personalities)} onClick={() => setTab(false)}>{t('wall.filter.all')}</button>
          <button role="tab" aria-selected={personalities} className={tabClass(personalities)} onClick={() => setTab(true)}>{t('wall.tab.personalities')}</button>
        </div>
      </div>

      {!personalities && (
        <div className="flex flex-wrap gap-2 mt-4">
          <select className="input h-10 w-auto" aria-label={t('wall.filter.region')} value={filter?.field === 'region' ? filter.value : ''} onChange={(e) => setFilter('region', e.target.value)}>
            <option value="">{t('wall.filter.region')}</option>{regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="input h-10 w-auto" aria-label={t('wall.filter.prefecture')} value={filter?.field === 'prefecture' ? filter.value : ''} onChange={(e) => setFilter('prefecture', e.target.value)}>
            <option value="">{t('wall.filter.prefecture')}</option>{prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <select className="input h-10 w-auto" aria-label={t('wall.filter.country')} value={filter?.field === 'country' ? filter.value : ''} onChange={(e) => setFilter('country', e.target.value)}>
            <option value="">{t('wall.filter.country')}</option>{countries.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
          </select>
          {filter && <button className="btn-outline h-10 px-4" onClick={() => setFilter('region', '')}>{t('wall.filter.all')}</button>}
        </div>
      )}

      {all.length === 0 && !loading && (
        filter && !personalities ? (
          <div className="card p-10 mt-6 text-center grid gap-4 justify-items-center">
            <p className="text-muted">{t('wall.emptyFiltered', { place: filterPlace })}</p>
            <Link to="/selfie" className="btn-primary">{t('wall.emptyCta')}</Link>
          </div>
        ) : (
          <p className="card p-10 mt-6 text-center text-muted">{t('wall.empty')}</p>
        )
      )}

      <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {all.map((it) => (
          <li key={it.id} className={`relative aspect-square rounded-xl overflow-hidden bg-primary-tint ${it.featured ? 'ring-2 ring-gold' : ''}`}>
            <button
              className="absolute inset-0 w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t('wall.open', { n: it.participantNumber })}
              onClick={() => setParam({ c: it.id })}>
              {it.thumbUrl && <img src={it.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
            </button>
            <span className="absolute left-2 bottom-2 text-[11px] font-medium bg-white/90 text-ink rounded-full px-2 py-0.5 tabular pointer-events-none">#{it.participantNumber}</span>
            <button
              className="absolute right-1 top-1 text-[10px] text-white/80 hover:text-white bg-black/30 rounded-full px-2 py-0.5"
              onClick={(e) => { e.stopPropagation(); doReport(it.id) }}>
              {reported[it.id] === 'sent' ? t('wall.reportDone') : reported[it.id] === 'already' ? t('wall.reported') : t('wall.report')}
            </button>
          </li>
        ))}
      </ul>
      {!done && items.length > 0 && (
        <div className="text-center mt-6">
          <button className="btn-outline" disabled={loading} onClick={() => load(false, cursor, new Set(featured.map((f) => f.id)))}>{t('wall.more')}</button>
        </div>
      )}

      {openItem && (
        <Lightbox
          item={{ ...openItem, place: placeName(openItem) } satisfies LightboxItem}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < all.length - 1}
          onPrev={goPrev}
          onNext={goNext}
          onClose={close}
          shareUrl={shareUrl(openItem.id)}
          reportState={reported[openItem.id] ?? 'idle'}
          onReport={() => doReport(openItem.id)}
        />
      )}
    </div>
  )
}
