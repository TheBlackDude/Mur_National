import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

/** D6: resumable upload to videos/{mission}/{id}.mp4 after the submitVideo callable validates the mission token; duration 60–90 s read from <video> metadata. */
export default function Video() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const mission = params.get('mission')
  const token = params.get('t')
  if (!mission || !token) return <p className="card p-8 text-center text-muted">{t('video.invalid')}</p>
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">{t('video.title')}</h1>
      <p className="text-muted mt-2">{t('video.lede')}</p>
      <div className="card p-6 mt-4 text-sm text-muted">Mission {mission} · upload arrives on D6.</div>
    </div>
  )
}
