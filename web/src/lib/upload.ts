/**
 * Resumable upload to Firebase Storage over the X-Goog-Upload protocol (the same one the SDK uses),
 * written for phones on 3G: the session URL is kept in localStorage so a reload or a killed tab
 * resumes where it stopped when the same file is picked again, chunks adapt to the link speed,
 * transient failures retry for up to two hours, and pause/resume works between chunks.
 */
import { app, auth, authHeaders, withTimeout } from './firebase'

const BUCKET = (app.options.storageBucket as string | undefined) ?? 'guinea68.firebasestorage.app'
const BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`
const STORE = 'mn-uploads'
const KIB = 1024
const MIN_CHUNK = 256 * KIB, MAX_CHUNK = 4 * MIB()
const MAX_RETRY_MS = 2 * 60 * 60_000
function MIB() { return 1024 * KIB }

type Session = { url: string; path: string; size: number; at: number }
type Store = Record<string, Session>

export type UploadHandle = {
  done: Promise<{ path: string }>
  pause(): void
  resume(): void
  cancel(): void
  readonly paused: boolean
}

export type UploadFile = Blob & { name?: string; lastModified?: number }
export type UploadOptions = {
  path: string
  file: UploadFile
  contentType: string
  onProgress?: (sent: number, total: number) => void
  onState?: (state: 'starting' | 'uploading' | 'paused' | 'retrying' | 'done' | 'error') => void
}

function readStore(): Store { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') } catch { return {} } }
function writeStore(s: Store) { try { localStorage.setItem(STORE, JSON.stringify(s)) } catch { /* private mode */ } }
function sessionKey(uid: string, f: UploadFile) { return `${uid}|${f.name ?? 'blob'}|${f.size}|${f.lastModified ?? 0}` }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const CHUNK_TIMEOUT_MS = 90_000, CONTROL_TIMEOUT_MS = 20_000

/** Starts (or resumes) the upload and returns a handle. `done` rejects only on a permanent error or cancel. */
export function resumableUpload(o: UploadOptions): UploadHandle {
  let paused = false, cancelled = false
  let wake: (() => void) | null = null
  const waitIfPaused = () => new Promise<void>((r) => { if (!paused || cancelled) r(); else wake = r })

  const done = (async () => {
    const uid = auth.currentUser?.uid ?? 'anon'
    const key = sessionKey(uid, o.file)
    const total = o.file.size
    o.onState?.('starting')

    // Session: reuse the stored one if it still answers, else open a new one.
    const store = readStore()
    for (const k of Object.keys(store)) if (Date.now() - store[k].at > 24 * 3_600_000) delete store[k]
    let url = store[key]?.size === total ? store[key].url : ''
    let offset = 0
    if (url) {
      const q = await query(url).catch(() => null)
      if (q === null) url = ''
      else if (q.final) {
        // Fully sent last time but never registered (the callable failed): hand back the path it landed on.
        const landed = store[key].path
        o.onProgress?.(total, total); o.onState?.('done'); delete store[key]; writeStore(store)
        return { path: landed }
      }
      else offset = q.received
    }
    let path = store[key]?.url === url && url ? store[key].path : o.path
    if (!url) {
      path = o.path
      url = await start(path, o.contentType, total)
      store[key] = { url, path, size: total, at: Date.now() }
      writeStore(store)
    }

    let chunk = 512 * KIB
    const t0 = Date.now()
    let lastErr: unknown = null
    o.onState?.('uploading')
    o.onProgress?.(offset, total)
    while (offset < total) {
      if (cancelled) throw new Error('cancelled')
      await waitIfPaused()
      if (cancelled) throw new Error('cancelled')
      const end = Math.min(total, offset + chunk)
      const last = end === total
      const started = Date.now()
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { ...(await authHeaders()), 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(offset), 'Content-Type': 'application/octet-stream' },
          body: o.file.slice(offset, end),
          signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS), // a dead 3G socket otherwise sits for minutes before the retry
        })
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          // The session is gone or refused: forget it so the next attempt starts clean.
          delete store[key]; writeStore(store)
          throw Object.assign(new Error(`upload ${res.status}`), { permanent: true })
        }
        if (!res.ok) throw new Error(`upload ${res.status}`)
        offset = end
        o.onProgress?.(offset, total)
        o.onState?.('uploading')
        const dt = Date.now() - started
        if (dt < 3000 && chunk < MAX_CHUNK) chunk *= 2
        else if (dt > 15000 && chunk > MIN_CHUNK) chunk /= 2
        lastErr = null
      } catch (e) {
        if ((e as { permanent?: boolean }).permanent || cancelled) throw e
        lastErr = e
        if (Date.now() - t0 > MAX_RETRY_MS) throw e
        o.onState?.('retrying')
        await sleep(Math.min(30_000, 1000 * 2 ** Math.min(5, retries(e))))
        // Ask the server where it is; the failed chunk may have landed.
        const q = await query(url).catch(() => null)
        if (q) { offset = q.received; if (q.final) offset = total }
        chunk = Math.max(MIN_CHUNK, chunk / 2)
      }
    }
    delete store[key]; writeStore(store)
    o.onState?.('done')
    if (lastErr) console.warn('[upload] finished after retries', lastErr)
    return { path }
  })()

  const retryCount = new Map<unknown, number>()
  function retries(e: unknown) { const n = (retryCount.get('n') ?? 0) + 1; retryCount.set('n', n); return n }

  return {
    done,
    get paused() { return paused },
    pause() { paused = true; o.onState?.('paused') },
    resume() { paused = false; wake?.(); wake = null; o.onState?.('uploading') },
    cancel() { cancelled = true; paused = false; wake?.(); wake = null },
  }
}

async function start(path: string, contentType: string, size: number): Promise<string> {
  const res = await fetch(`${BASE}?name=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': contentType,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ name: path, contentType }),
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  })
  if (!res.ok) throw Object.assign(new Error(`start ${res.status}`), { permanent: res.status >= 400 && res.status < 500 })
  const url = res.headers.get('X-Goog-Upload-URL')
  if (!url) throw Object.assign(new Error('no upload url'), { permanent: true })
  return url
}

async function query(url: string): Promise<{ received: number; final: boolean }> {
  const res = await fetch(url, { method: 'POST', headers: { ...(await authHeaders()), 'X-Goog-Upload-Command': 'query' }, signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`query ${res.status}`)
  const status = res.headers.get('X-Goog-Upload-Status') ?? 'active'
  const received = Number(res.headers.get('X-Goog-Upload-Size-Received') ?? 0)
  return { received: Number.isFinite(received) ? received : 0, final: status === 'final' }
}

/** Keeps the phone screen on while an upload runs (mobile browsers kill background uploads). Returns a release function. */
export async function keepAwake(): Promise<() => void> {
  type WL = { release(): Promise<void> }
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WL> } }
  if (!nav.wakeLock) return () => {}
  let lock: WL | null = null
  const acquire = async () => { try { lock = await nav.wakeLock!.request('screen') } catch { lock = null } }
  const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
  await withTimeout(acquire(), 2000).catch(() => {})
  document.addEventListener('visibilitychange', onVisible)
  return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}) }
}
