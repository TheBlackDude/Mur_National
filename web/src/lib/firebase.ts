import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator, type User } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getDatabase, connectDatabaseEmulator } from 'firebase/database'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

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

if (env.VITE_RECAPTCHA_SITE_KEY) {
  // reCAPTCHA Enterprise score key (created with gcloud, registered in App Check). Tokens refresh automatically.
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true })
}

export const auth = getAuth(app)
export const db = getFirestore(app)
export const rtdb = getDatabase(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'europe-west1')

if (env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectDatabaseEmulator(rtdb, 'localhost', 9000)
  connectStorageEmulator(storage, 'localhost', 9199)
  connectFunctionsEmulator(functions, 'localhost', 5001)
}

/** Every visitor gets a stable anonymous uid: the basis for rate limiting and Storage ownership. */
export function ensureAnonymousUser(): Promise<User> {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (u) => {
      if (u) { stop(); resolve(u) }
      else signInAnonymously(auth).catch(reject)
    })
  })
}

export const call = <Req, Res>(name: string) => {
  const fn = httpsCallable<Req, Res>(functions, name)
  return async (data: Req) => (await fn(data)).data
}

// Typed callables matching functions/src
export type SubmitReq = { path: string; frame: 'A' | 'B' | 'C'; prefecture?: string; country?: string; kiosk?: boolean; consent: { public: true; minorSupervised?: boolean } }
export type SubmitRes = { id: string; participantNumber: number }
export const submitContribution = call<SubmitReq, SubmitRes>('submitContribution')

export type RejectReason = 'inappropriate' | 'not_person' | 'duplicate' | 'minor' | 'other'
export type ModerateAction = 'approve' | 'reject' | 'review' | 'feature' | 'unfeature' | 'personality' | 'unpersonality' | 'block' | 'unblock'
export type ModerateReq = { id: string; action: ModerateAction; reason?: RejectReason; block?: boolean }
export const moderate = call<ModerateReq, { ok: true }>('moderate')

export const report = call<{ id: string; reason: string }, { ok: true }>('report')

// D6 callables (functions/src/video.ts, exports.ts)
export type MissionInfo = { code: string; name: string; country: string; contact?: string | null }
export const missionInfo = call<{ mission: string; token: string }, MissionInfo>('missionInfo')
export type SubmitVideoReq = { path: string; mission: string; token: string; durationSec: number; firstName?: string; city?: string; consent: { film: true } }
export const submitVideo = call<SubmitVideoReq, { id: string; participantNumber: number }>('submitVideo')
export type SelectVideoReq = { id: string; selected?: boolean; tags?: string[]; notes?: string }
export const selectVideo = call<SelectVideoReq, { ok: true }>('selectVideo')
export type ExportDailyRes = { date: string; national: number; newToday: number; prefecturesLit: number; countriesLit: number; videosSelected: number; backlog: number; sheet: boolean; csvPath: string }
export const exportDailyNow = call<Record<string, never>, ExportDailyRes>('exportDailyNow')
export const exportSelected = call<Record<string, never>, { exported: number; skipped: number; folder: string | null }>('exportSelected')
