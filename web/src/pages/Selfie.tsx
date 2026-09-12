import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref as sref, uploadBytes } from 'firebase/storage'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth'
import { auth, ensureAnonymousUser, missionInfo, storage, submitContribution, type MissionInfo } from '../lib/firebase'
import { keepAwake, resumableUpload, type UploadHandle } from '../lib/upload'
import { compose, drawSquare, fileToBitmap, posterFromVideo, scaled, shareOrDownload, souvenirCard, toJpegUnder } from '../lib/image'
import { FRAME_IDS, SITE_DOMAIN, loadLogo, type FrameId } from '../lib/frames'
import { readVideoDuration } from '../lib/video'
import { useI18n } from '../lib/i18n'
import VideoRecorder from '../components/VideoRecorder'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

type Frame = FrameId
type Step = 1 | 2 | 3 | 4
type Clip = { blob: Blob; durationSec: number; ext: 'mp4' | 'webm' | 'mov'; name: string; lastModified: number }

const VIDEO_MIN = 40, VIDEO_MAX = 90, VIDEO_MAX_BYTES = 80 * 1024 * 1024

export default function Selfie() {
  const { t, lang } = useI18n()
  const [params] = useSearchParams()
  const kiosk = params.get('kiosk') === '1'
  const missionCode = params.get('mission') ?? ''
  const missionToken = params.get('t') ?? ''

  const [step, setStep] = useState<Step>(1)
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null)
  const [clip, setClip] = useState<Clip | null>(null) // set → this is a video selfie; `photo` is its poster
  const [recording, setRecording] = useState(false)
  const [frame, setFrame] = useState<Frame>('A')
  const [preview, setPreview] = useState<string>('')
  const [thumbs, setThumbs] = useState<Record<Frame, string> | null>(null)
  const [composed, setComposed] = useState<HTMLCanvasElement | null>(null)
  const [mode, setMode] = useState<'guinea' | 'diaspora'>('guinea')
  const [prefecture, setPrefecture] = useState('')
  const [country, setCountry] = useState('')
  const [consent, setConsent] = useState(false)
  const [minor, setMinor] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ id: string; participantNumber: number } | null>(null)
  const [upload, setUpload] = useState<{ pct: number; state: string; paused: boolean } | null>(null)
  const uploadRef = useRef<UploadHandle | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  // Kiosk tablets sign in with a staff account (the callable only honours kiosk=1 for staff tokens); citizens stay anonymous.
  const [staff, setStaff] = useState<User | null>(null)
  const [nextIn, setNextIn] = useState<number | null>(null)
  useEffect(() => {
    if (!kiosk) { ensureAnonymousUser().catch(() => {}); return }
    return onAuthStateChanged(auth, (u) => setStaff(u && !u.isAnonymous ? u : null))
  }, [kiosk])

  // Mission link (/selfie?mission=XX&t=…): validate once, then lock the country to the mission's.
  const [mission, setMission] = useState<MissionInfo | null>(null)
  const [missionState, setMissionState] = useState<'none' | 'checking' | 'ok' | 'invalid'>(missionCode && missionToken ? 'checking' : 'none')
  useEffect(() => {
    let alive = true
    if (!missionCode || !missionToken) return
    ;(async () => {
      try {
        await ensureAnonymousUser()
        const m = await missionInfo({ mission: missionCode, token: missionToken })
        if (!alive) return
        setMission(m); setMode('diaspora'); setCountry(m.country); setMissionState('ok')
      } catch { if (alive) setMissionState('invalid') }
    })()
    return () => { alive = false }
  }, [missionCode, missionToken])

  // Steps 2–4 push a history entry so the phone's back button moves one step down instead of leaving the studio.
  function goTo(next: Step) {
    if (next > 1) history.pushState({ studioStep: next }, '')
    setStep(next)
  }
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const target = (e.state as { studioStep?: Step } | null)?.studioStep
      setStep((cur) => (cur > 1 ? (target && target < cur ? target : ((cur - 1) as Step)) : cur))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const back = () => history.back()

  // Re-compose whenever the photo or frame changes.
  useEffect(() => {
    let alive = true
    if (!photo) return
    compose(photo, frame, lang).then((c) => { if (!alive) return; setComposed(c); setPreview(c.toDataURL('image/jpeg', 0.7)) })
    return () => { alive = false }
  }, [photo, frame, lang])

  // One small rendition per frame for the picker.
  useEffect(() => {
    let alive = true
    if (!photo) { setThumbs(null); return }
    const small = scaled(photo, 360)
    Promise.all(FRAME_IDS.map((f) => compose(small, f, lang).then((c) => [f, c.toDataURL('image/jpeg', 0.75)] as const)))
      .then((pairs) => { if (alive) setThumbs(Object.fromEntries(pairs) as Record<Frame, string>) })
    return () => { alive = false }
  }, [photo, lang])

  async function onFile(file?: File) {
    if (!file) return
    setError('')
    const bmp = await fileToBitmap(file)
    setClip(null)
    setPhoto(drawSquare(bmp))
    goTo(2)
  }

  /** A clip from the gallery or the camera app: measure it, refuse out-of-range, grab a poster at ~1 s. */
  async function onVideoFile(file?: File) {
    if (!file) return
    setError('')
    if (file.size > VIDEO_MAX_BYTES) { setError(t('selfie.videoTooBig', { mb: Math.round(file.size / 1_048_576) })); return }
    let duration: number
    try { duration = await readVideoDuration(file) } catch { setError(t('selfie.videoDuration', { s: 0 })); return }
    const sec = Math.round(duration)
    if (sec < VIDEO_MIN || sec > VIDEO_MAX) { setError(t('selfie.videoDuration', { s: sec })); return }
    const url = URL.createObjectURL(file)
    // Chrome only decodes frames for an element that is in the document.
    const v = document.createElement('video')
    v.preload = 'auto'; v.muted = true; v.playsInline = true
    v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(v)
    try {
      v.src = url; v.load()
      await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('bad video')) })
      await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = Math.min(1, duration / 2) })
      const poster = posterFromVideo(v)
      const ext: Clip['ext'] = /quicktime|mov/i.test(file.type) ? 'mov' : /webm/i.test(file.type) ? 'webm' : 'mp4'
      setClip({ blob: file, durationSec: sec, ext, name: file.name, lastModified: file.lastModified })
      setPhoto(poster)
      goTo(2)
    } catch { setError(t('selfie.error')) }
    finally { v.remove(); URL.revokeObjectURL(url) }
  }

  function onRecorded(blob: Blob, durationSec: number, poster: HTMLCanvasElement) {
    setRecording(false)
    const ext: Clip['ext'] = /mp4/i.test(blob.type) ? 'mp4' : 'webm'
    // A stable name so the resumable session can be found again after a reload of the same recording.
    setClip({ blob, durationSec, ext, name: `rec-${durationSec}s`, lastModified: Date.now() })
    setPhoto(poster)
    goTo(2)
  }

  const canPublish = consent && composed && (mode === 'guinea' ? !!prefecture : !!country)

  async function publish() {
    if (!composed || !canPublish) return
    setBusy(true); setError(''); setUpload(null)
    const release = await keepAwake()
    try {
      const user = await ensureAnonymousUser()
      const jpeg = await toJpegUnder(composed)
      const id = crypto.randomUUID()
      const path = `uploads/${user.uid}/${id}.jpg`
      let videoPath: string | undefined
      if (clip) {
        // Clip first (long, resumable, with progress), poster last: the poster triggers server processing,
        // which must find the contribution document within seconds of the poster landing.
        videoPath = `uploads/${user.uid}/${id}.${clip.ext}`
        const file = Object.assign(clip.blob.slice(0, clip.blob.size, clip.blob.type), { name: clip.name, lastModified: clip.lastModified })
        const h = resumableUpload({
          path: videoPath, file, contentType: clip.blob.type || `video/${clip.ext === 'mov' ? 'quicktime' : clip.ext}`,
          onProgress: (sent, total) => setUpload((u) => ({ pct: Math.round((sent / total) * 100), state: u?.state ?? 'uploading', paused: u?.paused ?? false })),
          onState: (state) => setUpload((u) => ({ pct: u?.pct ?? 0, state, paused: state === 'paused' })),
        })
        uploadRef.current = h
        await h.done
        uploadRef.current = null
        await resumableUpload({ path, file: jpeg, contentType: 'image/jpeg' }).done
      } else {
        await uploadBytes(sref(storage, path), jpeg, { contentType: 'image/jpeg' })
      }
      const pref = prefectures.find((p) => p.code === prefecture)
      const res = await submitContribution({
        path, frame,
        prefecture: mode === 'guinea' ? pref?.code : undefined,
        country: mode === 'diaspora' ? country : undefined,
        kiosk,
        consent: { public: true, minorSupervised: kiosk && minor },
        ...(clip ? { type: 'video' as const, videoPath, durationSec: clip.durationSec } : {}),
        ...(mission ? { mission: mission.code, token: missionToken } : {}),
      })
      setResult(res)
      goTo(4)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? ''
      setError(code.includes('resource-exhausted') ? t('selfie.ratelimit') : code.includes('permission-denied') ? t('selfie.blocked') : t('selfie.error'))
    } finally { setBusy(false); setUpload(null); uploadRef.current = null; release() }
  }

  function togglePause() {
    const h = uploadRef.current
    if (!h) return
    if (h.paused) h.resume(); else h.pause()
  }

  async function share() {
    if (!composed || !result) return
    const card = souvenirCard(composed, result.participantNumber, lang, await loadLogo())
    const blob = await toJpegUnder(card, 600_000)
    await shareOrDownload(blob, `fier-guineen-${result.participantNumber}.jpg`, `#FierDetreGuineen · Participant n°${result.participantNumber} · ${SITE_DOMAIN}`)
  }

  function reset() {
    setStep(1); setPhoto(null); setClip(null); setRecording(false); setComposed(null); setPreview(''); setResult(null); setConsent(false); setMinor(false); setNextIn(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
    if (videoRef.current) videoRef.current.value = ''
  }

  // Kiosk: show the number big for 15 s, then hand the tablet to the next person.
  useEffect(() => {
    if (!kiosk || step !== 4) { setNextIn(null); return }
    setNextIn(15)
    const id = window.setInterval(() => setNextIn((n) => (n === null ? null : n - 1)), 1000)
    const done = window.setTimeout(reset, 15_000)
    return () => { clearInterval(id); clearTimeout(done) }
  }, [kiosk, step]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => [t('selfie.step1'), t('selfie.step2'), t('selfie.step3'), t('selfie.step4')], [t])

  if (kiosk && !staff) return (
    <div className="mx-auto max-w-sm card p-8 text-center grid gap-4">
      <p className="label">{t('selfie.kioskTitle')}</p>
      <p className="text-muted">{t('selfie.kioskSignin')}</p>
      <button className="btn-primary h-14" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>Google</button>
    </div>
  )
  if (missionState === 'invalid') return <p className="mx-auto max-w-md card p-8 text-center text-muted">{t('video.invalid')}</p>
  if (missionState === 'checking') return <p className="p-8 text-center text-muted">{t('video.checking')}</p>

  const lockedCountry = missionState === 'ok'

  return (
    <div className={kiosk ? 'mx-auto max-w-3xl [&_button]:min-h-14 [&_select]:min-h-14 [&_input:not([type=checkbox])]:min-h-14 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6' : 'mx-auto max-w-md'}>
      <ol className="flex gap-1.5 mb-5" aria-label="progress">
        {steps.map((s, i) => <li key={s} className={`flex-1 h-1.5 rounded-full ${i < step ? 'bg-primary' : 'bg-rule'}`} title={s} />)}
      </ol>
      <h1 className="text-2xl font-bold">{steps[step - 1]}{kiosk && <span className="ml-3 text-xs font-medium text-muted align-middle">{t('selfie.kioskTitle')} · {staff?.email}</span>}</h1>
      {mission && <p className="text-sm text-muted mt-1">{t('selfie.missionTitle', { name: mission.name })}</p>}

      <div className={kiosk && step >= 2 && step <= 3 ? 'md:grid md:grid-cols-2 md:gap-6 md:items-start' : ''}>
      {step === 1 && recording && (
        <VideoRecorder minSec={VIDEO_MIN} maxSec={VIDEO_MAX} onDone={onRecorded} onCancel={() => setRecording(false)}
          onUnsupported={() => { setRecording(false); setError(t('selfie.rec.noCamera')); videoRef.current?.click() }} />
      )}
      {step === 1 && !recording && (
        <div className="card p-6 mt-4 grid gap-3">
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={videoRef} type="file" accept="video/*" capture="user" className="hidden" onChange={(e) => onVideoFile(e.target.files?.[0])} />
          <button className="btn-primary" onClick={() => { fileRef.current?.setAttribute('capture', 'user'); fileRef.current?.click() }}>{t('selfie.take')}</button>
          <button className="btn-outline" onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click() }}>{t('selfie.choose')}</button>
          <div className="border-t border-rule my-1" />
          <button className="btn-primary" onClick={() => { setError(''); setRecording(true) }}>{t('selfie.record')}</button>
          <button className="btn-outline" onClick={() => { videoRef.current?.removeAttribute('capture'); videoRef.current?.click() }}>{t('selfie.chooseVideo')}</button>
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
        </div>
      )}

      {step >= 2 && step <= 3 && preview && (
        <div className="relative mt-4">
          <img src={preview} alt="" className="w-full rounded-[var(--radius-card)] shadow-[var(--shadow-card)]" />
          {clip && <span className="absolute top-3 left-3 rounded-full bg-ink/70 text-white text-xs px-2.5 py-1 tabular">▶ {t('selfie.rec.timer', { s: clip.durationSec })}</span>}
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('selfie.step2')}>
            {FRAME_IDS.map((f) => (
              <button key={f} role="radio" aria-checked={frame === f} onClick={() => setFrame(f)}
                className={`p-1.5 rounded-[var(--radius-btn)] border-2 text-sm font-medium transition ${frame === f ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>
                <span className="block aspect-square rounded-lg overflow-hidden bg-primary-tint">
                  {thumbs && <img src={thumbs[f]} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="block mt-1.5">{t(`selfie.frame${f}`)}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button className="btn-outline px-4" onClick={back}>← {t('selfie.back')}</button>
            <button className="btn-primary" onClick={() => goTo(3)}>Suivant →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button disabled={lockedCountry} onClick={() => setMode('guinea')} className={`h-12 rounded-[var(--radius-btn)] font-medium border disabled:opacity-50 ${mode === 'guinea' ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>{t('selfie.guinea')}</button>
            <button disabled={lockedCountry} onClick={() => setMode('diaspora')} className={`h-12 rounded-[var(--radius-btn)] font-medium border disabled:opacity-50 ${mode === 'diaspora' ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>{t('selfie.diaspora')}</button>
          </div>
          {mode === 'guinea' ? (
            <label className="grid gap-1"><span className="label">{t('selfie.prefecture')}</span>
              <select className="input" value={prefecture} onChange={(e) => setPrefecture(e.target.value)}>
                <option value="">—</option>
                {prefectures.map((p) => <option key={p.code} value={p.code}>{p.name} · {p.region}</option>)}
              </select></label>
          ) : (
            <label className="grid gap-1"><span className="label">{t('selfie.country')}</span>
              <select className="input disabled:opacity-70" value={country} disabled={lockedCountry} onChange={(e) => setCountry(e.target.value)}>
                <option value="">—</option>
                {countries.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
              </select></label>
          )}
          <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t('selfie.consent')}</label>
          {kiosk && <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1" checked={minor} onChange={(e) => setMinor(e.target.checked)} />{t('selfie.minor')}</label>}
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
          {upload && (
            <div className="grid gap-2" role="status" aria-live="polite">
              <div className="h-2.5 rounded-full bg-rule overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${upload.pct}%` }} /></div>
              <div className="flex items-center gap-3 text-sm">
                <span className="tabular font-medium">{t('selfie.uploadProgress', { p: upload.pct })}</span>
                {upload.state === 'retrying' && <span className="text-warn">{t('selfie.retrying')}</span>}
                <button type="button" className="btn-outline h-9 px-3 text-xs ml-auto" onClick={togglePause}>{upload.paused ? t('video.resume') : t('video.pause')}</button>
              </div>
              <p className="text-xs text-muted">{t('selfie.uploadHint')}</p>
              <p className="text-xs text-muted">{t('selfie.resumeHint')}</p>
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button className="btn-outline px-4" disabled={busy} onClick={back}>← {t('selfie.back')}</button>
            <button className="btn-gold" disabled={!canPublish || busy} onClick={publish}>{busy ? t('selfie.uploading') : t('selfie.publish')}</button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="card p-6 mt-4 text-center grid gap-3">
          {preview && <img src={preview} alt="" className="w-full rounded-[var(--radius-btn)]" />}
          <p className="text-muted">{t('selfie.done')}</p>
          <p className={`font-bold text-primary tabular leading-none ${kiosk ? 'text-[96px]' : 'text-5xl'}`}>{result.participantNumber.toLocaleString('fr-FR')}</p>
          <p className="text-sm text-muted">{clip ? t('selfie.videoOnWall') : t('selfie.pending')}</p>
          {nextIn !== null && <p className="text-sm text-muted tabular" role="status">{t('selfie.kioskNext', { s: nextIn })}</p>}
          {!kiosk && <button className="btn-primary" onClick={share}>{t('selfie.share')}</button>}
          <button className="btn-outline" onClick={reset}>{t('selfie.again')}</button>
        </div>
      )}
      </div>
    </div>
  )
}
