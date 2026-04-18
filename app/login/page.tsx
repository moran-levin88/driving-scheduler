'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '@/contexts/LanguageContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { t, lang, setLang, dir } = useLanguage()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError(t('loginError'))
      setLoading(false)
      return
    }

    const sessionRes = await fetch('/api/auth/session')
    const session = await sessionRes.json()
    const role = session?.user?.role

    if (role === 'INSTRUCTOR') router.push('/instructor/dashboard')
    else router.push('/student/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir={dir}>
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden text-sm">
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

        <div className="flex items-center gap-3 mb-6">
          <Image src="/instructor.png" alt="Alex" width={52} height={52} className="rounded-full object-cover shadow-sm shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-blue-900 leading-tight">{t('loginTitle')}</h1>
            <p className="text-sm text-gray-500 mt-0.5" style={{ fontFamily: "'Suez One', serif" }}>{t('withAlex')}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className={dir === 'rtl' ? 'text-left' : 'text-right'}>
            <Link href="/forgot-password" className="text-xs text-gray-400 hover:text-blue-600 hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? t('loggingIn') : t('login')}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-gray-600">
          {t('noAccount')}{' '}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            {t('registerHere')}
          </Link>
        </div>
      </div>
    </main>
  )
}
