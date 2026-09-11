import { useEffect, useState } from 'react'
import { getDownloadURL, ref as sref } from 'firebase/storage'
import { storage } from '../lib/firebase'
import LiveCounter from '../components/LiveCounter'

type Snapshot = { updatedAt: string; national: number; recent: { id: string; thumbUrl: string; participantNumber: number }[] }

/** Giant screen / RTG feed: no chrome, live counter over RTDB, photo rotation from the 2-minute snapshot. `?overlay=1` gives a transparent background for the antenna overlay. */
export default function Screen() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const overlay = new URLSearchParams(location.search).get('overlay') === '1'

  useEffect(() => {
    let timer: number
    async function tick() {
      try {
        const url = await getDownloadURL(sref(storage, 'snapshot/latest.json'))
        const res = await fetch(url, { cache: 'no-store' })
        setSnap(await res.json())
      } catch { /* keep the last snapshot on screen */ }
      timer = window.setTimeout(tick, 120_000)
    }
    tick()
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className={`min-h-dvh ${overlay ? 'bg-transparent' : 'bg-primary'} text-white p-[4vw] grid grid-rows-[auto_1fr] gap-[3vw]`}>
      <header className="flex items-end justify-between">
        <div>
          <p className="uppercase tracking-widest text-[1.6vw] text-white/70">Fier d'être Guinéen · An 68</p>
          <LiveCounter size="xl" />
        </div>
        <div className="tricolor w-[20vw] h-[1vw]"><i /><i /><i /></div>
      </header>
      {!overlay && (
        <ul className="grid grid-cols-8 gap-[0.8vw] content-start">
          {(snap?.recent ?? []).slice(0, 24).map((r) => (
            <li key={r.id} className="aspect-square rounded-[1vw] overflow-hidden bg-white/10"><img src={r.thumbUrl} alt="" className="w-full h-full object-cover" /></li>
          ))}
        </ul>
      )}
    </div>
  )
}
