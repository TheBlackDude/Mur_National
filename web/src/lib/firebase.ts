import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, connectAuthEmulator, type User } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getDatabase, connectDatabaseEmulator } from 'firebase/database'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const env = import.meta.env
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'guinea68'

/** Config is missing until the repository variables are set. Fallbacks keep the shell rendering
 *  (counter shows a dash, uploads fail with a clear message) instead of crashing on load. */
export const configured = Boolean(env.VITE_FIREBASE_API_KEY)
if (!configured) console.warn('[mur-national] Firebase web config missing: set VITE_FIREBASE_* variables')

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'missing-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  appId: env.VITE_FIREBASE_APP_ID || undefined,
})

export const appCheck = env.VITE_RECAPTCHA_SITE_KEY
  // reCAPTCHA Enterprise score key (created with gcloud, registered in App Check). Tokens refresh automatically.
  ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true })
  : null

export const auth = getAuth(app)
// The gate app (/controle) keeps the guest list and the check-ins on the phone and must work with no network at the
// doors: Firestore persistence there only. The public site keeps the plain client (snapshot-first Wall, no IndexedDB).
const GATE_APP = typeof location !== 'undefined' && location.pathname.startsWith('/controle')
export const db = GATE_APP ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }) : getFirestore(app)
export const rtdb = getDatabase(app)
export const storage = getStorage(app)

if (env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectDatabaseEmulator(rtdb, 'localhost', 9000)
  connectStorageEmulator(storage, 'localhost', 9199)
}

/**
 * Every visitor gets a stable anonymous uid: the basis for rate limiting and Storage ownership.
 * One sign-in at a time: two callers racing (two effects on the mission page, StrictMode in dev) used to create two
 * anonymous users, so the upload path carried one uid while the request's token carried the other ("Bad path", 403).
 */
let signingIn: Promise<User> | null = null
export async function ensureAnonymousUser(): Promise<User> {
  await auth.authStateReady()
  if (auth.currentUser) return auth.currentUser
  signingIn ??= signInAnonymously(auth).then((c) => c.user).finally(() => { signingIn = null })
  return signingIn
}

/** Rejects after `ms` so a promise that never settles (see appCheckToken) cannot freeze the caller. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(Object.assign(new Error(label), { code: 'deadline-exceeded' })), ms)
    p.then((v) => { clearTimeout(id); resolve(v) }, (e) => { clearTimeout(id); reject(e) })
  })
}

/**
 * App Check token with a deadline. The SDK loads the reCAPTCHA script with an onload handler only: when that
 * script fails to load on a bad connection, getToken() never settles and every Storage/Functions call behind it
 * hangs silently. Waiting a bounded time and going on without the token turns that into a clear server error.
 */
export async function appCheckToken(ms = 8000): Promise<string | null> {
  if (!appCheck) return null
  try { return (await withTimeout(getToken(appCheck), ms, 'appcheck timeout')).token } catch { return null }
}

/** Storage's upload endpoints take `Authorization: Firebase <idToken>`; callables take the standard `Bearer`. */
export async function authHeaders(scheme: 'Firebase' | 'Bearer' = 'Firebase'): Promise<Record<string, string>> {
  const h: Record<string, string> = {}
  const u = auth.currentUser
  if (u) h.Authorization = `${scheme} ${await withTimeout(u.getIdToken(), 15_000, 'idtoken timeout')}`
  const ac = await appCheckToken()
  if (ac) h['X-Firebase-AppCheck'] = ac
  return h
}

/** Error thrown by callables: `code` carries the gRPC status in kebab case ('resource-exhausted', 'permission-denied', 'deadline-exceeded'…). */
export class CallableError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = 'CallableError' }
}

const REGION = env.VITE_FUNCTIONS_REGION || 'europe-west1'
const FN_BASE = env.VITE_USE_EMULATORS === '1' ? `http://localhost:5001/${projectId}/${REGION}` : `https://${REGION}-${projectId}.cloudfunctions.net`

/**
 * Callable over plain fetch (same wire protocol as httpsCallable) so that every call has a deadline and a bounded
 * App Check wait: with the SDK, a reCAPTCHA script that never loaded on 3G freezes the call forever with no error.
 * `timeoutMs` covers the whole round trip; the studio shows a retry on 'deadline-exceeded'.
 */
export const call = <Req, Res>(name: string, timeoutMs = 60_000) => async (data: Req): Promise<Res> => {
  let res: Response
  try {
    res = await fetch(`${FN_BASE}/${name}`, {
      method: 'POST',
      headers: { ...(await authHeaders('Bearer')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const timedOut = (e as { name?: string }).name === 'TimeoutError' || (e as { code?: string }).code === 'deadline-exceeded'
    throw new CallableError(timedOut ? 'deadline-exceeded' : 'unavailable', (e as Error).message)
  }
  let body: { result?: Res; error?: { message?: string; status?: string; details?: unknown } } = {}
  try { body = await res.json() } catch { /* non-JSON error page */ }
  if (!res.ok || body.error) {
    const status = String(body.error?.status ?? (res.status === 401 ? 'UNAUTHENTICATED' : res.status === 429 ? 'RESOURCE_EXHAUSTED' : 'INTERNAL')).toLowerCase().replace(/_/g, '-')
    throw new CallableError(status, body.error?.message ?? `HTTP ${res.status}`, body.error?.details)
  }
  return body.result as Res
}

// Typed callables matching functions/src
/** Photo: `path` is the framed JPEG. Video selfie: `path` is the framed poster JPEG and `videoPath` the clip (40–90 s).
 *  `mission` + `token` tag a contribution made from a diplomatic mission link. */
export type SubmitReq = {
  path: string; frame: 'A' | 'B' | 'C'; prefecture?: string; country?: string; kiosk?: boolean
  consent: { public: true; minorSupervised?: boolean }
  type?: 'photo' | 'video'; videoPath?: string; durationSec?: number
  mission?: string; token?: string
  /** Protocol link (PRESIDENCE | GOUVERNEMENT) with the same `token` field. */
  vip?: string
}
export type SubmitRes = { id: string; participantNumber: number }
export const submitContribution = call<SubmitReq, SubmitRes>('submitContribution')

export type RejectReason = 'inappropriate' | 'not_person' | 'duplicate' | 'minor' | 'other'
export type ModerateAction = 'approve' | 'reject' | 'review' | 'feature' | 'unfeature' | 'personality' | 'unpersonality' | 'block' | 'unblock' | 'renumber'
export type ModerateReq = { id: string; action: ModerateAction; reason?: RejectReason; block?: boolean; number?: number }
export const moderate = call<ModerateReq, { ok: true }>('moderate')

export const report = call<{ id: string; reason: string }, { ok: true }>('report')

// D6 callables (functions/src/video.ts, exports.ts)
export type MissionInfo = { code: string; name: string; country: string; contact?: string | null }
export const missionInfo = call<{ mission: string; token: string }, MissionInfo>('missionInfo')

// Protocol links (functions/src/protocol.ts): the Presidency and the Government.
export type ProtocolTier = 'president' | 'minister'
export type ProtocolInfo = { code: string; tier: ProtocolTier }
export const protocolInfo = call<{ code: string; token: string }, ProtocolInfo>('protocolInfo')
export type SubmitVideoReq = { path: string; mission: string; token: string; durationSec: number; firstName?: string; city?: string; consent: { film: true } }
export const submitVideo = call<SubmitVideoReq, { id: string; participantNumber: number }>('submitVideo')
export type SelectVideoReq = { id: string; selected?: boolean; tags?: string[]; notes?: string }
export const selectVideo = call<SelectVideoReq, { ok: true }>('selectVideo')
export type ExportDailyRes = { date: string; national: number; newToday: number; prefecturesLit: number; countriesLit: number; videosSelected: number; backlog: number; sheet: boolean; csvPath: string }
export const exportDailyNow = call<Record<string, never>, ExportDailyRes>('exportDailyNow', 300_000)
export const exportSelected = call<Record<string, never>, { exported: number; skipped: number; folder: string | null }>('exportSelected', 300_000)

// Invitations protocolaires (functions/src/invitations.ts)
export type EventKind = 'parade' | 'dinner'
export type CreateEventReq = { name: string; code: string; kind: EventKind; venue?: string; date?: string; time?: string; dressCode?: string; intro?: string; lead?: string; titleLines?: string[]; zoneLabel?: string; verso?: string; gates?: number; photoPurgeOn?: string }
export const createEvent = call<CreateEventReq, { id: string }>('createEvent')
export const issueInvitations = call<{ eventId: string; guestIds?: string[]; reissue?: boolean }, { issued: number; total: number }>('issueInvitations', 180_000)
