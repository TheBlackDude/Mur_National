import { Link, NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export default function Layout() {
  const { t, lang, setLang } = useI18n()
  const nav = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-primary-tint text-primary' : 'text-muted hover:text-ink'}`
  const tab = ({ isActive }: { isActive: boolean }) => `flex items-center justify-center min-h-12 px-1 ${isActive ? 'text-primary' : 'text-muted'}`
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="tricolor"><i /><i /><i /></div>
      <header className="bg-surface border-b border-rule">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center gap-3 sm:gap-4">
          <Link to="/" className="flex items-center gap-2.5 mr-auto min-w-0">
            <img src={`${import.meta.env.BASE_URL}logo-68.png`} alt="" className="w-9 h-9 object-contain shrink-0" />
            <span className="font-bold leading-tight truncate">{t('app.name')}<span className="block text-[11px] font-medium text-muted truncate">{t('app.tagline')}</span></span>
          </Link>
          <nav className="hidden sm:flex gap-1">
            <NavLink to="/selfie" className={nav}>{t('nav.selfie')}</NavLink>
            <NavLink to="/mur" className={nav}>{t('nav.wall')}</NavLink>
            <NavLink to="/carte" className={nav}>{t('nav.map')}</NavLink>
          </nav>
          <button
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            className="shrink-0 text-xs font-medium border border-rule rounded-full px-3 min-h-9 text-muted hover:text-primary hover:border-primary"
            aria-label="Language">
            <span className="sm:hidden">{lang === 'fr' ? 'EN' : 'FR'}</span>
            <span className="hidden sm:inline">{lang === 'fr' ? 'Français | EN' : 'FR | English'}</span>
          </button>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      {/* Phone tab bar: sticky, above the home indicator on notched phones (viewport-fit=cover). */}
      <nav className="sm:hidden sticky bottom-0 z-40 bg-surface/95 backdrop-blur border-t border-rule grid grid-cols-4 text-center text-xs font-medium pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={tab}>{t('nav.home')}</NavLink>
        <NavLink to="/selfie" className={tab}>{t('nav.selfie')}</NavLink>
        <NavLink to="/mur" className={tab}>{t('nav.wall')}</NavLink>
        <NavLink to="/carte" className={tab}>{t('nav.map')}</NavLink>
      </nav>
      <footer className="hidden sm:block text-center text-xs text-muted py-6">
        <Link to="/legal" className="hover:text-primary">{t('footer.legal')}</Link> · <Link to="/privacy" className="hover:text-primary">{t('footer.privacy')}</Link> · {t('footer.by')}
      </footer>
    </div>
  )
}
