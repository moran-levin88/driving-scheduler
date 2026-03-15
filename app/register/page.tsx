'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }

    setLoading(true)

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'שגיאה בהרשמה')
      setLoading(false)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-blue-50" dir="rtl">
        <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-blue-900 mb-2">ברוך הבא, {form.name}!</h2>
          <p className="text-gray-600 mb-2">ההרשמה הושלמה בהצלחה.</p>
          <p className="text-gray-500 text-sm mb-6">כעת תוכל/י להתחבר עם האימייל והסיסמה שבחרת ולקבוע שיעורים.</p>
          <Link href="/login"
            className="block w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium text-center">
            כניסה למערכת
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-blue-50" dir="rtl">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">הרשמה לתלמידים</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="block text-sm font-medium text-gray-700">סיסמה</label>
              <div className="relative">
                <button type="button" onClick={() => setShowTooltip(v => !v)} className="text-gray-400 text-sm">ⓘ</button>
                {showTooltip && (
                  <div className="absolute right-0 top-6 z-10 bg-gray-800 text-white text-xs rounded-lg p-3 w-56 shadow-lg leading-relaxed">
                    הסיסמה חייבת להכיל לפחות 6 תווים.<br />
                    זוהי הסיסמה הקבועה שלך למערכת — שמור/י אותה.
                  </div>
                )}
              </div>
            </div>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={form.password}
                onChange={e => setForm({...form, password: e.target.value})} required minLength={6}
                className="w-full border rounded-lg px-3 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימות סיסמה</label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)} required minLength={6}
                className="w-full border rounded-lg px-3 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? 'נרשם...' : 'הרשמה'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          כבר נרשמת? <Link href="/login" className="text-blue-600 hover:underline">כניסה</Link>
        </p>
      </div>
    </main>
  )
}
