'use client'
import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function SettingsPage() {
  const { dir, lang } = useLanguage()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const labels = {
    he: {
      title: 'שינוי סיסמה',
      subtitle: 'הקלד את הסיסמה הנוכחית (הזמנית) ואחר כך בחר סיסמה חדשה',
      current: 'סיסמה נוכחית',
      new: 'סיסמה חדשה',
      confirm: 'אימות סיסמה חדשה',
      hint: 'לפחות 6 תווים',
      submit: 'שמור סיסמה חדשה',
      saving: 'שומר...',
      mismatch: 'הסיסמאות אינן תואמות',
      success: '✅ הסיסמה עודכנה בהצלחה! כעת תוכל/י להיכנס עם הסיסמה החדשה.',
    },
    ru: {
      title: 'Смена пароля',
      subtitle: 'Введите текущий (временный) пароль, затем выберите новый',
      current: 'Текущий пароль',
      new: 'Новый пароль',
      confirm: 'Подтвердите новый пароль',
      hint: 'Минимум 6 символов',
      submit: 'Сохранить новый пароль',
      saving: 'Сохранение...',
      mismatch: 'Пароли не совпадают',
      success: '✅ Пароль успешно обновлён! Теперь вы можете входить с новым паролем.',
    },
  }
  const L = labels[lang]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError(L.mismatch); return }
    setLoading(true)
    const res = await fetch('/api/student/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    setLoading(false)
    if (res.ok) {
      setSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
    } else {
      const data = await res.json()
      setError(data.error || 'שגיאה')
    }
  }

  return (
    <div className="max-w-md mx-auto" dir={dir}>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{L.title}</h1>
      <p className="text-gray-500 text-sm mb-6">{L.subtitle}</p>

      {success ? (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-5 text-sm">
          {L.success}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{L.current}</label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
              required autoComplete="current-password"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{L.new}</label>
            <input type="password" value={next} onChange={e => setNext(e.target.value)}
              required minLength={6} autoComplete="new-password"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">{L.hint}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{L.confirm}</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required minLength={6} autoComplete="new-password"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium">
            {loading ? L.saving : L.submit}
          </button>
        </form>
      )}
    </div>
  )
}
