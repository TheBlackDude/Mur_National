import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, addDoc } from 'firebase/firestore'
import jsQR from 'jsqr'
import { db, auth } from '../lib/firebase'
import { useI18n, type TKey } from '../lib/i18n'
import { guestName, importEventKey, normalizeCode, parseToken, verifyToken, type Checkin, type EventDoc, type Guest, type RefusalReason } from '../lib/invitations'

type Verdict =
  | { kind: 'admitted'; guest: Guest; at: Date }
  | { kind: 'refused'; reason: RefusalReason; guest?: Guest; prior?: Checkin }
  | { kind: 'check'; guest: Guest; at: Date } // admitted, no photo on file: identity document

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`
const LS = { event: 'gate.event', gate: 'gate.gate' }

/**
 * /controle — the gate app. Firestore persistence is on for this route (firebase.ts), so the guest list, photos and
 * check-ins live on the phone once "Préparer" has run; scanning and admitting need no network. A check-in is a
 * create-only document: when two phones admit the same card offline, the second write is rejected at sync and the
 * device shows the conflict. Scans (admitted or refused) are logged for the Cabinet's live view.
 */
export default function Gate() {
  const { t } = useI18n()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [roleOk, setRoleOk] = useState(false)
  useEffect(() => onAuthStateChanged(auth, async (u) => {
    const staff = u && !u.isAnonymous ? u : null
    setUser(staff)
    const claims = staff ? (await staff.getIdTokenResult()).claims : {}
    setRoleOk(claims.gate === true || claims.protocol === true || claims.admin === true)
  }), [])

  if (user === undefined) return <Shell><p className="text-center text-white/70">…</p></Shell>
  if (!user) return (
    <Shell>
      <div className="grid gap-4 text-center">
        <img src={asset('armoiries.svg')} alt="" className="h-24 mx-auto" />
        <h1 className="text-2xl font-bold">{t('gate.title')}</h1>
        <p className="text-white/75">{t('gate.signin')}</p>
        <button className="btn-white h-14" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>Google</button>
      </div>
    </Shell>
  )
  if (!roleOk) return (
    <Shell>
      <div className="grid gap-4 text-center">
        <p>{t('gate.noRole')}</p><p className="text-xs text-white/60">{user.email}</p>
        <button className="btn-outline !border-white/60 !text-white" onClick={() => signOut(auth)}>{t('admin.signout')}</button>
      </div>
    </Shell>
  )
  return <Station user={user} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-ink text-white px-5 py-8 grid content-center"><div className="mx-auto w-full max-w-sm">{children}</div></div>
}

function Station({ user }: { user: User }) {
  const { t, lang } = useI18n()
  const [events, setEvents] = useState<EventDoc[]>([])
  const [eventId, setEventId] = useState<string>(() => localStorage.getItem(LS.event) ?? '')
  const [gate, setGate] = useState<number>(() => Number(localStorage.getItem(LS.gate)) || 1)
  const [guests, setGuests] = useState<Map<string, Guest>>(new Map())
  const [checkins, setCheckins] = useState<Map<string, Checkin>>(new Map())
  const [fromCache, setFromCache] = useState<boolean | null>(null)
  const [ready, setReady] = useState(false)
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [mode, setMode] = useState<'setup' | 'scan' | 'manual' | 'list'>('setup')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [conflict, setConflict] = useState<string | null>(null)
  const ev = events.find((e) => e.id === eventId) ?? null

  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off) } }, [])
  useEffect(() => onSnapshot(query(collection(db, 'events'), orderBy('createdAt', 'desc')), { includeMetadataChanges: true }, (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, 'id'>) })))), [])
  useEffect(() => {
    if (!eventId) return
    setReady(false)
    const u1 = onSnapshot(collection(db, 'events', eventId, 'guests'), { includeMetadataChanges: true }, (s) => {
      setGuests(new Map(s.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Omit<Guest, 'id'>) }])))
      setFromCache(s.metadata.fromCache); setReady(true)
    })
    const u2 = onSnapshot(collection(db, 'events', eventId, 'checkins'), { includeMetadataChanges: true }, (s) => setCheckins(new Map(s.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Omit<Checkin, 'id'>) }]))))
    return () => { u1(); u2() }
  }, [eventId])
  useEffect(() => { if (ev?.publicKey) importEventKey(ev.publicKey).then(setKey).catch(() => setKey(null)) }, [ev?.publicKey])
  useEffect(() => { localStorage.setItem(LS.event, eventId); localStorage.setItem(LS.gate, String(gate)) }, [eventId, gate])

  const admittedCount = checkins.size
  const byCode = useMemo(() => new Map(Array.from(guests.values()).filter((g) => g.code).map((g) => [g.code!, g])), [guests])

  const log = useCallback((result: 'admitted' | 'refused', guestId: string | null, reason: RefusalReason | null) => {
    addDoc(collection(db, 'events', eventId, 'scans'), { result, guestId, reason, gate, by: user.uid, byEmail: user.email ?? null, at: serverTimestamp() }).catch(() => {})
  }, [eventId, gate, user])

  /** Admits a guest already validated: create-only check-in, optimistic offline; a rejected sync surfaces as a conflict. */
  const admit = useCallback((g: Guest) => {
    const at = new Date()
    setDoc(doc(db, 'events', eventId, 'checkins', g.id), { gate, by: user.uid, byEmail: user.email ?? null, at: serverTimestamp(), offline: !navigator.onLine })
      .catch(() => setConflict(t('gate.conflict', { name: guestName(g) })))
    log('admitted', g.id, null)
    setVerdict(g.photo ? { kind: 'admitted', guest: g, at } : { kind: 'check', guest: g, at })
  }, [eventId, gate, user, log, t])

  const decide = useCallback(async (raw: string) => {
    if (!ev) return
    const tok = parseToken(raw)
    if (!tok) { setVerdict({ kind: 'refused', reason: 'unreadable' }); log('refused', null, 'unreadable'); return }
    if (tok.eventCode !== ev.code) { setVerdict({ kind: 'refused', reason: 'other_event' }); log('refused', tok.guestId, 'other_event'); return }
    if (!key || !(await verifyToken(key, tok))) { setVerdict({ kind: 'refused', reason: 'bad_signature' }); log('refused', tok.guestId, 'bad_signature'); return }
    const g = guests.get(tok.guestId)
    if (!g || g.code !== tok.code) { setVerdict({ kind: 'refused', reason: 'unknown' }); log('refused', tok.guestId, 'unknown'); return }
    if (g.status === 'revoked') { setVerdict({ kind: 'refused', reason: 'revoked', guest: g }); log('refused', g.id, 'revoked'); return }
    const prior = checkins.get(g.id)
    if (prior) { setVerdict({ kind: 'refused', reason: 'already', guest: g, prior }); log('refused', g.id, 'already'); return }
    admit(g)
  }, [ev, key, guests, checkins, admit, log])

  const decideCode = useCallback((code: string) => {
    const g = byCode.get(normalizeCode(code))
    if (!g) { setVerdict({ kind: 'refused', reason: 'unknown' }); log('refused', null, 'unknown'); return }
    if (g.status === 'revoked') { setVerdict({ kind: 'refused', reason: 'revoked', guest: g }); log('refused', g.id, 'revoked'); return }
    const prior = checkins.get(g.id)
    if (prior) { setVerdict({ kind: 'refused', reason: 'already', guest: g, prior }); log('refused', g.id, 'already'); return }
    admit(g)
  }, [byCode, checkins, admit, log])

  const time = (d: Date | null | undefined) => d ? d.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '…'

  if (mode === 'setup' || !ev) return (
    <Shell>
      <div className="grid gap-4">
        <div className="flex items-center gap-3"><img src={asset('armoiries.svg')} alt="" className="h-12" /><div><h1 className="text-xl font-bold leading-tight">{t('gate.title')}</h1><p className="text-xs text-white/60">{user.email}</p></div></div>
        <label className="grid gap-1"><span className="label text-white/60">{t('gate.event')}</span>
          <select className="input text-ink" value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">—</option>{events.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label>
        <label className="grid gap-1"><span className="label text-white/60">{t('gate.gate')}</span>
          <select className="input text-ink" value={gate} onChange={(e) => setGate(Number(e.target.value))}>{Array.from({ length: ev?.gates ?? 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{t('gate.gateN', { n })}</option>)}</select></label>
        {ev && (
          <div className="rounded-xl bg-white/10 p-4 text-sm grid gap-1">
            <p><b className="tabular">{guests.size}</b> {t('gate.guestsLoaded')}{ready ? '' : ' …'}</p>
            <p><b className="tabular">{Array.from(guests.values()).filter((g) => g.photo).length}</b> {t('gate.photosLoaded')}</p>
            <p className={fromCache === false ? 'text-gold' : 'text-white/70'}>{fromCache === false ? t('gate.synced') : fromCache === true ? t('gate.offlineCopy') : '…'}</p>
            <p className="text-white/70">{online ? t('gate.online') : t('gate.offline')}</p>
          </div>
        )}
        <button className="btn-gold h-14" disabled={!ev || !ready || guests.size === 0 || !key} onClick={() => setMode('scan')}>{t('gate.start')}</button>
        <p className="text-xs text-white/60">{t('gate.prepareHint')}</p>
        <button className="text-xs text-white/60 underline" onClick={() => signOut(auth)}>{t('admin.signout')}</button>
      </div>
    </Shell>
  )

  return (
    <div className="min-h-dvh bg-ink text-white flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 text-sm border-b border-white/10">
        <button className="font-bold" onClick={() => { setMode('setup'); setVerdict(null) }}>‹ {ev.code}</button>
        <span className="text-white/70">{t('gate.gateN', { n: gate })}</span>
        <span className="ml-auto tabular">{admittedCount} / {Array.from(guests.values()).filter((g) => g.status === 'active').length}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-ok' : 'bg-gold'}`} title={online ? t('gate.online') : t('gate.offline')} />
      </header>
      {conflict && <p role="alert" className="bg-danger text-white text-sm px-4 py-2 flex gap-3"><span>{conflict}</span><button className="ml-auto underline" onClick={() => setConflict(null)}>OK</button></p>}

      {verdict ? (
        <VerdictScreen v={verdict} time={time} onNext={() => setVerdict(null)} />
      ) : mode === 'scan' ? (
        <Scanner onCode={decide} />
      ) : mode === 'manual' ? (
        <Manual onCode={decideCode} />
      ) : (
        <GuestList guests={guests} checkins={checkins} onPick={(g) => { const prior = checkins.get(g.id); if (prior) setVerdict({ kind: 'refused', reason: 'already', guest: g, prior }); else if (g.status === 'revoked') setVerdict({ kind: 'refused', reason: 'revoked', guest: g }); else admit(g) }} />
      )}

      {!verdict && (
        <nav className="grid grid-cols-3 border-t border-white/10 text-sm">
          {(['scan', 'manual', 'list'] as const).map((m) => <button key={m} className={`h-14 ${mode === m ? 'text-gold font-bold' : 'text-white/70'}`} onClick={() => setMode(m)}>{t(`gate.mode.${m}`)}</button>)}
        </nav>
      )}
    </div>
  )
}

function VerdictScreen({ v, time, onNext }: { v: Verdict; time: (d: Date | null | undefined) => string; onNext: () => void }) {
  const { t } = useI18n()
  const bg = v.kind === 'admitted' ? 'bg-ok' : v.kind === 'check' ? 'bg-primary' : 'bg-danger'
  const title = v.kind === 'admitted' ? t('gate.v.admitted') : v.kind === 'check' ? t('gate.v.check') : t('gate.v.refused')
  const g = 'guest' in v ? v.guest : undefined
  useEffect(() => { const id = window.setTimeout(onNext, v.kind === 'refused' ? 12_000 : 8_000); return () => clearTimeout(id) }, [v, onNext])
  return (
    <div className={`flex-1 ${bg} text-white flex flex-col`}>
      <p className="px-5 pt-6 text-4xl font-bold tracking-wide">{title}</p>
      <div className="px-5 pt-4 grid gap-3 flex-1 content-start">
        {g && (
          <div className="w-44 h-56 rounded-2xl overflow-hidden bg-white/20 border-2 border-white/70 grid place-items-center text-center text-sm px-3">
            {g.photo ? <img src={g.photo} alt="" className="w-full h-full object-cover" /> : <span>{t('gate.noPhotoOnFile')}</span>}
          </div>
        )}
        {g && <p className="text-3xl font-bold leading-tight">{guestName(g)}</p>}
        {g && <p className="text-lg opacity-90">{[g.title, g.category].filter(Boolean).join(' · ')}</p>}
        {g && <p className="text-2xl font-bold">{[g.zone, g.seat].filter(Boolean).join(' · ')}</p>}
        {v.kind === 'refused' && (
          <p className="text-xl font-bold">{t(`gate.reason.${v.reason}` as TKey)}{v.reason === 'already' && v.prior ? ` · ${t('gate.gateN', { n: v.prior.gate })} · ${time(v.prior.at?.toDate())}` : ''}</p>
        )}
        {v.kind === 'refused' && <p className="opacity-90">{t('gate.callSupervisor')}</p>}
        {v.kind === 'check' && <p className="opacity-90">{t('gate.checkId')}</p>}
        {(v.kind === 'admitted' || v.kind === 'check') && <p className="opacity-80 tabular">{time(v.at)}</p>}
      </div>
      <button className="h-16 bg-black/25 text-lg font-bold" onClick={onNext}>{t('gate.next')}</button>
    </div>
  )
}

/** Camera + QR decoding: the native BarcodeDetector where it exists, jsQR on a canvas elsewhere (iPhone). */
function Scanner({ onCode }: { onCode: (raw: string) => void }) {
  const { t } = useI18n()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const last = useRef<{ raw: string; at: number }>({ raw: '', at: 0 })
  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, alive = true
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    type Detector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> }
    const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    const detector = Native ? new Native({ formats: ['qr_code'] }) : null
    const hit = (raw: string) => {
      const now = Date.now()
      if (raw === last.current.raw && now - last.current.at < 4000) return
      last.current = { raw, at: now }; onCode(raw)
    }
    async function loop() {
      const v = video.current
      if (!alive || !v || v.readyState < 2) { raf = requestAnimationFrame(loop); return }
      try {
        if (detector) { const codes = await detector.detect(v); if (codes[0]?.rawValue) hit(codes[0].rawValue) }
        else {
          const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 640
          canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h)
          const img = ctx.getImageData(0, 0, w, h)
          const r = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
          if (r?.data) hit(r.data)
        }
      } catch { /* frame skipped */ }
      raf = requestAnimationFrame(loop)
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) } raf = requestAnimationFrame(loop) })
      .catch(() => setError(t('gate.noCamera')))
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((tr) => tr.stop()) }
  }, [onCode, t])
  return (
    <div className="flex-1 relative bg-black grid place-items-center">
      <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <div className="relative w-64 h-64 rounded-2xl border-4 border-gold/90 shadow-[0_0_0_200vmax_rgba(0,0,0,.45)]" />
      <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white/90">{error ?? t('gate.aim')}</p>
    </div>
  )
}

function Manual({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useI18n()
  const [v, setV] = useState('')
  return (
    <form className="flex-1 grid content-start gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onCode(v); setV('') } }}>
      <p className="text-white/75 text-sm">{t('gate.manualHint')}</p>
      <input className="input text-ink text-2xl tabular h-16 uppercase tracking-widest" autoFocus autoCapitalize="characters" placeholder="ABCD-EFGH" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn-gold h-14" type="submit" disabled={v.replace(/[^A-Za-z0-9]/g, '').length < 8}>{t('gate.verify')}</button>
    </form>
  )
}

function GuestList({ guests, checkins, onPick }: { guests: Map<string, Guest>; checkins: Map<string, Checkin>; onPick: (g: Guest) => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const all = Array.from(guests.values()).sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'))
    return (s ? all.filter((g) => `${guestName(g)} ${g.zone} ${g.seat}`.toLowerCase().includes(s)) : all).slice(0, 60)
  }, [guests, q])
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3"><input className="input text-ink" placeholder={t('gate.searchName')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <ul className="flex-1 overflow-y-auto divide-y divide-white/10">
        {rows.map((g) => {
          const c = checkins.get(g.id)
          return <li key={g.id}><button className="w-full text-left px-4 py-3 flex items-center gap-3" onClick={() => onPick(g)}>
            <span className="w-10 h-12 rounded-md overflow-hidden bg-white/10 shrink-0">{g.photo && <img src={g.photo} alt="" className="w-full h-full object-cover" />}</span>
            <span className="min-w-0 flex-1"><span className="block font-medium truncate">{guestName(g)}</span><span className="block text-xs text-white/60 truncate">{[g.zone, g.seat].filter(Boolean).join(' · ')}</span></span>
            {c ? <span className="text-xs text-ok font-bold">{t('gate.inShort', { n: c.gate })}</span> : g.status === 'revoked' ? <span className="text-xs text-danger font-bold">{t('inv.st.revoked')}</span> : <span className="text-xs text-gold">{t('gate.admitBtn')}</span>}
          </button></li>
        })}
      </ul>
      <p className="px-4 py-2 text-[11px] text-white/50">{t('gate.listHint')}</p>
    </div>
  )
}
