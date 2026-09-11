import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ref as sref, uploadBytes } from 'firebase/storage'
import { ensureAnonymousUser, storage, submitContribution } from '../lib/firebase'
import { compose, drawSquare, fileToBitmap, shareOrDownload, souvenirCard, toJpegUnder } from '../lib/image'
import { useI18n } from '../lib/i18n'
import prefectures from '../data/prefectures.json'
import countries from '../data/countries.json'

type Frame = 'A' | 'B' | 'C'
type Step = 1 | 2 | 3 | 4

export default function Selfie() {
  const { t, lang } = useI18n()
  const [params] = useSearchParams()
  const kiosk = params.get('kiosk') === '1'

  const [step, setStep] = useState<Step>(1)
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null)
  const [frame, setFrame] = useState<Frame>('A')
  const [preview, setPreview] = useState<string>('')
  const [composed, setComposed] = useState<HTMLCanvasElement | null>(null)
  const [mode, setMode] = useState<'guinea' | 'diaspora'>('guinea')
  const [prefecture, setPrefecture] = useState('')
  const [country, setCountry] = useState('')
  const [consent, setConsent] = useState(false)
  const [minor, setMinor] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ id: string; participantNumber: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { ensureAnonymousUser().catch(() => {}) }, [])

  // Re-compose whenever the photo or frame changes.
  useEffect(() => {
    let alive = true
    if (!photo) return
    compose(photo, frame).then((c) => { if (!alive) return; setComposed(c); setPreview(c.toDataURL('image/jpeg', 0.7)) })
    return () => { alive = false }
  }, [photo, frame])

  async function onFile(file?: File) {
    if (!file) return
    setError('')
    const bmp = await fileToBitmap(file)
    setPhoto(drawSquare(bmp))
    setStep(2)
  }

  const canPublish = consent && composed && (mode === 'guinea' ? !!prefecture : !!country)

  async function publish() {
    if (!composed || !canPublish) return
    setBusy(true); setError('')
    try {
      const user = await ensureAnonymousUser()
      const blob = await toJpegUnder(composed)
      const id = crypto.randomUUID()
      const path = `uploads/${user.uid}/${id}.jpg`
      await uploadBytes(sref(storage, path), blob, { contentType: 'image/jpeg' })
      const pref = prefectures.find((p) => p.code === prefecture)
      const res = await submitContribution({
        path, frame,
        prefecture: mode === 'guinea' ? pref?.code : undefined,
        country: mode === 'diaspora' ? country : undefined,
        kiosk,
        consent: { public: true, minorSupervised: kiosk && minor },
      })
      setResult(res)
      setStep(4)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? ''
      setError(code.includes('resource-exhausted') ? t('selfie.ratelimit') : t('selfie.error'))
    } finally { setBusy(false) }
  }

  async function share() {
    if (!composed || !result) return
    const card = souvenirCard(composed, result.participantNumber, lang)
    const blob = await toJpegUnder(card, 600_000)
    await shareOrDownload(blob, `fier-guineen-${result.participantNumber}.jpg`, `#FierDetreGuineen · Participant n°${result.participantNumber} · fierdetreguineen.gn`)
  }

  function reset() { setStep(1); setPhoto(null); setComposed(null); setPreview(''); setResult(null); setConsent(false); setMinor(false) }

  const steps = useMemo(() => [t('selfie.step1'), t('selfie.step2'), t('selfie.step3'), t('selfie.step4')], [t])

  return (
    <div className="mx-auto max-w-md">
      <ol className="flex gap-1.5 mb-5" aria-label="progress">
        {steps.map((s, i) => <li key={s} className={`flex-1 h-1.5 rounded-full ${i < step ? 'bg-primary' : 'bg-rule'}`} title={s} />)}
      </ol>
      <h1 className="text-2xl font-bold">{steps[step - 1]}</h1>

      {step === 1 && (
        <div className="card p-6 mt-4 grid gap-3">
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn-primary" onClick={() => { fileRef.current?.setAttribute('capture', 'user'); fileRef.current?.click() }}>{t('selfie.take')}</button>
          <button className="btn-outline" onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click() }}>{t('selfie.choose')}</button>
        </div>
      )}

      {step >= 2 && step <= 3 && preview && (
        <img src={preview} alt="" className="mt-4 w-full rounded-[var(--radius-card)] shadow-[var(--shadow-card)]" />
      )}

      {step === 2 && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            {(['A', 'B', 'C'] as Frame[]).map((f) => (
              <button key={f} onClick={() => setFrame(f)} className={`h-12 rounded-[var(--radius-btn)] font-medium border ${frame === f ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>
                Cadre {f}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => setStep(3)}>Suivant →</button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('guinea')} className={`h-12 rounded-[var(--radius-btn)] font-medium border ${mode === 'guinea' ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>{t('selfie.guinea')}</button>
            <button onClick={() => setMode('diaspora')} className={`h-12 rounded-[var(--radius-btn)] font-medium border ${mode === 'diaspora' ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-muted'}`}>{t('selfie.diaspora')}</button>
          </div>
          {mode === 'guinea' ? (
            <label className="grid gap-1"><span className="label">{t('selfie.prefecture')}</span>
              <select className="input" value={prefecture} onChange={(e) => setPrefecture(e.target.value)}>
                <option value="">—</option>
                {prefectures.map((p) => <option key={p.code} value={p.code}>{p.name} · {p.region}</option>)}
              </select></label>
          ) : (
            <label className="grid gap-1"><span className="label">{t('selfie.country')}</span>
              <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">—</option>
                {countries.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
              </select></label>
          )}
          <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t('selfie.consent')}</label>
          {kiosk && <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1" checked={minor} onChange={(e) => setMinor(e.target.checked)} />{t('selfie.minor')}</label>}
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}
          <button className="btn-gold" disabled={!canPublish || busy} onClick={publish}>{busy ? t('selfie.uploading') : t('selfie.publish')}</button>
        </div>
      )}

      {step === 4 && result && (
        <div className="card p-6 mt-4 text-center grid gap-3">
          {preview && <img src={preview} alt="" className="w-full rounded-[var(--radius-btn)]" />}
          <p className="text-muted">{t('selfie.done')}</p>
          <p className="text-5xl font-bold text-primary tabular">{result.participantNumber.toLocaleString('fr-FR')}</p>
          <p className="text-sm text-muted">{t('selfie.pending')}</p>
          <button className="btn-primary" onClick={share}>{t('selfie.share')}</button>
          <button className="btn-outline" onClick={reset}>{t('selfie.again')}</button>
        </div>
      )}
    </div>
  )
}
