import { Link } from 'react-router-dom'
import LiveCounter from '../components/LiveCounter'
import { useI18n } from '../lib/i18n'

export default function Home() {
  const { t } = useI18n()
  return (
    <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] items-stretch">
      <section className="card p-7 sm:p-10 bg-primary text-white relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-primary-soft/60" aria-hidden />
        <div className="absolute right-10 bottom-8 w-5 h-5 rounded-full bg-gold" aria-hidden />
        <div className="relative">
        <p className="label text-white/70">{t('home.week')}</p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight text-balance">{t('home.title')}</h1>
        <p className="mt-3 text-white/85 max-w-md">{t('home.lede')}</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link to="/selfie" className="btn-white">{t('home.cta')} →</Link>
          <Link to="/mur" className="btn border border-white/60 text-white hover:bg-white/10">{t('home.wall')}</Link>
        </div>
        </div>
      </section>
      <section className="card p-7">
        <LiveCounter />
      </section>
    </div>
  )
}
