import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ensureAnonymousUser, protocolInfo, type ProtocolInfo } from '../lib/firebase'
import { useI18n } from '../lib/i18n'

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

/**
 * Ceremonial landing for the two protocol links: /presidence?t=… (numbers 1–10, the President's photo is n° 1 and his
 * video n° 2) and /gouvernement?t=… (numbers 11–60). The token is checked server-side before anything is shown; the
 * studio is the ordinary one, opened with ?vip=CODE so the contribution lands in the Protocole queue.
 */
export default function Protocol() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const president = pathname.startsWith('/presidence')
  const code = president ? 'PRESIDENCE' : 'GOUVERNEMENT'
  const token = params.get('t') ?? ''
  const [state, setState] = useState<'checking' | 'ok' | 'invalid'>(token ? 'checking' : 'invalid')
  const [info, setInfo] = useState<ProtocolInfo | null>(null)

  // Dev only: ?apercu=1 shows the page without a token (the callable is not reachable from a local build).
  const preview = import.meta.env.DEV && params.get('apercu') === '1'
  useEffect(() => {
    let alive = true
    if (preview) { setInfo({ code, tier: president ? 'president' : 'minister' }); setState('ok'); return }
    if (!token) return
    ;(async () => {
      try {
        await ensureAnonymousUser()
        const p = await protocolInfo({ code, token })
        if (alive) { setInfo(p); setState('ok') }
      } catch { if (alive) setState('invalid') }
    })()
    return () => { alive = false }
  }, [code, token, preview, president])

  if (state === 'checking') return <p className="p-8 text-center text-muted">{t('protocol.checking')}</p>
  if (state === 'invalid' || !info) return <p className="mx-auto max-w-md card p-8 text-center text-muted">{t('protocol.invalid')}</p>

  const k = president ? 'president' : 'minister'
  return (
    <div className="mx-auto max-w-2xl">
      <section
        className={`card overflow-hidden relative text-white ${president ? 'bg-ink ring-1 ring-gold/60' : 'bg-primary'}`}
        style={president
          ? { background: 'radial-gradient(60% 50% at 50% 0%, rgba(235,171,88,.28), transparent 70%), #121826' }
          : { background: 'radial-gradient(60% 50% at 50% 0%, rgba(255,255,255,.18), transparent 70%), #3273AC' }}>
        <div className="tricolor" aria-hidden><i /><i /><i /></div>
        <div className="px-6 py-10 sm:px-12 sm:py-14 grid gap-5 justify-items-center text-center">
          <img src={asset('armoiries.svg')} alt={t('screen.republic')} className={`${president ? 'h-32 sm:h-40' : 'h-24 sm:h-28'} w-auto drop-shadow-[0_6px_18px_rgba(0,0,0,.35)]`} />
          <p className={`uppercase tracking-[0.32em] text-[11px] sm:text-xs font-medium ${president ? 'text-gold' : 'text-white/80'}`}>{t(`protocol.${k}.kicker`)}</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-balance">{t(`protocol.${k}.title`)}</h1>
          <p className="text-white/85 max-w-md text-balance">{t(`protocol.${k}.lede`)}</p>
          <Link to={`/selfie?vip=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}`} className={`${president ? 'btn-gold' : 'btn-white'} mt-2 min-w-[240px]`}>{t(`protocol.${k}.cta`)} →</Link>
          <p className={`text-sm max-w-sm ${president ? 'text-gold/90' : 'text-white/80'}`}>{t(`protocol.${k}.note`)}</p>
        </div>
        <div className="border-t border-white/15 px-6 py-4 flex items-center justify-center gap-3 text-sm text-white/85">
          <span className="bg-white rounded-xl p-1.5 shadow-[0_4px_14px_rgba(0,0,0,.25)]"><img src={asset('logo-68.png')} alt="An 68" className="h-9 w-9 block" /></span>
          <span className="font-medium">{t('screen.tagline')}</span>
        </div>
      </section>
      <p className="mt-5 text-center text-sm text-muted">{t('protocol.privacy')}</p>
    </div>
  )
}
