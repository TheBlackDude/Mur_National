import { useEffect, useRef, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '../lib/firebase'
import { useI18n } from '../lib/i18n'
import { cachedSnapshot, fetchSnapshot, useAppConfig } from '../lib/snapshot'

const RTDB_GRACE_MS = 8_000
const POLL_MS = 60_000

/**
 * National counter. `live` subscribes to counters/national over RTDB (the screen, the RTG overlay, the admin);
 * otherwise, or when RTDB has not answered within a few seconds, the value comes from the 2-minute snapshot
 * polled once a minute. Starts from the device's last snapshot so the number is never a dash on a slow link.
 */
export function useNationalCount(live = true): number | null {
  const [n, setN] = useState<number | null>(() => cachedSnapshot()?.national ?? null)
  const gotLive = useRef(false)
  useEffect(() => {
    let alive = true
    let timer = 0
    const poll = async () => {
      try { const s = await fetchSnapshot(); if (alive && !gotLive.current) setN(s.national) } catch { /* keep the last value */ }
      if (alive && !gotLive.current) timer = window.setTimeout(poll, POLL_MS)
    }
    if (!live) { poll(); return () => { alive = false; clearTimeout(timer) } }
    const off = onValue(ref(rtdb, 'counters/national'), (s) => { gotLive.current = true; clearTimeout(timer); setN(s.val() ?? 0) }, () => { if (!gotLive.current) poll() })
    // RTDB never fired (blocked WebSocket, captive network): fall back to polling until it does.
    timer = window.setTimeout(() => { if (!gotLive.current) poll() }, RTDB_GRACE_MS)
    return () => { alive = false; off(); clearTimeout(timer) }
  }, [live])
  return n
}

export default function LiveCounter({ target, size = 'md' }: { target?: number; size?: 'md' | 'xl' }) {
  const { t, lang } = useI18n()
  const { targets, liveCounter } = useAppConfig()
  const goal = target ?? targets.national
  const n = useNationalCount(liveCounter)
  const pct = n === null ? 0 : Math.min(100, (n / goal) * 100)
  return (
    <div className={size === 'xl' ? 'text-center' : ''}>
      <div className={`font-bold tabular text-primary leading-none ${size === 'xl' ? 'text-[18vw] sm:text-[9rem]' : 'text-5xl'}`}>
        {n === null ? '—' : n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}
      </div>
      <div className={`mt-2 text-muted ${size === 'xl' ? 'text-2xl' : 'text-sm'}`}>{t('counter.label')}</div>
      <div className="mt-3 h-2 rounded-full bg-primary-tint overflow-hidden" role="progressbar" aria-valuenow={n ?? 0} aria-valuemax={goal}>
        <div className="h-full bg-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted">{t('counter.target', { n: goal.toLocaleString('fr-FR') })}</div>
    </div>
  )
}
