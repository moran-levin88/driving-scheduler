'use client'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'

function ResetPasswordForm() {
  const { t, dir } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('passwordsNoMatch'))
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || t('resetPasswordError'))
      return
    }

    setDone(true)
  }

  if (!token) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-gray-600 mb-6">{t('invalidResetLink')}</p>
        <Link href="/forgot-password"
          className="block w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium">
          {t('forgotTitle')}
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-gray-600 mb-6">{t('resetSuccessMsg')}</p>
        <button onClick={() => router.push('/login')}
          className="block w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium">
          {t('loginToSystem')}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
      <h1 className="text-xl font-bold text-blue-900 mb-6 text-center">{t('resetPasswordTitle')}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('newPassword')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('confirmPassword')}</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
          {loading ? t('submitting') : t('resetPasswordButton')}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  const { dir } = useLanguage()
  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir={dir}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
