import { useEffect, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '../lib/firebase'
import { useI18n } from '../lib/i18n'

/** Subscribes to counters/national over RTDB. Falls back to the last value seen if the connection drops. */
export function useNationalCount() {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => onValue(ref(rtdb, 'counters/national'), (s) => setN(s.val() ?? 0), () => setN((v) => v ?? 0)), [])
  return n
}

export default function LiveCounter({ target = 100_000, size = 'md' }: { target?: number; size?: 'md' | 'xl' }) {
  const { t, lang } = useI18n()
  const n = useNationalCount()
  const pct = n === null ? 0 : Math.min(100, (n / target) * 100)
  return (
    <div className={size === 'xl' ? 'text-center' : ''}>
      <div className={`font-bold tabular text-primary leading-none ${size === 'xl' ? 'text-[18vw] sm:text-[9rem]' : 'text-5xl'}`}>
        {n === null ? '—' : n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
      </div>
      <div className={`mt-2 text-muted ${size === 'xl' ? 'text-2xl' : 'text-sm'}`}>{t('counter.label')}</div>
      <div className="mt-3 h-2 rounded-full bg-primary-tint overflow-hidden" role="progressbar" aria-valuenow={n ?? 0} aria-valuemax={target}>
        <div className="h-full bg-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted">{t('counter.target', { n: target.toLocaleString('fr-FR') })}</div>
    </div>
  )
}
