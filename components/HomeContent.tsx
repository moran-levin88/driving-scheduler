'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/contexts/LanguageContext'

export default function HomeContent() {
  const { t, lang, setLang, dir } = useLanguage()

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir={dir}>
      <div className="text-center space-y-6">
        <div className="flex justify-end">
          <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden text-sm bg-white">
            <button onClick={() => setLang('he')}
              className={`px-3 py-1.5 transition ${lang === 'he' ? 'bg-blue-600 text-white font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>
              עברית
            </button>
            <button onClick={() => setLang('ru')}
              className={`px-3 py-1.5 transition ${lang === 'ru' ? 'bg-blue-600 text-white font-bold' : 'text-gray-500 hover:bg-gray-50'}`}>
              Русский
            </button>
          </div>
        </div>
        <div className="flex justify-center">
          <Image src="/instructor.png" alt="Alex" width={96} height={96} className="rounded-full object-cover shadow-md" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-blue-900">{t('homeTitle')}</h1>
          <p className="text-xl text-gray-700 mt-1" style={{ fontFamily: "'Suez One', serif" }}>{t('withAlex')}</p>
          <p className="text-gray-500 mt-2">{t('homeTagline')}</p>
        </div>
        <div className="flex gap-4 justify-center items-center">
          <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium">{t('loginToSystem')}</Link>
          <Link href="/register" className="text-blue-600 hover:underline transition font-medium">{t('registerTitle')}</Link>
        </div>
      </div>
    </main>
  )
}
