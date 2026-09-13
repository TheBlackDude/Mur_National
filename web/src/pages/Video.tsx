import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { keepAwake, resumableUpload, type UploadHandle } from '../lib/upload'
import { db, ensureAnonymousUser, missionInfo, submitVideo, type MissionInfo } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import countries from '../data/countries.json'
import { readVideoDuration } from '../lib/video'

const MAX_BYTES = 150 * 1024 * 1024
const MIN_SEC = 55, MAX_SEC = 95

type Phase = 'checking' | 'invalid' | 'hub' | 'ready' | 'reading' | 'uploading' | 'done'

/** Mission landing: hub (photo/video selfie on the Wall, or the 60–90 s film video) → resumable upload → participant number. */
export default function Video() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const mission = params.get('mission') ?? ''
  const token = params.get('t') ?? ''

  const [phase, setPhase] = useState<Phase>('checking')
  const [info, setInfo] = useState<MissionInfo | null>(null)
  const [contact, setContact] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [durationSec, setDurationSec] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [city, setCity] = useState('')
  const [consent, setConsent] = useState(false)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ participantNumber: number } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const task = useRef<UploadHandle | null>(null)
  // Storage path of the clip that already arrived for this same File: a retry after a failed registration skips the upload.
  const sent = useRef<{ file: File; path: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    if (!mission || !token) { setPhase('invalid'); return }
    ;(async () => {
      try {
        await ensureAnonymousUser()
        const m = await missionInfo({ mission, token })
        if (alive) { setInfo(m); setPhase('hub') }
      } catch {
        if (!alive) return
        setPhase('invalid')
        try {
          const pub = await getDoc(doc(db, 'missions', mission))
          const c = pub.exists() ? (pub.data().contact as string | undefined) : undefined
          if (alive && c) setContact(c)
        } catch { /* stays null */ }
      }
    })()
    return () => { alive = false }
  }, [mission, token])

  async function onPick(f?: File) {
    if (!f) return
    setError(''); setFile(null)
    if (f.size > MAX_BYTES) { setError(t('video.tooBig', { mb: Math.round(f.size / 1_048_576) })); return }
    setPhase('reading')
    try {
      const s = await readVideoDuration(f)
      if (s < MIN_SEC || s > MAX_SEC) { setError(t('video.duration', { s: Math.round(s) })); setPhase('ready'); return }
      setDurationSec(Math.round(s)); setFile(f)
    } catch { setError(t('video.error')) }
    setPhase('ready')
  }

  async function send() {
    if (!file || !consent || !info) return
    setError(''); setProgress(0); setPaused(false); setRetrying(false); setPhase('uploading')
    const ext = file.type === 'video/quicktime' ? 'mov' : file.type === 'video/webm' ? 'webm' : 'mp4'
    const path = `videos/${info.code}/${crypto.randomUUID()}.${ext}`
    const release = await keepAwake()
    try {
      let sentPath = sent.current?.file === file ? sent.current.path : null
      if (!sentPath) {
        const up = resumableUpload({
          path, file, contentType: file.type || 'video/mp4',
          onProgress: (n, total) => setProgress(Math.round((n / total) * 100)),
          onState: (st) => setRetrying(st === 'retrying'),
        })
        task.current = up
        // The uploader may resume a previous session for this same file, whose path differs from the fresh one.
        sentPath = (await up.done).path
        sent.current = { file, path: sentPath }
      } else setProgress(100)
      const res = await submitVideo({ path: sentPath, mission: info.code, token, durationSec, firstName: firstName || undefined, city: city || undefined, consent: { film: true } })
      sent.current = null
      setResult(res); setPhase('done')
    } catch (e) {
      const code = (e as { code?: string }).code ?? ''
      if (code.includes('not-found') || code.includes('invalid-argument') || code.includes('failed-precondition')) sent.current = null // the server dropped the file
      if ((e as Error).message !== 'cancelled') {
        setError(code.includes('resource-exhausted') ? t('video.ratelimit') : code.includes('deadline-exceeded') || code.includes('unavailable') ? t('video.timeout') : t('video.error'))
        setPhase('ready')
      }
    } finally { task.current = null; release() }
  }

  function togglePause() {
    const up = task.current
    if (!up) return
    if (paused) { up.resume(); setPaused(false) } else { up.pause(); setPaused(true) }
  }

  useEffect(() => () => { task.current?.cancel() }, [])

  function reset() { setFile(null); setDurationSec(0); setConsent(false); setResult(null); setProgress(0); setError(''); setPhase('ready'); if (input.current) input.current.value = '' }

  if (phase === 'checking') return <p className="card p-8 text-center text-muted">{t('video.checking')}</p>
  if (phase === 'invalid') return (
    <div className="card p-8 text-center grid gap-2">
      <p className="text-muted">{t('video.invalid')}</p>
      {contact && <p className="text-sm">{t('video.contact', { contact })}</p>}
    </div>
  )

  const countryName = countries.find((c) => c.iso === info?.country)?.name ?? info?.country ?? ''

  if (phase === 'hub' && info) return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">{t('video.hub.title', { name: info.name })}</h1>
      <p className="text-muted mt-2">{t('video.hub.lede')} · {countryName}</p>
      <div className="grid gap-3 mt-5">
        <Link to={`/selfie?mission=${encodeURIComponent(info.code)}&t=${encodeURIComponent(token)}`} className="card p-6 hover:shadow-lg transition block">
          <p className="text-lg font-bold text-primary">{t('video.hub.selfie')} →</p>
          <p className="text-sm text-muted mt-1">{t('video.hub.selfieLede')}</p>
        </Link>
        <button onClick={() => setPhase('ready')} className="card p-6 text-left hover:shadow-lg transition">
          <p className="text-lg font-bold text-primary">{t('video.hub.film')} →</p>
          <p className="text-sm text-muted mt-1">{t('video.hub.filmLede')}</p>
        </button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-md">
      <button className="text-sm text-muted hover:text-primary mb-3" onClick={() => { if (phase !== 'uploading') setPhase('hub') }}>← {t('video.back')}</button>
      <h1 className="text-2xl font-bold">{t('video.title')}</h1>
      <p className="text-muted mt-2">{t('video.lede')}</p>
      <div className="card p-4 mt-4 text-sm">
        <p className="font-medium">{t('video.mission', { name: info?.name ?? '' })}</p>
        <p className="text-muted">{t('video.country', { country: countryName })}</p>
      </div>

      {phase === 'done' && result ? (
        <div className="card p-6 mt-4 text-center grid gap-3">
          <p className="text-muted">{t('video.done')}</p>
          <p className="text-5xl font-bold text-primary tabular">{result.participantNumber.toLocaleString('fr-FR')}</p>
          <button className="btn-outline" onClick={reset}>{t('video.again')}</button>
        </div>
      ) : (
        <div className="card p-6 mt-4 grid gap-3">
          <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" disabled={phase === 'uploading' || phase === 'reading'} onClick={() => { input.current?.setAttribute('capture', 'user'); input.current?.click() }}>{t('video.record')}</button>
            <button className="btn-outline" disabled={phase === 'uploading' || phase === 'reading'} onClick={() => { input.current?.removeAttribute('capture'); input.current?.click() }}>{t('video.pick')}</button>
          </div>
          {(phase === 'reading' || file) && <p className="text-sm text-muted">{phase === 'reading' ? t('video.reading') : `${file?.name} · ${t('vid.duration', { s: durationSec })}`}</p>}
          <label className="grid gap-1"><span className="label">{t('video.firstName')}</span><input className="input" maxLength={40} value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={phase === 'uploading'} /></label>
          <label className="grid gap-1"><span className="label">{t('video.city')}</span><input className="input" maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} disabled={phase === 'uploading'} /></label>
          <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={phase === 'uploading'} />{t('video.consent')}</label>
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
          {phase === 'uploading' ? (
            <div className="grid gap-2">
              <div className="h-2 rounded-full bg-rule overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
              <p className="text-sm text-muted tabular" role="status">{t('video.progress', { p: progress })}{retrying && ` · ${t('video.retrying')}`}</p>
              <p className="text-xs text-muted">{t('video.uploadHint')}</p>
              <button className="btn-outline" onClick={togglePause}>{paused ? t('video.resume') : t('video.pause')}</button>
            </div>
          ) : (
            <>
              <button className="btn-gold" disabled={!file || !consent} onClick={send}>{t('video.send')}</button>
              <p className="text-xs text-muted">{t('video.resumeHint')}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
