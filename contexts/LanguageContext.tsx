'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import translations, { Lang, TranslationKey } from '@/lib/translations'

type LanguageContextType = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
  dir: 'rtl' | 'ltr'
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'he',
  setLang: () => {},
  t: (key) => translations.he[key],
  dir: 'rtl',
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('he')

  useEffect(() => {
    const saved = localStorage.getItem('app-lang') as Lang | null
    if (saved === 'he' || saved === 'ru') setLangState(saved)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('app-lang', l)
  }

  function t(key: TranslationKey): string {
    return translations[lang][key]
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir: lang === 'he' ? 'rtl' : 'ltr' }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
