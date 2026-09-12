import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'

/** Days · hours · minutes · seconds until `to`. Ticks once a second; renders nothing once the date has passed. */
export default function Countdown({ to, title, lede }: { to: Date; title: string; lede?: string }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const left = Math.max(0, to.getTime() - now)
  if (left === 0) return null
  const s = Math.floor(left / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86400), t('wall.countdown.days')],
    [Math.floor((s % 86400) / 3600), t('wall.countdown.hours')],
    [Math.floor((s % 3600) / 60), t('wall.countdown.minutes')],
    [s % 60, t('wall.countdown.seconds')],
  ]
  return (
    <section className="card p-7 sm:p-10 bg-primary text-white text-center relative overflow-hidden" aria-live="off">
      <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-primary-soft/60" aria-hidden />
      <p className="label text-white/70 relative">{title}</p>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-4 max-w-lg mx-auto relative">
        {parts.map(([n, label]) => (
          <div key={label} className="rounded-2xl bg-white/10 py-3 sm:py-4">
            <p className="text-3xl sm:text-5xl font-bold tabular leading-none">{String(n).padStart(2, '0')}</p>
            <p className="text-[11px] sm:text-xs text-white/70 mt-1.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>
      {lede && <p className="mt-5 text-white/85 max-w-md mx-auto relative">{lede}</p>}
    </section>
  )
}
