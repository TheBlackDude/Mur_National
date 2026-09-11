import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'

// Every route beyond the home page is its own chunk: first load stays small on 3G.
const Selfie = lazy(() => import('./pages/Selfie'))
const Wall = lazy(() => import('./pages/Wall'))
const MapPage = lazy(() => import('./pages/Map'))
const Screen = lazy(() => import('./pages/Screen'))
const Video = lazy(() => import('./pages/Video'))
const Admin = lazy(() => import('./pages/Admin'))

const Loading = () => <div className="p-8 text-center text-muted">…</div>

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Screen feed has no chrome at all. */}
        <Route path="/ecran" element={<Screen />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/selfie" element={<Selfie />} />
          <Route path="/mur" element={<Wall />} />
          <Route path="/carte" element={<MapPage />} />
          <Route path="/video" element={<Video />} />
          <Route path="/admin/*" element={<Admin />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
