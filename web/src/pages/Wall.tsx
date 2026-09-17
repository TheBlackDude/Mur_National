import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db, report, withTimeout } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import Lightbox, { type LightboxItem } from '../components/Lightbox'
import Countdown from '../components/Countdown'
import { useAppConfig, useSnapshot, type Snapshot } from '../lib/snapshot'
import { placeName, regionOf, REGIONS } from '../lib/places'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

type Item = { id: string; type?: 'photo' | 'video'; thumbUrl?: string; publicUrl?: string; videoUrl?: string | null; prefecture?: string | null; country?: string | null; participantNumber: number; featured?: boolean; personality?: boolean; vip?: 'president' | 'minister' | null }
type FilterField = 'region' | 'prefecture' | 'country'
type Filter = { field: FilterField; value: string } | null
type ReportState = 'idle' | 'sent' | 'already'
type FsState = 'loading' | 'ok' | 'failed'

const PAGE = 30
const FEATURED_MAX = 10
/** A Firestore query that has not answered in this long is treated as failed: the snapshot takes over and a retry is offered. */
const FS_TIMEOUT_MS = 12_000

/** One report per device per contribution, remembered locally so a second tap says « Déjà signalé ». */
function readReported(): string[] {
  try { const v = JSON.parse(localStorage.getItem('reported') ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function rememberReported(id: string) {
  try { localStorage.setItem('reported', JSON.stringify(Array.from(new Set([...readReported(), id])))) } catch { /* private mode */ }
}

/** The 2-minute snapshot as Wall rows, honouring the current filter; personalities fall back to the featured flag it carries. */
function snapshotRows(snap: Snapshot, filter: Filter, seededOnly: boolean): Item[] {
  let rows: Item[] = snap.recent.map((r) => ({ id: r.id, type: r.type, thumbUrl: r.thumbUrl, videoUrl: r.videoUrl ?? null, participantNumber: r.participantNumber, prefecture: r.prefecture, country: r.country, featured: r.featured, vip: r.vip ?? null }))
  if (seededOnly) return rows.filter((r) => r.featured)
  if (filter) {
    rows = rows.filter((r) => filter.field === 'prefecture' ? r.prefecture === filter.value
      : filter.field === 'country' ? r.country === filter.value
        : regionOf(r.prefecture) === filter.value)
  }
  return rows
}

export default function Wall() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  // Filter and tab live in the URL so a prefecture link can be shared and restored.
  const filter = useMemo<Filter>(() => {
    for (const field of ['region', 'prefecture', 'country'] as FilterField[]) {
      const v = params.get(field)
      if (v) return { field, value: v }
    }
    return null
  }, [params])
  const openId = params.get('c')

  // Pre-launch: countdown + the seeded personalities only (?apercu=1 previews the full Wall).
  // Degraded: config/app.degraded, or Firestore failing/timing out → serve the 2-minute snapshot, filters off.
  const cfg = useAppConfig()
  const [fsState, setFsState] = useState<FsState>('loading')
  const [retry, setRetry] = useState(0)
  const preLaunch = !!cfg.launchAt && Date.now() < cfg.launchAt.getTime() && params.get('apercu') !== '1'
  const degraded = cfg.degraded || fsState === 'failed'
  // The snapshot paints first on every visit (device copy, then network); it keeps polling only while degraded.
  const { snap, ageMin } = useSnapshot(degraded ? 120_000 : 0)
  const personalities = params.get('tab') === 'personnalites'
  // Before launch only seeded content shows: personalities (plus featured on the main tab).
  const seededOnly = preLaunch || personalities

  const [featured, setFeatured] = useState<Item[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [extra, setExtra] = useState<Item | null>(null) // a ?c= item not in the loaded list
  const [reported, setReported] = useState<Record<string, ReportState>>({})
  const sentinel = useRef<HTMLDivElement>(null)

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
        ...(seededOnly ? [where('personality', '==', true)] : []),
        ...(filter && !seededOnly ? [where(filter.field, '==', filter.value)] : []),
        orderBy('createdAt', 'desc'),
        limit(preLaunch ? 60 : PAGE),
      ]
      const q = query(collection(db, 'contributions'), ...clauses, ...(!reset && after ? [startAfter(after)] : []))
      const snap = await withTimeout(getDocs(q), FS_TIMEOUT_MS, 'firestore timeout')
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) })).filter((r) => !exclude.has(r.id))
      setItems((prev) => (reset ? rows : [...prev, ...rows]))
      setCursor(snap.docs.at(-1) ?? null)
      setDone(snap.size < PAGE)
      setFsState('ok')
    } catch (e) {
      console.warn('[wall] firestore, falling back to the snapshot', e)
      setFsState('failed')
    } finally { setLoading(false) }
  }, [filter, seededOnly, preLaunch])

  // Reload on filter/tab change (or retry); on the unfiltered main tab, pin featured tiles first.
  useEffect(() => {
    let alive = true
    setItems([]); setFeatured([]); setCursor(null); setDone(false)
    if (cfg.degraded) return
    setFsState('loading')
    ;(async () => {
      let pinned: Item[] = []
      // Main tab pins featured tiles first; before launch the seeded content is personality OR featured, featured first.
      if (!filter && !personalities) {
        try {
          const snap = await withTimeout(getDocs(query(collection(db, 'contributions'), where('status', '==', 'approved'), where('featured', '==', true), orderBy('createdAt', 'desc'), limit(preLaunch ? 60 : FEATURED_MAX))), FS_TIMEOUT_MS, 'firestore timeout')
          pinned = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, 'id'>) }))
          // Protocol items lead, by number (the President's photo n° 1, his video n° 2); the rest keep newest-first.
          pinned.sort((a, b) => (a.vip ? a.participantNumber : Infinity) - (b.vip ? b.participantNumber : Infinity))
        } catch (e) { console.warn('[wall] featured', e) }
      }
      if (!alive) return
      setFeatured(pinned)
      await load(true, null, new Set(pinned.map((p) => p.id)))
    })()
    return () => { alive = false }
  }, [filter, personalities, preLaunch, load, cfg.degraded, retry])

  useEffect(() => { setReported(Object.fromEntries(readReported().map((id) => [id, 'already' as ReportState]))) }, [])

  // Snapshot rows show while Firestore is still answering and whenever it is out of the picture.
  const usingSnapshot = degraded || (fsState === 'loading' && featured.length + items.length === 0)

  // Visible list, in display order.
  const all = useMemo<Item[]>(() => {
    if (usingSnapshot) return snap ? snapshotRows(snap, filter, seededOnly) : []
    return [...featured, ...items]
  }, [usingSnapshot, snap, filter, seededOnly, featured, items])
  const openIndex = openId ? all.findIndex((x) => x.id === openId) : -1
  const openItem: Item | null = openIndex >= 0 ? all[openIndex] : (extra && extra.id === openId ? extra : null)

  // Infinite scroll: the sentinel under the grid loads the next page; the button stays as the fallback.
  const canLoadMore = !usingSnapshot && !done && items.length > 0 && !loading
  useEffect(() => {
    const el = sentinel.current
    if (!el || !canLoadMore || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) load(false, cursor, new Set(featured.map((f) => f.id)))
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [canLoadMore, cursor, featured, load])

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

  const tabClass = (active: boolean) => `px-4 h-11 rounded-[var(--radius-btn)] text-sm font-medium border ${active ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted hover:text-ink'}`
  const waiting = fsState === 'loading' && all.length === 0 && !snap
  const offline = fsState === 'failed' && !snap

  return (
    <div>
      {preLaunch && cfg.launchAt && (
        <div className="mb-6"><Countdown to={cfg.launchAt} title={t('wall.countdown.title')} lede={t('wall.countdown.lede')} /></div>
      )}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <h1 className="text-2xl font-bold">{t('wall.title')}</h1>
        <div className="flex gap-2" role="tablist">
          <button role="tab" aria-selected={!personalities} className={tabClass(!personalities)} onClick={() => setTab(false)}>{t('wall.filter.all')}</button>
          <button role="tab" aria-selected={personalities} className={tabClass(personalities)} onClick={() => setTab(true)}>{t('wall.tab.personalities')}</button>
        </div>
      </div>
      {degraded && (
        <p className="mt-3 text-sm text-muted flex flex-wrap items-center gap-x-2 gap-y-1" role="status">
          <span>{ageMin === null ? '' : `${ageMin === 0 ? t('wall.updatedNow') : t('wall.degraded', { m: ageMin })} · `}{t('wall.degradedHint')}</span>
          {fsState === 'failed' && !cfg.degraded && <button className="underline text-primary" onClick={() => setRetry((r) => r + 1)}>{t('wall.retry')}</button>}
        </p>
      )}
      {!degraded && usingSnapshot && all.length > 0 && <p className="mt-3 text-sm text-muted" role="status">{t('wall.loading')}</p>}

      {!seededOnly && (
        <div className="flex flex-wrap gap-2 mt-4">
          <fieldset disabled={degraded} className="contents">
          <select className="input h-11 w-auto flex-1 min-w-[45%] sm:min-w-0 sm:flex-none" aria-label={t('wall.filter.region')} value={filter?.field === 'region' ? filter.value : ''} onChange={(e) => setFilter('region', e.target.value)}>
            <option value="">{t('wall.filter.region')}</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="input h-11 w-auto flex-1 min-w-[45%] sm:min-w-0 sm:flex-none" aria-label={t('wall.filter.prefecture')} value={filter?.field === 'prefecture' ? filter.value : ''} onChange={(e) => setFilter('prefecture', e.target.value)}>
            <option value="">{t('wall.filter.prefecture')}</option>{prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <select className="input h-11 w-auto flex-1 min-w-[45%] sm:min-w-0 sm:flex-none" aria-label={t('wall.filter.country')} value={filter?.field === 'country' ? filter.value : ''} onChange={(e) => setFilter('country', e.target.value)}>
            <option value="">{t('wall.filter.country')}</option>{countries.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
          </select>
          {filter && <button className="btn-outline h-11 px-4" onClick={() => setFilter('region', '')}>{t('wall.filter.all')}</button>}
          </fieldset>
        </div>
      )}

      {waiting && (
        <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => <li key={i} className="aspect-square rounded-xl bg-primary-tint animate-pulse" />)}
        </ul>
      )}
      {offline && (
        <div className="card p-10 mt-6 text-center grid gap-4 justify-items-center">
          <p className="text-muted">{t('wall.offline')}</p>
          <button className="btn-primary" onClick={() => setRetry((r) => r + 1)}>{t('wall.retry')}</button>
        </div>
      )}
      {!waiting && !offline && all.length === 0 && !loading && (
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
              {it.thumbUrl && <img src={it.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
            </button>
            {it.videoUrl && <span className="absolute left-2 top-2 text-[10px] font-medium bg-ink/70 text-white rounded-full px-2 py-0.5 pointer-events-none">▶ {t('wall.video')}</span>}
            <span className="absolute left-2 bottom-2 text-[11px] font-medium bg-white/90 text-ink rounded-full px-2 py-0.5 tabular pointer-events-none">#{it.participantNumber}</span>
            {it.vip && <span className="absolute right-2 bottom-2 text-[10px] font-medium bg-gold text-ink rounded-full px-2 py-0.5 pointer-events-none">{t(it.vip === 'president' ? 'wall.protocolPresident' : 'wall.protocolMinister')}</span>}
            <button
              className="absolute right-1 top-1 min-h-7 text-[10px] text-white/80 hover:text-white bg-black/30 rounded-full px-2 py-0.5"
              onClick={(e) => { e.stopPropagation(); doReport(it.id) }}>
              {reported[it.id] === 'sent' ? t('wall.reportDone') : reported[it.id] === 'already' ? t('wall.reported') : t('wall.report')}
            </button>
          </li>
        ))}
      </ul>
      {!usingSnapshot && !done && items.length > 0 && (
        <div className="text-center mt-6">
          <div ref={sentinel} aria-hidden className="h-px" />
          <button className="btn-outline" disabled={loading} onClick={() => load(false, cursor, new Set(featured.map((f) => f.id)))}>{loading ? t('wall.loading') : t('wall.more')}</button>
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
