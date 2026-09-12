import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'

export type LightboxItem = { id: string; type?: 'photo' | 'video'; thumbUrl?: string; publicUrl?: string; videoUrl?: string | null; participantNumber: number; place?: string }

type Props = {
  item: LightboxItem
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  shareUrl: string
  reportState: 'idle' | 'sent' | 'already'
  onReport: () => void
}

/** Accessible full-size viewer: dialog role, focus trap, Escape/arrows, backdrop click, basic swipe. No browser dialogs. */
export default function Lightbox({ item, hasPrev, hasNext, onPrev, onNext, onClose, shareUrl, reportState, onReport }: Props) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const touchX = useRef<number | null>(null)

  // Focus trap + keyboard.
  useEffect(() => {
    const el = box.current
    const previous = document.activeElement as HTMLElement | null
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowLeft' && hasPrev) { e.preventDefault(); onPrev() }
      else if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); onNext() }
      else if (e.key === 'Tab' && el) {
        const focusables = Array.from(el.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')).filter((f) => !f.hasAttribute('disabled'))
        if (focusables.length === 0) return
        const first = focusables[0], last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; previous?.focus?.() }
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ url: shareUrl, text: `#FierDetreGuineen · ${t('wall.participant')}${item.participantNumber}` }); return } catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ }
  }

  const src = item.publicUrl ?? item.thumbUrl

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(18,24,38,.85)' }}
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (dx > 50 && hasPrev) onPrev()
        else if (dx < -50 && hasNext) onNext()
      }}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={`${t('wall.participant')}${item.participantNumber}`}
        className="relative w-full max-w-3xl grid gap-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-white">
          <div>
            <p className="font-bold text-lg tabular">{t('wall.participant')}{item.participantNumber.toLocaleString('fr-FR')}</p>
            {item.place && <p className="text-sm text-white/70">{item.place}</p>}
          </div>
          <button data-autofocus className="btn-white h-10 px-4" onClick={onClose}>{t('wall.close')}</button>
        </div>
        <div className="relative">
          {item.videoUrl
            ? <video key={item.id} src={item.videoUrl} poster={src} controls playsInline autoPlay preload="metadata" aria-label={t('wall.playVideo')}
                className="w-full max-h-[85vh] object-contain rounded-[var(--radius-card)] bg-black/40" />
            : src && <img src={src} alt="" className="w-full max-h-[85vh] object-contain rounded-[var(--radius-card)] bg-black/20" />}
          {hasPrev && (
            <button aria-label={t('wall.prev')} onClick={onPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 text-ink grid place-items-center text-xl hover:bg-white">‹</button>
          )}
          {hasNext && (
            <button aria-label={t('wall.next')} onClick={onNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 text-ink grid place-items-center text-xl hover:bg-white">›</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-gold h-11 px-5" onClick={share}>{t('wall.share')}</button>
          {copied && <span className="text-sm text-white/85" role="status">{t('wall.linkCopied')}</span>}
          <span className="ml-auto flex items-center gap-2">
            {reportState === 'idle'
              ? <button className="text-sm text-white/70 hover:text-white underline" onClick={onReport}>{t('wall.report')}</button>
              : <span className="text-sm text-white/70" role="status">{reportState === 'sent' ? t('wall.reportDone') : t('wall.reported')}</span>}
          </span>
        </div>
      </div>
    </div>
  )
}
