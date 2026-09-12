import { useEffect, useMemo, useRef, useState } from 'react'
import { useNationalCount } from '../components/LiveCounter'
import { useI18n } from '../lib/i18n'
import { useSnapshot, type SnapshotItem } from '../lib/snapshot'

const WINDOW = 24
const ROTATE_MS = 20_000
type Corner = 'tl' | 'tr' | 'bl' | 'br'

/**
 * Giant screen and RTG feed. No chrome, no cursor, no scrollbars; sized in vw/vh so 1080p and 4K look the same.
 * The counter is live over RTDB; the faces come from the 2-minute snapshot (last good copy kept on network loss).
 * `?overlay=1&corner=tr&scale=0.8` keys only the counter over the broadcast.
 */
export default function Screen() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const overlay = params.get('overlay') === '1'
  if (overlay) return <Overlay corner={(params.get('corner') as Corner) || 'br'} scale={Number(params.get('scale')) || 1} />
  return <Board />
}

function Counter({ className }: { className?: string }) {
  const { t, lang } = useI18n()
  const n = useNationalCount()
  return (
    <div className={className}>
      <p className="uppercase tracking-[0.2em] text-[1.4vw] text-white/75 leading-none">Fier d’être Guinéen · An 68</p>
      <p className="font-bold tabular text-white leading-none mt-[0.8vw] text-[9vw]">{n === null ? '—' : n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</p>
      <p className="text-[1.8vw] text-gold font-medium leading-none mt-[0.6vw]">{t('counter.label')}</p>
    </div>
  )
}

function Board() {
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

  // Warm the browser cache for the next window; the array is replaced each time, never grown.
  useEffect(() => {
    preload.current = next.map((it) => { const img = new Image(); img.decoding = 'async'; img.src = it.thumbUrl; return img })
    return () => { preload.current.forEach((img) => { img.src = '' }); preload.current = [] }
  }, [next])

  return (
    <div className="h-dvh w-screen overflow-hidden bg-primary text-white cursor-none select-none grid grid-rows-[auto_1fr] gap-[2vw] p-[3vw]">
      <header className="flex items-end justify-between">
        <Counter />
        <div className="tricolor w-[20vw] h-[1vw] rounded-full overflow-hidden"><i /><i /><i /></div>
      </header>
      <ul className={`grid grid-cols-8 grid-rows-3 gap-[0.8vw] content-stretch transition-opacity duration-400 motion-reduce:transition-none ${fade ? 'opacity-100' : 'opacity-0'}`} aria-live="off">
        {tiles.map((it) => (
          <li key={it.id} className="relative rounded-[1vw] overflow-hidden bg-white/10">
            <img src={it.thumbUrl} alt="" className="w-full h-full object-cover" />
            <span className="absolute left-[0.6vw] bottom-[0.6vw] text-[0.9vw] font-medium bg-white/90 text-ink rounded-full px-[0.6vw] py-[0.15vw] tabular">#{it.participantNumber}</span>
          </li>
        ))}
      </ul>
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
        <Counter />
      </div>
    </div>
  )
}
