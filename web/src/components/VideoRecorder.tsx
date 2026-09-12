import { useEffect, useRef, useState } from 'react'
import { posterFromVideo } from '../lib/image'
import { useI18n } from '../lib/i18n'

type Props = {
  minSec: number
  maxSec: number
  onDone: (blob: Blob, durationSec: number, poster: HTMLCanvasElement) => void
  onCancel: () => void
  onUnsupported: () => void
}

const MIME_CANDIDATES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

/**
 * In-browser recorder sized for 3G: 720p front camera at ~1.8 Mb/s, so 90 s lands around 20 MB.
 * Duration comes from our own timer (Chrome's webm blobs carry no duration metadata).
 * The poster is grabbed from the live preview 2 s after start.
 */
export default function VideoRecorder({ minSec, maxSec, onDone, onCancel, onUnsupported }: Props) {
  const { t } = useI18n()
  const live = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const poster = useRef<HTMLCanvasElement | null>(null)
  const startedAt = useRef(0)
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [clip, setClip] = useState<{ blob: Blob; url: string; sec: number } | null>(null)

  // Open the camera once; release everything on unmount.
  useEffect(() => {
    let alive = true
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onUnsupported(); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((tr) => tr.stop()); return }
        stream.current = s
        if (live.current) { live.current.srcObject = s; live.current.play().catch(() => {}) }
      })
      .catch(() => { if (alive) onUnsupported() })
    return () => { alive = false; stopAll() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function stopAll() {
    if (recorder.current && recorder.current.state !== 'inactive') { try { recorder.current.stop() } catch { /* already stopped */ } }
    recorder.current = null
    stream.current?.getTracks().forEach((tr) => tr.stop())
    stream.current = null
    if (live.current) live.current.srcObject = null
  }

  // Timer + auto-stop at maxSec.
  useEffect(() => {
    if (phase !== 'recording') return
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000)
      setElapsed(s)
      if (s >= maxSec) stop()
    }, 250)
    return () => clearInterval(id)
  }, [phase, maxSec]) // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    const s = stream.current
    if (!s) return
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
    let rec: MediaRecorder
    try { rec = new MediaRecorder(s, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_800_000, audioBitsPerSecond: 64_000 }) }
    catch { onUnsupported(); return }
    chunks.current = []
    poster.current = null
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
    rec.onstop = () => {
      const sec = Math.round((Date.now() - startedAt.current) / 1000)
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || 'video/webm' })
      if (!poster.current && live.current) poster.current = posterFromVideo(live.current)
      setClip((old) => { if (old) URL.revokeObjectURL(old.url); return { blob, url: URL.createObjectURL(blob), sec } })
      setPhase('review')
    }
    recorder.current = rec
    startedAt.current = Date.now()
    setElapsed(0)
    rec.start(1000)
    setPhase('recording')
    window.setTimeout(() => { if (recorder.current === rec && rec.state === 'recording' && live.current) poster.current = posterFromVideo(live.current) }, 2000)
  }

  function stop() {
    const rec = recorder.current
    if (rec && rec.state === 'recording') rec.stop()
  }

  function redo() {
    if (clip) URL.revokeObjectURL(clip.url)
    setClip(null); setElapsed(0); setPhase('idle')
    if (live.current && stream.current) { live.current.srcObject = stream.current; live.current.play().catch(() => {}) }
  }

  function keep() {
    if (!clip) return
    const p = poster.current ?? (live.current ? posterFromVideo(live.current) : document.createElement('canvas'))
    const { blob, sec, url } = clip
    stopAll()
    URL.revokeObjectURL(url)
    onDone(blob, sec, p)
  }

  const remaining = Math.max(0, minSec - elapsed)

  return (
    <div className="card p-4 mt-4 grid gap-3">
      <div className="relative aspect-square rounded-[var(--radius-btn)] overflow-hidden bg-ink">
        {phase !== 'review' && <video ref={live} muted playsInline autoPlay className="w-full h-full object-cover -scale-x-100" />}
        {phase === 'review' && clip && <video src={clip.url} controls playsInline className="w-full h-full object-cover" />}
        {phase === 'recording' && (
          <span className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-ink/70 text-white text-sm px-3 py-1 tabular" role="status">
            <i className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />{t('selfie.rec.timer', { s: elapsed })}
          </span>
        )}
      </div>
      {phase !== 'review' && <p className="text-sm text-muted">{t('selfie.rec.hint')}</p>}
      {phase === 'idle' && (
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button className="btn-outline px-4" onClick={() => { stopAll(); onCancel() }}>← {t('selfie.back')}</button>
          <button className="btn-primary" onClick={start}>{t('selfie.rec.start')}</button>
        </div>
      )}
      {phase === 'recording' && (
        <button className="btn-primary !bg-danger hover:!bg-danger/90" disabled={remaining > 0} onClick={stop}>
          {remaining > 0 ? t('selfie.rec.min', { s: remaining }) : t('selfie.rec.stop')}
        </button>
      )}
      {phase === 'review' && clip && (
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button className="btn-outline px-4" onClick={redo}>{t('selfie.rec.redo')}</button>
          <button className="btn-primary" onClick={keep}>{t('selfie.rec.keep')} · {t('selfie.rec.timer', { s: clip.sec })}</button>
        </div>
      )}
    </div>
  )
}
