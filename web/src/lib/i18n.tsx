import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import fr from '../i18n/fr.json'
import en from '../i18n/en.json'

type Lang = 'fr' | 'en'
type Dict = typeof fr
const dicts: Record<Lang, Dict> = { fr, en: en as Dict }

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: keyof Dict, vars?: Record<string, string | number>) => string }>(null!)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang')
    if (saved === 'fr' || saved === 'en') return saved
  } catch { /* private mode */ }
  return navigator.language.startsWith('en') ? 'en' : 'fr'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const value = useMemo(() => ({
    lang,
    setLang: (l: Lang) => { setLangState(l); try { localStorage.setItem('lang', l) } catch { /* ignore */ } document.documentElement.lang = l },
    t: (k: keyof Dict, vars?: Record<string, string | number>) => {
      let s: string = dicts[lang][k] ?? dicts.fr[k] ?? String(k)
      if (vars) for (const [key, v] of Object.entries(vars)) s = s.replace(`{${key}}`, String(v))
      return s
    },
  }), [lang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)
