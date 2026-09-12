import { useI18n } from '../lib/i18n'
import { fmtDate, placeName, useContribution, useHistory, useStorageUrl } from './hooks'
import { FLAGGED, type Action, type Contribution } from './types'

type Props = {
  c: Contribution
  canEdit: boolean
  busy?: boolean
  lockedBy?: string | null
  onAction: (a: Action) => void
  onReject: () => void
  compact?: boolean
}

/** Large preview, metadata, L2 evidence (SafeSearch, duplicate, reports), history and the action row. */
export default function Item({ c, canEdit, busy, lockedBy, onAction, onReject, compact }: Props) {
  const { t, lang } = useI18n()
  const url = useStorageUrl(c.publicUrl ? null : c.files?.public ?? c.files?.original, c.publicUrl)
  const videoSrc = useStorageUrl(c.videoUrl ? null : c.files?.video ?? null, c.videoUrl ?? null)
  const history = useHistory(compact ? null : c.id)
  const dup = useContribution(compact ? null : c.duplicateOf ?? null)
  const dupUrl = useStorageUrl(dup?.thumbUrl ? null : dup?.files?.thumb, dup?.thumbUrl)
  const flagged = c.safeSearch && Object.entries(c.safeSearch).some(([k, v]) => ['adult', 'violence', 'racy'].includes(k) && FLAGGED.includes(v))
  const reason = c.reviewReason ?? ((c.reports ?? 0) >= 3 ? 'reports' : null)

  return (
    <article className="card overflow-hidden" aria-busy={busy}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-ink aspect-square md:aspect-auto md:min-h-[520px] grid place-items-center content-center gap-2">
          {url ? <img src={url} alt="" className={`${c.files?.video ? 'max-h-[40vh]' : 'max-h-[70vh]'} w-full object-contain`} /> : <span className="text-white/50 text-sm">…</span>}
          {c.files?.video && (videoSrc
            ? <video key={c.id} src={videoSrc} poster={url ?? undefined} controls playsInline preload="metadata" className="max-h-[40vh] w-full object-contain" />
            : <span className="text-white/50 text-sm">…</span>)}
        </div>
        <div className="p-5 grid content-start gap-4 text-sm">
          <header>
            <p className="text-3xl font-bold tabular">#{c.participantNumber.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</p>
            <p className="text-muted mt-1">{placeName(c)}</p>
            <p className="text-muted text-xs mt-1">{t('admin.submitted')} {fmtDate(c.createdAt, lang)}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Tag tone="primary">{t(`admin.status.${c.status}`)}</Tag>
              {c.files?.video && <Tag tone="primary">{t('wall.video')}{c.durationSec ? ` · ${c.durationSec} s` : ''}</Tag>}
              {c.kiosk && <Tag>{t('admin.kiosk')}</Tag>}
              {c.consent?.minorSupervised && <Tag>{t('admin.minorSupervised')}</Tag>}
              {c.featured && <Tag tone="gold">{t('admin.feature')}</Tag>}
              {c.personality && <Tag tone="gold">{t('admin.personality')}</Tag>}
              {c.duplicateOf && <Tag tone="warn">{t('admin.reason.duplicate')}</Tag>}
              {flagged && <Tag tone="danger">{t('admin.safeSearch')}</Tag>}
              {(c.reports ?? 0) > 0 && <Tag tone="warn">{t('admin.reports', { n: c.reports! })}</Tag>}
            </div>
            {lockedBy && <p className="mt-2 text-xs text-warn">{t('admin.lockedBy', { who: lockedBy })}</p>}
          </header>

          {!compact && (reason || c.safeSearch || c.duplicateOf) && (
            <section className="rounded-xl bg-bg p-3 grid gap-3">
              <p className="label">{t('admin.evidence')}</p>
              {reason && <p className="font-medium">{t(`admin.reviewReason.${reason}`)}</p>}
              {c.safeSearch && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {Object.entries(c.safeSearch).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted capitalize">{k}</dt>
                      <dd className={FLAGGED.includes(v) ? 'text-danger font-medium' : v === 'POSSIBLE' ? 'text-warn' : 'text-muted'}>{v.toLowerCase().replace('_', ' ')}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {c.duplicateOf && (
                <div className="flex items-center gap-3">
                  <span className="w-16 h-16 rounded-lg overflow-hidden bg-primary-tint shrink-0">{dupUrl && <img src={dupUrl} alt="" className="w-full h-full object-cover" />}</span>
                  <p className="text-xs text-muted">{t('admin.duplicateOf')} <b className="text-ink tabular">#{dup?.participantNumber ?? '…'}</b>{dup && <><br />{t(`admin.status.${dup.status}`)} · {fmtDate(dup.createdAt, lang)}</>}</p>
                </div>
              )}
            </section>
          )}

          <section className="grid gap-2">
            {c.status !== 'approved' && <button className="btn-primary h-11" disabled={busy} onClick={() => onAction({ action: 'approve' })}>{t('admin.approve')} <kbd className="ml-1 rounded-md bg-white/20 text-xs px-1.5">A</kbd></button>}
            {c.status !== 'rejected' && <button className="btn-outline h-11 !border-danger !text-danger" disabled={busy} onClick={onReject}>{t('admin.reject')} <kbd className="ml-1 rounded-md bg-danger/10 text-xs px-1.5">R</kbd></button>}
            {canEdit && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                {c.status === 'approved' && <button className="btn-outline h-10 text-xs" disabled={busy} onClick={() => onAction({ action: c.featured ? 'unfeature' : 'feature' })}>{t(c.featured ? 'admin.unfeature' : 'admin.feature')}</button>}
                {c.status === 'approved' && <button className="btn-outline h-10 text-xs" disabled={busy} onClick={() => onAction({ action: c.personality ? 'unpersonality' : 'personality' })}>{t(c.personality ? 'admin.unpersonality' : 'admin.personality')}</button>}
                {c.status !== 'review' && <button className="btn-outline h-10 text-xs" disabled={busy} onClick={() => onAction({ action: 'review' })}>{t('admin.toReview')}</button>}
                <button className="btn-outline h-10 text-xs !border-danger !text-danger" disabled={busy} onClick={() => onAction({ action: 'block', reason: 'other' })}>{t('admin.block')}</button>
              </div>
            )}
          </section>

          {!compact && (
            <section>
              <p className="label">{t('admin.history')}</p>
              {history.length === 0 ? <p className="text-xs text-muted mt-1">{t('admin.noHistory')}</p> : (
                <ul className="mt-1 grid gap-1 text-xs">
                  {history.map((h) => (
                    <li key={h.id} className="flex gap-2 border-b border-rule py-1">
                      <span className="font-medium">{h.action}{h.reason ? ` · ${h.reason}` : ''}{h.block ? ' · block' : ''}</span>
                      <span className="text-muted ml-auto text-right">{h.byEmail ?? h.by}<br />{fmtDate(h.at, lang)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </article>
  )
}

function Tag({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'primary' | 'gold' | 'warn' | 'danger' }) {
  const cls = { muted: 'bg-bg text-muted', primary: 'bg-primary-tint text-primary', gold: 'bg-gold-tint text-gold-strong', warn: 'bg-gold-tint text-warn', danger: 'bg-danger/10 text-danger' }[tone]
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>
}
