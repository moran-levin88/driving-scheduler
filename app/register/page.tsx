'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', idNumber: '', dateOfBirth: '' })
  const [confirm, setConfirm] = useState('')
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const { t, lang, setLang, dir } = useLanguage()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== confirm) {
      setError(t('passwordsNoMatch'))
      return
    }

    if (!agreedToPrivacy) {
      setError(t('agreeToPrivacyRequired'))
      return
    }

    setLoading(true)

    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, name, agreedToPrivacy }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || t('registerError'))
      setLoading(false)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-blue-50" dir={dir}>
        <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-blue-900 mb-2">{t('welcome')}, {form.firstName}!</h2>
          <p className="text-gray-600 mb-2">{t('registrationSuccess')}</p>
          <p className="text-gray-500 text-sm mb-6">{t('registrationSuccessMsg')}</p>
          <Link href="/login"
            className="block w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium text-center">
            {t('loginToSystem')}
          </Link>
        </div>
      </main>
    )
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

        <h1 className="text-2xl font-bold text-blue-900 mb-1">{t('registerTitle')}</h1>
        <p className="text-xs text-gray-400 mb-5"><span className="text-red-500">*</span> {t('requiredField')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('firstName')} <span className="text-red-500">*</span></label>
            <input type="text" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('lastName')} <span className="text-red-500">*</span></label>
            <input type="text" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')} <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('idNumber')} <span className="text-red-500">*</span></label>
            <input type="text" value={form.idNumber} onChange={e => setForm({...form, idNumber: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('dateOfBirth')} <span className="text-red-500">*</span></label>
            <input type="date" value={form.dateOfBirth} onChange={e => setForm({...form, dateOfBirth: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="block text-sm font-medium text-gray-700">{t('password')} <span className="text-red-500">*</span></label>
              <div className="relative">
                <button type="button" onClick={() => setShowTooltip(v => !v)} className="text-gray-400 text-sm">ⓘ</button>
                {showTooltip && (
                  <div className="absolute right-0 top-6 z-10 bg-gray-800 text-white text-xs rounded-lg p-3 w-56 shadow-lg leading-relaxed">
                    {t('passwordHint1')}<br />
                    {t('passwordHint2')}
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={form.password}
                onChange={e => setForm({...form, password: e.target.value})} required minLength={8}
                className="w-full border rounded-lg px-3 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('confirmPassword')} <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)} required minLength={8}
                className="w-full border rounded-lg px-3 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={agreedToPrivacy} onChange={e => setAgreedToPrivacy(e.target.checked)}
              className="mt-0.5 shrink-0" />
            <span>
              {t('agreeToPrivacy1')}
              <Link href="/privacy" target="_blank" className="text-blue-600 hover:underline">
                {t('privacyPolicyLinkLabel')}
              </Link>
            </span>
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? t('registering') : t('register')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          {t('alreadyRegistered')}{' '}
          <Link href="/login" className="text-blue-600 hover:underline">{t('login')}</Link>
        </p>
      </div>
    </main>
  )
}
