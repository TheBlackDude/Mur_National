import { useEffect, useMemo, useRef, useState } from 'react'
import { useNationalCount } from '../components/LiveCounter'
import { useI18n } from '../lib/i18n'
import { useAppConfig, useSnapshot, type SnapshotItem } from '../lib/snapshot'
import { MISSION_ISOS, placeName } from '../lib/places'
import prefectures from '../data/prefectures.json'

const WINDOW = 24
const ROTATE_MS = 20_000
type Corner = 'tl' | 'tr' | 'bl' | 'br'
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

/**
 * Giant screen, TV and social feed. No chrome, no cursor, no scrollbars; sized in vw/vh so 1080p and 4K look the same,
 * with a portrait layout for vertical totems. Counter live over RTDB; faces, coverage and the latest participant come
 * from the 2-minute snapshot (device copy first, last good copy kept on network loss).
 * `?overlay=1&corner=tr&scale=0.8` keys only the counter over the broadcast.
 */
export default function Screen() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const overlay = params.get('overlay') === '1'
  // National broadcast: French unless the operator asks for ?lang=en, whatever the PC's browser locale says.
  const { lang, setLang } = useI18n()
  const wanted = params.get('lang') === 'en' ? 'en' : 'fr'
  useEffect(() => { if (lang !== wanted) setLang(wanted) }, [lang, wanted, setLang])
  if (overlay) return <Overlay corner={(params.get('corner') as Corner) || 'br'} scale={Number(params.get('scale')) || 1} />
  return <Board />
}

/** Eases the displayed number towards the live value so every approval is visible as motion, not a jump. */
function useTween(target: number | null, ms = 900): number | null {
  const [shown, setShown] = useState<number | null>(target)
  const from = useRef<number | null>(null)
  useEffect(() => {
    if (target === null) return
    const start = performance.now()
    const a = from.current ?? target
    if (a === target) { setShown(target); from.current = target; return }
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const v = Math.round(a + (target - a) * e)
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); from.current = shown ?? a }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  return shown
}

function Counter({ className, goal, compact = false }: { className?: string; goal?: number; compact?: boolean }) {
  const { t, lang } = useI18n()
  const shown = useTween(useNationalCount(true))
  // Never less than a sliver of gold: 135 / 500 000 would otherwise read as an empty bar.
  const pct = shown === null || !goal ? 0 : Math.min(100, Math.max(0.8, (shown / goal) * 100))
  const fmt = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')
  return (
    <div className={className}>
      <p className="uppercase tracking-[0.22em] text-[min(1.4vw,2.4vh)] text-white/75 leading-none">{t('screen.tagline')}</p>
      <p className="font-bold tabular text-white leading-none mt-[1vh] text-[min(9vw,15vh)] drop-shadow-[0_0.3vh_1vh_rgba(0,0,0,.25)]">{shown === null ? '—' : fmt(shown)}</p>
      <p className="text-[min(1.9vw,3.2vh)] text-gold font-medium leading-none mt-[1vh]">{t('counter.label')}</p>
      {!compact && goal && (
        <div className="mt-[1.6vh] w-[min(30vw,52vh)]">
          <div className="h-[0.9vh] rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={shown ?? 0} aria-valuemax={goal}>
            <div className="h-full bg-gold rounded-full transition-[width] duration-1000" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-[0.7vh] text-[min(1.1vw,1.9vh)] text-white/70 tabular">{t('counter.target', { n: fmt(goal) })}</p>
        </div>
      )}
    </div>
  )
}

function Clock() {
  const { lang } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 10_000); return () => clearInterval(id) }, [])
  const loc = lang === 'fr' ? 'fr-FR' : 'en-GB'
  return (
    <p className="text-right leading-tight text-white/80">
      <span className="block font-bold tabular text-[min(2.2vw,3.8vh)]">{now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="block text-[min(1vw,1.7vh)] capitalize">{now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    </p>
  )
}

function Board() {
  const { t } = useI18n()
  const { targets } = useAppConfig()
  const { snap } = useSnapshot(120_000)
  const recent = snap?.recent ?? []
  const [offset, setOffset] = useState(0)
  const [fade, setFade] = useState(true)
  const preload = useRef<HTMLImageElement[]>([])

  // One interval for the whole life of the page; offset wraps over whatever the latest snapshot holds.
  useEffect(() => {
    const id = window.setInterval(() => {
      setFade(false)
      window.setTimeout(() => { setOffset((o) => o + WINDOW); setFade(true) }, 400)
    }, ROTATE_MS)
    return () => window.clearInterval(id)
  }, [])

  const tiles = useMemo(() => pick(recent, offset), [recent, offset])
  const next = useMemo(() => pick(recent, offset + WINDOW), [recent, offset])
  const latest = recent[0]
  const litP = prefectures.filter((p) => (snap?.prefectures?.[p.code] ?? 0) > 0).length
  const litC = MISSION_ISOS.filter((iso) => (snap?.countries?.[iso] ?? 0) > 0).length

  // Warm the browser cache for the next window; the array is replaced each time, never grown.
  useEffect(() => {
    preload.current = next.map((it) => { const img = new Image(); img.decoding = 'async'; img.src = it.thumbUrl; return img })
    return () => { preload.current.forEach((img) => { img.src = '' }); preload.current = [] }
  }, [next])

  return (
    <div
      className="h-dvh w-screen overflow-hidden text-white cursor-none select-none grid grid-rows-[auto_1fr_auto] gap-[2.2vh] px-[3.5vw] pt-[3vh] pb-0 relative"
      style={{ background: 'radial-gradient(110vw 70vh at 85% -20%, rgba(78,143,189,.6), transparent 60%), radial-gradient(80vw 60vh at -10% 110%, rgba(39,94,144,.9), transparent 60%), linear-gradient(165deg, #2B6598 0%, #3273AC 55%, #234F7C 100%)' }}>
      {/* Header: counter · coat of arms · An 68 logo (portrait: stacked, centred) */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw] portrait:grid-cols-1 portrait:justify-items-center portrait:text-center portrait:gap-[1.5vh]">
        <Counter goal={targets.national} className="portrait:order-2" />
        <div className="flex flex-col items-center gap-[1vh] portrait:order-1">
          <img src={asset('armoiries.svg')} alt={t('screen.republic')} className="h-[min(17vh,14vw)] w-auto drop-shadow-[0_0.6vh_1.6vh_rgba(0,0,0,.35)]" />
          <p className="uppercase tracking-[0.3em] text-[min(0.95vw,1.6vh)] text-white/80 leading-none">{t('screen.republic')}</p>
        </div>
        <div className="flex items-center justify-end gap-[1.6vw] portrait:order-3 portrait:justify-center">
          <Clock />
          {/* An 68 seal: white card with a gold rim, a fifth larger than the first cut (17 Sept 2026). */}
          <div className="bg-white rounded-[min(1.6vw,2.8vh)] p-[min(0.7vw,1.2vh)] shadow-[0_1vh_3vh_rgba(0,0,0,.32)] ring-[0.25vh] ring-gold/80">
            <img src={asset('logo-68-lg.png')} alt="An 68" className="h-[min(16vh,13.5vw)] w-auto block" />
          </div>
        </div>
      </header>

      {/* Faces: 8 × 3 on a 16:9 screen, 4 × 6 on a vertical one */}
      <ul className={`grid grid-cols-8 grid-rows-3 portrait:grid-cols-4 portrait:grid-rows-6 gap-[min(0.8vw,1.4vh)] content-stretch min-h-0 transition-opacity duration-400 motion-reduce:transition-none ${fade ? 'opacity-100' : 'opacity-0'}`} aria-live="off">
        {tiles.map((it, i) => {
          const isLatest = latest && it.id === latest.id
          return (
            <li key={`${it.id}-${offset}`} className={`screen-tile relative rounded-[min(1vw,1.8vh)] overflow-hidden bg-white/10 shadow-[0_0.6vh_1.6vh_rgba(0,0,0,.18)] ${isLatest ? 'ring-[0.35vh] ring-gold' : ''}`} style={{ animationDelay: `${i * 35}ms` }}>
              <img src={it.thumbUrl} alt="" className="w-full h-full object-cover" />
              <span className="absolute left-[0.6vw] bottom-[0.6vw] text-[min(0.95vw,1.7vh)] font-medium bg-white/92 text-ink rounded-full px-[0.6vw] py-[0.15vw] tabular">#{it.participantNumber}</span>
              {isLatest && <span className="absolute right-[0.6vw] top-[0.6vw] text-[min(0.85vw,1.5vh)] font-bold uppercase tracking-wider bg-gold text-ink rounded-full px-[0.6vw] py-[0.15vw]">{t('screen.new')}</span>}
              {it.type === 'video' && <span className="absolute left-[0.6vw] top-[0.6vw] text-[min(0.85vw,1.5vh)] font-medium bg-ink/70 text-white rounded-full px-[0.6vw] py-[0.15vw]">▶</span>}
            </li>
          )
        })}
      </ul>

      {/* Footer: QR to the studio · latest participant + coverage · hashtag, then the flag hairline */}
      <footer className="grid grid-cols-[auto_1fr_auto] items-center gap-[2vw] pb-[2.2vh] portrait:grid-cols-[auto_1fr] portrait:gap-[3vw]">
        <div className="flex items-center gap-[1.2vw]">
          <div className="bg-white rounded-[min(1vw,1.8vh)] p-[min(0.45vw,0.8vh)] shadow-[0_0.6vh_1.6vh_rgba(0,0,0,.25)]">
            <img src={asset('qr-selfie.svg')} alt="guineen68.com/selfie" className="h-[min(10vh,9vw)] w-[min(10vh,9vw)] block" />
          </div>
          <p className="leading-tight">
            <span className="block font-bold text-[min(1.5vw,2.6vh)]">{t('screen.scan')}</span>
            <span className="block text-white/80 text-[min(1.2vw,2.1vh)] tabular">guineen68.com</span>
          </p>
        </div>
        <div className="min-w-0 text-center portrait:text-left">
          {latest && (
            <p className="truncate text-[min(1.7vw,3vh)] leading-tight">
              <span className="text-white/70">{t('screen.latest')} · </span>
              <span className="font-bold tabular">n° {latest.participantNumber.toLocaleString('fr-FR')}</span>
              {placeName(latest) && <span className="text-white/90"> · {placeName(latest)}</span>}
            </p>
          )}
          <p className="mt-[0.6vh] text-[min(1.2vw,2.1vh)] text-white/75 tabular">{t('screen.coverage', { p: litP, t: prefectures.length, c: litC })}</p>
        </div>
        <p className="font-bold text-gold text-[min(1.8vw,3.2vh)] leading-none text-right portrait:col-span-2 portrait:text-center">#FierDetreGuineen</p>
      </footer>
      <div className="tricolor absolute left-0 right-0 bottom-0 h-[0.6vh]" aria-hidden><i /><i /><i /></div>
    </div>
  )
}

/** Window of 24 starting at `offset` (wrapping) over the recent list; an empty list yields nothing. */
function pick(list: SnapshotItem[], offset: number): SnapshotItem[] {
  if (list.length === 0) return []
  const start = offset % list.length
  const out: SnapshotItem[] = []
  for (let i = 0; i < Math.min(WINDOW, list.length); i++) out.push(list[(start + i) % list.length])
  return out
}

function Overlay({ corner, scale }: { corner: Corner; scale: number }) {
  // OBS keys on the page background: the body must be transparent too, not the app's off-white.
  useEffect(() => {
    const prev = { html: document.documentElement.style.background, body: document.body.style.background }
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return () => { document.documentElement.style.background = prev.html; document.body.style.background = prev.body }
  }, [])
  const pos: Record<Corner, { cls: string; origin: string }> = {
    tl: { cls: 'top-[5vh] left-[5vw]', origin: 'top left' },
    tr: { cls: 'top-[5vh] right-[5vw] text-right', origin: 'top right' },
    bl: { cls: 'bottom-[5vh] left-[5vw]', origin: 'bottom left' },
    br: { cls: 'bottom-[5vh] right-[5vw] text-right', origin: 'bottom right' },
  }
  const p = pos[corner] ?? pos.br
  return (
    <div className="h-dvh w-screen overflow-hidden bg-transparent cursor-none select-none relative">
      <div className={`absolute ${p.cls} drop-shadow-[0_0.2vw_0.6vw_rgba(0,0,0,.6)]`} style={{ transform: `scale(${scale})`, transformOrigin: p.origin }}>
        <Counter compact />
      </div>
    </div>
  )
}
