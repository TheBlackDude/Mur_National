import { useEffect, useRef, useState } from 'react'
import type { RejectReason } from '../lib/firebase'
import { useI18n } from '../lib/i18n'

export const REASONS: RejectReason[] = ['inappropriate', 'not_person', 'duplicate', 'minor', 'other']

/** Reject reasons with digit shortcuts, optional device block (B), Enter confirms, Escape cancels. No browser dialogs. */
export default function RejectDialog({ open, canBlock, onConfirm, onCancel }: { open: boolean; canBlock: boolean; onConfirm: (reason: RejectReason, block: boolean) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [reason, setReason] = useState<RejectReason>('inappropriate')
  const [block, setBlock] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setReason('inappropriate'); setBlock(false)
    box.current?.focus()
  }, [open])

  if (!open) return null

  function onKey(e: React.KeyboardEvent) {
    const n = Number(e.key)
    if (n >= 1 && n <= REASONS.length) { setReason(REASONS[n - 1]); e.preventDefault(); return }
    if (e.key.toLowerCase() === 'b' && canBlock) { setBlock((v) => !v); e.preventDefault(); return }
    if (e.key === 'Enter') { onConfirm(reason, block); e.preventDefault(); return }
    if (e.key === 'Escape') { onCancel(); e.preventDefault(); return }
    if (e.key === 'Tab') {
      const f = box.current!.querySelectorAll<HTMLElement>('button, input')
      if (f.length === 0) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault() }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault() }
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/60 grid place-items-center p-4" onClick={onCancel}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={t('admin.reason.title')} tabIndex={-1}
        className="card p-6 w-full max-w-sm outline-none" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <h2 className="text-lg font-bold">{t('admin.reason.title')}</h2>
        <ul className="mt-4 grid gap-1.5">
          {REASONS.map((r, i) => (
            <li key={r}>
              <button type="button" onClick={() => setReason(r)} aria-pressed={reason === r}
                className={`w-full h-11 px-3 rounded-[var(--radius-btn)] border text-left text-sm font-medium flex items-center gap-3 ${reason === r ? 'border-primary bg-primary-tint text-primary' : 'border-rule text-ink'}`}>
                <kbd className="w-6 h-6 rounded-md bg-bg text-muted text-xs grid place-items-center">{i + 1}</kbd>{t(`admin.reason.${r}`)}
              </button>
            </li>
          ))}
        </ul>
        {canBlock && (
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
            {t('admin.block')} <kbd className="ml-auto rounded-md bg-bg text-muted text-xs px-1.5 py-0.5">B</kbd>
          </label>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="btn-outline h-11" onClick={onCancel}>{t('admin.cancel')}</button>
          <button type="button" className="btn-primary h-11 !bg-danger hover:!bg-danger/90" onClick={() => onConfirm(reason, block)}>{t('admin.confirmReject')}</button>
        </div>
      </div>
    </div>
  )
}
