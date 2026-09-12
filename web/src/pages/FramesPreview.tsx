import { useEffect, useState } from 'react'
import { FRAME_IDS, type FrameId } from '../lib/frames'
import { compose } from '../lib/image'
import { useI18n } from '../lib/i18n'

/** Dev-only (/dev/cadres): renders the three frames around a synthetic portrait so the design can be checked without a phone. */
export default function FramesPreview() {
  const { lang } = useI18n()
  const [urls, setUrls] = useState<Record<FrameId, string> | null>(null)
  useEffect(() => {
    const photo = fakePortrait(1600)
    Promise.all(FRAME_IDS.map((f) => compose(photo, f, lang).then((c) => [f, c.toDataURL('image/jpeg', 0.9)] as const)))
      .then((pairs) => setUrls(Object.fromEntries(pairs) as Record<FrameId, string>))
  }, [lang])
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {FRAME_IDS.map((f) => <figure key={f}><figcaption className="label mb-2">Cadre {f}</figcaption>{urls && <img src={urls[f]} alt="" className="w-full rounded-[var(--radius-card)] shadow-[var(--shadow-card)]" />}</figure>)}
    </div>
  )
}

function fakePortrait(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, '#7A8CA3'); g.addColorStop(1, '#3B4A5E')
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#C89A6B'
  ctx.beginPath(); ctx.arc(size * 0.5, size * 0.42, size * 0.17, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(size * 0.5, size * 0.95, size * 0.3, size * 0.32, 0, Math.PI, 0); ctx.fill()
  return c
}
