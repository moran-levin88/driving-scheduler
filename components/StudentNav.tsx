'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function StudentNav({ name }: { name: string }) {
  const pathname = usePathname()
  const { t, lang, setLang, dir } = useLanguage()

  return (
    <nav className="bg-blue-700 text-white px-4 py-3">
      <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} dir={dir}>
        <Link href="/student/dashboard"
          className={`flex-shrink-0 hover:text-blue-200 transition text-sm ${pathname === '/student/dashboard' ? 'font-bold border-b-2 border-white' : ''}`}>
          {t('navMyLessons')}
        </Link>
        <Link href="/student/book"
          className={`flex-shrink-0 hover:text-blue-200 transition text-sm ${pathname === '/student/book' ? 'font-bold border-b-2 border-white' : ''}`}>
          {t('navBook')}
        </Link>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex-shrink-0 text-blue-200 hover:text-white transition text-sm mr-auto">
          {t('navLogout')}
        </button>
        <div className="flex-shrink-0 flex items-center gap-0 border border-blue-400 rounded-lg overflow-hidden text-xs">
          <button onClick={() => setLang('he')}
            className={`px-2 py-1 transition ${lang === 'he' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            עב
          </button>
          <button onClick={() => setLang('ru')}
            className={`px-2 py-1 transition ${lang === 'ru' ? 'bg-white text-blue-700 font-bold' : 'hover:bg-blue-600'}`}>
            RU
          </button>
        </div>
      </div>
    </nav>
  )
}
