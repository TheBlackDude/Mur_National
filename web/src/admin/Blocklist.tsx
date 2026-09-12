import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import { fmtDate } from './hooks'

type Block = { id: string; type?: string; uid?: string; reason?: string; by?: string; byEmail?: string | null; createdAt?: Timestamp }

/** Blocked devices with reason, date and author; editors can lift a block (rules allow editor/admin writes). */
export default function Blocklist({ canEdit }: { canEdit: boolean }) {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState<Block[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => onSnapshot(query(collection(db, 'blocklist'), orderBy('createdAt', 'desc')),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Block, 'id'>) }))), (e) => setError(e.message)), [])

  if (error) return <p className="rounded-xl bg-danger/10 text-danger text-sm p-3">{t('admin.error')} <code className="text-xs">{error}</code></p>
  if (rows.length === 0) return <p className="card p-8 text-center text-muted">{t('admin.blocklist.empty')}</p>
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left label"><tr><th className="p-3">uid</th><th className="p-3">{t('admin.blocklist.reason')}</th><th className="p-3">{t('admin.blocklist.by')}</th><th className="p-3">{t('admin.blocklist.at')}</th><th className="p-3" /></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-rule">
              <td className="p-3 font-mono text-xs">{b.uid ?? b.id.replace(/^uid:/, '')}</td>
              <td className="p-3">{b.reason ? (b.reason in { inappropriate: 1, not_person: 1, duplicate: 1, minor: 1, other: 1 } ? t(`admin.reason.${b.reason as 'other'}`) : b.reason) : '—'}</td>
              <td className="p-3 text-muted">{b.byEmail ?? b.by ?? '—'}</td>
              <td className="p-3 text-muted tabular">{fmtDate(b.createdAt, lang)}</td>
              <td className="p-3 text-right">{canEdit && <button className="btn-outline h-9 px-3 text-xs" onClick={() => deleteDoc(doc(db, 'blocklist', b.id)).catch((e) => setError(e.message))}>{t('admin.unblock')}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
