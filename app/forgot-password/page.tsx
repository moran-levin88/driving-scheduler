'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function ForgotPasswordPage() {
  const { t, dir } = useLanguage()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    setSent(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir={dir}>
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
        <div className="text-4xl mb-4">🔑</div>
        <h1 className="text-xl font-bold text-blue-900 mb-2">{t('forgotTitle')}</h1>

        {sent ? (
          <>
            <p className="text-gray-600 mb-6">{t('forgotSentMsg')}</p>
            <Link href="/login"
              className="block w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium">
              {t('backToLogin')}
            </Link>
          </>
        ) : (
          <>
            <p className="text-gray-600 mb-6">{t('forgotMsg')}</p>
            <form onSubmit={handleSubmit} className="space-y-4 text-start">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                {loading ? t('submitting') : t('sendResetLink')}
              </button>
            </form>
            <Link href="/login" className="block mt-4 text-sm text-gray-400 hover:text-blue-600 hover:underline">
              {t('backToLogin')}
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
