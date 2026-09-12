import { useEffect, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import Queue from '../admin/Queue'
import Search from '../admin/Search'
import Blocklist from '../admin/Blocklist'

const ROLES = ['moderator', 'editor', 'maeiage', 'admin'] as const

/** Staff console: Google sign-in gate, roles from custom claims, then L1 / L2 / search / blocklist. */
export default function Admin() {
  const { t } = useI18n()
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u && !u.isAnonymous ? u : null)
    const claims = u ? (await u.getIdTokenResult()).claims : {}
    setRoles(ROLES.filter((r) => claims[r] === true))
    setReady(true)
  }), [])

  if (!ready) return <p className="p-8 text-center text-muted">…</p>
  if (!user) return (
    <div className="mx-auto max-w-sm card p-8 text-center">
      <h1 className="text-xl font-bold">{t('admin.signin')}</h1>
      <button className="btn-primary mt-6 w-full" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>Google</button>
    </div>
  )
  if (roles.length === 0) return (
    <div className="mx-auto max-w-sm card p-8 text-center grid gap-4">
      <p className="text-muted">{t('admin.forbidden')}</p>
      <p className="text-sm">{t('admin.contact')}</p>
      <p className="text-xs text-muted">{user.email}</p>
      <button className="btn-outline" onClick={() => signOut(auth)}>{t('admin.signout')}</button>
    </div>
  )

  const canEdit = roles.includes('editor') || roles.includes('admin')
  const tab = ({ isActive }: { isActive: boolean }) => `px-3 h-9 inline-flex items-center rounded-lg text-sm font-medium ${isActive ? 'bg-primary-tint text-primary' : 'text-muted hover:text-ink'}`

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold mr-auto">{t('admin.queue')}</h1>
        <nav className="flex gap-1">
          <NavLink to="/admin" end className={tab}>{t('admin.nav.l1')}</NavLink>
          {canEdit && <NavLink to="/admin/revue" className={tab}>{t('admin.nav.l2')}</NavLink>}
          <NavLink to="/admin/recherche" className={tab}>{t('admin.nav.search')}</NavLink>
          <NavLink to="/admin/blocages" className={tab}>{t('admin.nav.blocklist')}</NavLink>
        </nav>
        <span className="text-xs text-muted">{user.email} · {roles.join(', ')}</span>
        <button className="btn-outline h-9 px-3 text-xs" onClick={() => signOut(auth)}>{t('admin.signout')}</button>
      </div>
      <Routes>
        <Route index element={<Queue level="pending" uid={user.uid} canEdit={canEdit} />} />
        <Route path="revue" element={canEdit ? <Queue level="review" uid={user.uid} canEdit /> : <p className="card p-8 text-center text-muted">{t('admin.editorOnly')}</p>} />
        <Route path="recherche" element={<Search canEdit={canEdit} />} />
        <Route path="blocages" element={<Blocklist canEdit={canEdit} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  )
}
