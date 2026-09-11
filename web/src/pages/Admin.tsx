import { useEffect, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { auth, db, moderate } from '../lib/firebase'
import { useI18n } from '../lib/i18n'

type Pending = { id: string; participantNumber: number; prefecture?: string; country?: string; kiosk?: boolean; originalUrl?: string; safeSearch?: Record<string, string>; duplicateOf?: string | null; status: string }

/** D4 grows this into L1/L2 queues, blocklist, featured switches and the dashboard. Today: sign-in gate + pending queue with approve/reject. */
export default function Admin() {
  const { t } = useI18n()
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [queue, setQueue] = useState<Pending[]>([])
  const [level, setLevel] = useState<'pending' | 'review'>('pending')

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u && !u.isAnonymous ? u : null)
    const claims = u ? (await u.getIdTokenResult()).claims : {}
    setRoles(['moderator', 'editor', 'maeiage', 'admin'].filter((r) => claims[r] === true))
  }), [])

  useEffect(() => {
    if (roles.length === 0) return
    const q = query(collection(db, 'contributions'), where('status', '==', level), orderBy('createdAt', 'asc'), limit(50))
    return onSnapshot(q, (s) => setQueue(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pending, 'id'>) }))))
  }, [roles, level])

  if (!user) return (
    <div className="mx-auto max-w-sm card p-8 text-center">
      <h1 className="text-xl font-bold">{t('admin.signin')}</h1>
      <button className="btn-primary mt-6 w-full" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>Google</button>
    </div>
  )
  if (roles.length === 0) return (
    <div className="mx-auto max-w-sm card p-8 text-center grid gap-4">
      <p className="text-muted">{t('admin.forbidden')}</p>
      <p className="text-xs text-muted">{user.email}</p>
      <button className="btn-outline" onClick={() => signOut(auth)}>{t('admin.signout')}</button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold mr-auto">{t('admin.queue')}</h1>
        <span className="text-xs text-muted">{user.email} · {roles.join(', ')}</span>
        <select className="input h-10 w-auto" value={level} onChange={(e) => setLevel(e.target.value as 'pending' | 'review')}>
          <option value="pending">L1 · pending</option>
          <option value="review">L2 · review</option>
        </select>
        <button className="btn-outline h-10 px-4" onClick={() => signOut(auth)}>{t('admin.signout')}</button>
      </div>
      <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {queue.map((c) => (
          <li key={c.id} className="card overflow-hidden">
            <div className="aspect-square bg-primary-tint">{c.originalUrl && <img src={c.originalUrl} alt="" className="w-full h-full object-cover" />}</div>
            <div className="p-4 text-sm">
              <div className="flex justify-between"><b className="tabular">#{c.participantNumber}</b><span className="text-muted">{c.prefecture ?? c.country}{c.kiosk ? ' · borne' : ''}</span></div>
              {c.duplicateOf && <p className="text-warn text-xs mt-1">Doublon possible</p>}
              {c.safeSearch && Object.entries(c.safeSearch).some(([, v]) => v === 'LIKELY' || v === 'VERY_LIKELY') && <p className="text-danger text-xs mt-1">SafeSearch</p>}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button className="btn-primary h-10" onClick={() => moderate({ id: c.id, action: 'approve' })}>{t('admin.approve')}</button>
                <button className="btn-outline h-10" onClick={() => moderate({ id: c.id, action: 'reject', reason: 'manual' })}>{t('admin.reject')}</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
