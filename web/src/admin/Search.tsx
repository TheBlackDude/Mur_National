import { useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import { db, moderate, type RejectReason } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import Item from './Item'
import RejectDialog from './RejectDialog'
import type { Action, Contribution } from './types'

/** Find a contribution by participant number; actions apply immediately (no undo window here). */
export default function Search({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const [n, setN] = useState(params.get('n') ?? '')
  const [item, setItem] = useState<Contribution | null | undefined>(undefined)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function find(num: string) {
    const v = Number(num)
    if (!Number.isInteger(v) || v <= 0) return
    setParams({ n: String(v) })
    const s = await getDocs(query(collection(db, 'contributions'), where('participantNumber', '==', v), limit(1)))
    setItem(s.empty ? null : { id: s.docs[0].id, ...(s.docs[0].data() as Omit<Contribution, 'id'>) })
  }
  async function act(a: Action) {
    if (!item) return
    setMsg(null)
    try { await moderate({ id: item.id, ...a }); await find(String(item.participantNumber)) }
    catch (e: unknown) { setMsg(t('admin.failed', { msg: (e as Error).message })) }
  }
  function onRejectConfirm(reason: RejectReason, block: boolean) { setRejectOpen(false); act({ action: 'reject', reason, block }) }

  return (
    <div className="grid gap-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); find(n) }}>
        <input className="input max-w-xs" inputMode="numeric" pattern="[0-9]*" placeholder={t('admin.search.placeholder')} value={n} onChange={(e) => setN(e.target.value)} autoFocus />
        <button className="btn-primary h-12 px-5" type="submit">{t('admin.search.go')}</button>
      </form>
      {msg && <p className="rounded-xl bg-danger/10 text-danger text-sm p-3">{msg}</p>}
      {item === null && <p className="card p-8 text-center text-muted">{t('admin.search.none')}</p>}
      {item && <Item c={item} canEdit={canEdit} onAction={act} onReject={() => setRejectOpen(true)} />}
      <RejectDialog open={rejectOpen} canBlock={canEdit} onConfirm={onRejectConfirm} onCancel={() => setRejectOpen(false)} />
    </div>
  )
}
