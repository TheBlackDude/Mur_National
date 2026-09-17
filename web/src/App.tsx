import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'

const RELOAD_KEY = 'chunk-reload'

/**
 * Route chunks are hashed: after a deploy, a page that is still open (or an index.html the browser kept for an hour)
 * asks for chunks that no longer exist and the route never renders. One automatic reload picks up the new build;
 * a second failure in the same session is a real error and surfaces as such.
 */
function lazyRoute<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().then((m) => { try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* ignore */ } return m }).catch((e: unknown) => {
    let reloaded = false
    try { reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'; if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1') } catch { /* ignore */ }
    if (!reloaded) { location.reload(); return new Promise<{ default: T }>(() => {}) }
    throw e
  }))
}

// Every route beyond the home page is its own chunk: first load stays small on 3G.
const Selfie = lazyRoute(() => import('./pages/Selfie'))
const Wall = lazyRoute(() => import('./pages/Wall'))
const MapPage = lazyRoute(() => import('./pages/Map'))
const Screen = lazyRoute(() => import('./pages/Screen'))
const Video = lazyRoute(() => import('./pages/Video'))
const Protocol = lazyRoute(() => import('./pages/Protocol'))
const Gate = lazyRoute(() => import('./pages/Gate'))
const Admin = lazyRoute(() => import('./pages/Admin'))
const FramesPreview = import.meta.env.DEV ? lazy(() => import('./pages/FramesPreview')) : null
const UploadTest = import.meta.env.DEV ? lazy(() => import('./pages/UploadTest')) : null

const Loading = () => <div className="p-8 text-center text-muted">…</div>

export default function App() {
  // Vite reports a failed dynamic import (JS or its CSS) here; same one-shot reload as lazyRoute.
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      let reloaded = false
      try { reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'; if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1') } catch { /* ignore */ }
      if (!reloaded) { e.preventDefault(); location.reload() }
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Screen feed has no chrome at all. */}
        <Route path="/ecran" element={<Screen />} />
        {/* Gate control app for the invitation cards: full screen, its own chrome, Firestore persistence (see firebase.ts). */}
        <Route path="/controle" element={<Gate />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/selfie" element={<Selfie />} />
          <Route path="/mur" element={<Wall />} />
          <Route path="/carte" element={<MapPage />} />
          <Route path="/video" element={<Video />} />
          {/* Protocol links: the Presidency (numbers 1–10) and the Government (11–60). */}
          <Route path="/presidence" element={<Protocol />} />
          <Route path="/gouvernement" element={<Protocol />} />
          <Route path="/admin/*" element={<Admin />} />
          {FramesPreview && <Route path="/dev/cadres" element={<FramesPreview />} />}
          {UploadTest && <Route path="/dev/upload" element={<UploadTest />} />}
        </Route>
      </Routes>
    </Suspense>
  )
}
