'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function StudentNav({ name }: { name: string }) {
  const pathname = usePathname()
  const { t, lang, setLang, dir } = useLanguage()

  return (
    <nav className="sticky top-0 z-40 bg-blue-700 text-white px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 shadow-sm">
      <div className="flex min-h-11 items-center gap-1 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} dir={dir}>
        <Link href="/student/dashboard"
          className={`shrink-0 flex items-center min-h-11 rounded-full px-3 text-sm font-medium transition active:scale-95 ${
            pathname === '/student/dashboard' ? 'bg-white text-blue-700 font-semibold' : 'text-blue-100 hover:text-white hover:bg-blue-600'
          }`}>
          {t('navMyLessons')}
        </Link>
        <Link href="/student/book"
          className={`shrink-0 flex items-center min-h-11 rounded-full px-3 text-sm font-medium transition active:scale-95 ${
            pathname === '/student/book' ? 'bg-white text-blue-700 font-semibold' : 'text-blue-100 hover:text-white hover:bg-blue-600'
          }`}>
          {t('navBook')}
        </Link>
        <Link href="/student/settings"
          className={`shrink-0 flex items-center min-h-11 rounded-full px-3 text-sm transition active:scale-95 ${
            pathname === '/student/settings' ? 'bg-white text-blue-700 font-semibold' : 'text-blue-200 hover:text-white hover:bg-blue-600'
          }`}>
          🔑
        </Link>
        <button onClick={() => window.location.reload()}
          className="shrink-0 flex items-center min-h-11 px-2 text-blue-200 hover:text-white transition active:scale-95" title="רענן">
          ↻
        </button>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="shrink-0 flex items-center min-h-11 px-2 text-blue-200 hover:text-white transition text-sm active:scale-95 mr-auto">
          {t('navLogout')}
        </button>
        <div className="shrink-0 flex items-center border border-blue-400 rounded-lg overflow-hidden text-xs">
          <button onClick={() => setLang('he')}
            className={`px-2 py-1.5 transition ${lang === 'he' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            עב
          </button>
          <button onClick={() => setLang('ru')}
            className={`px-2 py-1.5 transition ${lang === 'ru' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            RU
          </button>
        </div>
      </div>
    </nav>
  )
}
