import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db, moderate, type RejectReason } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import Item from './Item'
import RejectDialog from './RejectDialog'
import { useStorageUrl } from './hooks'
import type { Action, Contribution } from './types'

const PROTOCOL_MAX = 60
const PRESIDENCY_MAX = 10

/**
 * Protocole: every contribution made through the Presidency or Government link, whatever its status, with the map of
 * the 60 reserved numbers. Editors validate, reject and move an item to an exact number. Actions apply immediately.
 */
export default function Protocol({ canEdit }: { canEdit: boolean }) {
  const { t, lang } = useI18n()
  const [items, setItems] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [num, setNum] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setError(null)
    const q = query(collection(db, 'contributions'), where('vip', 'in', ['president', 'minister']), orderBy('createdAt', 'desc'), limit(150))
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Contribution, 'id'>) }))), (e) => setError(e.message))
  }, [])

  const groups = useMemo(() => ({
    waiting: items.filter((c) => c.status === 'pending' || c.status === 'review'),
    published: items.filter((c) => c.status === 'approved').sort((a, b) => a.participantNumber - b.participantNumber),
    rejected: items.filter((c) => c.status === 'rejected'),
  }), [items])
  const current = items.find((c) => c.id === selected) ?? groups.waiting[0] ?? groups.published[0] ?? null
  const taken = useMemo(() => {
    const m = new Map<number, Contribution>()
    for (const c of items) if (c.status !== 'rejected' && c.participantNumber <= PROTOCOL_MAX) m.set(c.participantNumber, c)
    return m
  }, [items])

  function say(text: string, tone: 'ok' | 'error' = 'ok') { setMsg({ text, tone }); window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000) }

  async function act(a: Action) {
    if (!current) return
    setBusy(true)
    try { await moderate({ id: current.id, ...a }) }
    catch (e: unknown) { say(t('admin.failed', { msg: (e as Error).message }), 'error') }
    finally { setBusy(false) }
  }
  async function renumber() {
    const n = Number(num)
    if (!current || !Number.isInteger(n) || n < 1 || n > PROTOCOL_MAX) return
    setBusy(true)
    try { await moderate({ id: current.id, action: 'renumber', number: n }); setNum(''); say(t('admin.protocol.renumbered', { n })) }
    catch (e: unknown) { say((e as { code?: string }).code === 'already-exists' ? t('admin.protocol.taken', { n }) : t('admin.failed', { msg: (e as Error).message }), 'error') }
    finally { setBusy(false) }
  }
  function onRejectConfirm(reason: RejectReason, block: boolean) { setRejectOpen(false); act({ action: 'reject', reason, block }) }

  const fmt = (n: number) => n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-lg font-bold">{t('admin.protocol.title')}</h2>
        <p className="text-sm text-muted mt-1">{t('admin.protocol.lede')}</p>
      </div>
      {error && <p className="rounded-xl bg-danger/10 text-danger text-sm p-3">{t('admin.error')} <code className="text-xs">{error}</code></p>}
      {msg && <p role="status" className={`rounded-xl text-sm px-4 py-3 ${msg.tone === 'ok' ? 'bg-ink text-white' : 'bg-danger/10 text-danger'}`}>{msg.text}</p>}

      {/* The 60 reserved numbers: gold = Presidency range, blue = Government range, hollow = free. */}
      <section className="card p-4">
        <p className="label mb-3">{t('admin.protocol.numbers')}</p>
        <ol className="grid grid-cols-10 gap-1.5">
          {Array.from({ length: PROTOCOL_MAX }, (_, i) => i + 1).map((n) => {
            const c = taken.get(n)
            const presidency = n <= PRESIDENCY_MAX
            const cls = c
              ? c.vip === 'president' ? 'bg-gold text-ink' : 'bg-primary text-white'
              : presidency ? 'border border-gold/60 text-gold-strong' : 'border border-rule text-muted'
            return (
              <li key={n}>
                <button
                  className={`w-full aspect-square rounded-lg text-xs font-medium tabular ${cls} ${c && current?.id === c.id ? 'ring-2 ring-ink ring-offset-1' : ''} ${c ? '' : 'cursor-default'}`}
                  title={c ? `#${n} · ${t(`admin.status.${c.status}`)}` : `#${n}`}
                  onClick={() => c && setSelected(c.id)}>
                  {n}
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-2 text-xs text-muted">{t('admin.protocol.legend')}</p>
      </section>

      {items.length === 0 && !error && <p className="card p-10 text-center text-muted">{t('admin.protocol.empty')}</p>}

      {(['waiting', 'published', 'rejected'] as const).filter((g) => groups[g].length > 0).map((g) => (
        <section key={g}>
          <p className="label mb-2">{t(`admin.protocol.${g}`)} · {groups[g].length}</p>
          <ul className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {groups[g].map((c) => <Thumb key={c.id} c={c} active={current?.id === c.id} onClick={() => setSelected(c.id)} tierLabel={t(c.vip === 'president' ? 'admin.protocol.president' : 'admin.protocol.minister')} />)}
          </ul>
        </section>
      ))}

      {current && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${current.vip === 'president' ? 'bg-gold text-ink' : 'bg-primary-tint text-primary'}`}>{t(current.vip === 'president' ? 'admin.protocol.president' : 'admin.protocol.minister')}</span>
            <span className="text-sm text-muted tabular">#{fmt(current.participantNumber)}{current.participantNumber > PROTOCOL_MAX ? ` · ${t('admin.protocol.overflow')}` : ''}</span>
            {canEdit && (
              <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); renumber() }}>
                <input className="input h-10 w-24" inputMode="numeric" pattern="[0-9]*" min={1} max={PROTOCOL_MAX} placeholder="1–60" value={num} onChange={(e) => setNum(e.target.value)} aria-label={t('admin.protocol.renumber')} />
                <button className="btn-outline h-10 px-4 text-sm" type="submit" disabled={busy || !num}>{t('admin.protocol.renumber')}</button>
              </form>
            )}
          </div>
          <Item key={current.id} c={current} canEdit={canEdit} busy={busy} onAction={act} onReject={() => setRejectOpen(true)} />
        </div>
      )}
      <RejectDialog open={rejectOpen} canBlock={canEdit} onConfirm={onRejectConfirm} onCancel={() => setRejectOpen(false)} />
    </div>
  )
}

function Thumb({ c, active, onClick, tierLabel }: { c: Contribution; active: boolean; onClick: () => void; tierLabel: string }) {
  const url = useStorageUrl(c.thumbUrl ? null : c.files?.thumb, c.thumbUrl)
  return (
    <li>
      <button onClick={onClick} className={`relative block w-full aspect-square rounded-lg overflow-hidden bg-primary-tint ${active ? 'ring-2 ring-primary ring-offset-1' : ''}`} title={`#${c.participantNumber} · ${tierLabel}`}>
        {url && <img src={url} alt="" className="w-full h-full object-cover" />}
        <span className="absolute left-1 bottom-1 text-[10px] bg-white/90 rounded-full px-1.5 tabular">#{c.participantNumber}</span>
        <span className={`absolute right-1 top-1 w-2.5 h-2.5 rounded-full ${c.vip === 'president' ? 'bg-gold' : 'bg-primary'} ring-1 ring-white`} />
        {c.files?.video && <span className="absolute left-1 top-1 text-[10px] bg-ink/70 text-white rounded-full px-1.5">▶</span>}
      </button>
    </li>
  )
}
