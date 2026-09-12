import { Link, NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export default function Layout() {
  const { t, lang, setLang } = useI18n()
  const nav = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-primary-tint text-primary' : 'text-muted hover:text-ink'}`
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="tricolor"><i /><i /><i /></div>
      <header className="bg-surface border-b border-rule">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 mr-auto">
            <img src={`${import.meta.env.BASE_URL}logo-68.png`} alt="" className="w-9 h-9 object-contain" />
            <span className="font-bold leading-tight">{t('app.name')}<span className="block text-[11px] font-medium text-muted">{t('app.tagline')}</span></span>
          </Link>
          <nav className="hidden sm:flex gap-1">
            <NavLink to="/selfie" className={nav}>{t('nav.selfie')}</NavLink>
            <NavLink to="/mur" className={nav}>{t('nav.wall')}</NavLink>
            <NavLink to="/carte" className={nav}>{t('nav.map')}</NavLink>
          </nav>
          <button
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            className="text-xs font-medium border border-rule rounded-full px-3 py-1.5 text-muted hover:text-primary hover:border-primary"
            aria-label="Language">
            {lang === 'fr' ? 'Français | EN' : 'FR | English'}
          </button>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <nav className="sm:hidden sticky bottom-0 bg-surface border-t border-rule grid grid-cols-3 text-center text-xs font-medium">
        <NavLink to="/selfie" className={({ isActive }) => `py-3 ${isActive ? 'text-primary' : 'text-muted'}`}>{t('nav.selfie')}</NavLink>
        <NavLink to="/mur" className={({ isActive }) => `py-3 ${isActive ? 'text-primary' : 'text-muted'}`}>{t('nav.wall')}</NavLink>
        <NavLink to="/carte" className={({ isActive }) => `py-3 ${isActive ? 'text-primary' : 'text-muted'}`}>{t('nav.map')}</NavLink>
      </nav>
      <footer className="hidden sm:block text-center text-xs text-muted py-6">
        <Link to="/legal" className="hover:text-primary">{t('footer.legal')}</Link> · <Link to="/privacy" className="hover:text-primary">{t('footer.privacy')}</Link> · {t('footer.by')}
      </footer>
    </div>
  )
}
