'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function SettingsPage() {
  const { dir, lang } = useLanguage()
  const { data: session, update } = useSession()

  // Name editing
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [nameError, setNameError] = useState('')

  // Password change
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [pwdSuccess, setPwdSuccess] = useState(false)
  const [pwdError, setPwdError] = useState('')

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name)
  }, [session?.user?.name])

  const L = lang === 'ru' ? {
    pageTitle: 'Настройки',
    nameTitle: 'Имя',
    nameSave: 'Сохранить имя',
    nameSaving: 'Сохранение...',
    nameSuccess: '✅ Имя обновлено',
    nameError: 'Минимум 2 символа',
    pwdTitle: 'Смена пароля',
    pwdSubtitle: 'Введите текущий пароль и выберите новый',
    currentPwd: 'Текущий пароль',
    newPwd: 'Новый пароль',
    confirmPwd: 'Подтвердите пароль',
    hint: 'Минимум 6 символов',
    pwdSave: 'Сохранить пароль',
    pwdSaving: 'Сохранение...',
    mismatch: 'Пароли не совпадают',
    pwdSuccess: '✅ Пароль успешно обновлён',
  } : {
    pageTitle: 'הגדרות',
    nameTitle: 'שם',
    nameSave: 'שמור שם',
    nameSaving: 'שומר...',
    nameSuccess: '✅ השם עודכן בהצלחה',
    nameError: 'שם חייב להכיל לפחות 2 תווים',
    pwdTitle: 'שינוי סיסמה',
    pwdSubtitle: 'הקלד את הסיסמה הנוכחית ואחר כך בחר חדשה',
    currentPwd: 'סיסמה נוכחית',
    newPwd: 'סיסמה חדשה',
    confirmPwd: 'אימות סיסמה חדשה',
    hint: 'לפחות 6 תווים',
    pwdSave: 'שמור סיסמה חדשה',
    pwdSaving: 'שומר...',
    mismatch: 'הסיסמאות אינן תואמות',
    pwdSuccess: '✅ הסיסמה עודכנה בהצלחה',
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setNameError(''); setNameSuccess(false)
    if (name.trim().length < 2) { setNameError(L.nameError); return }
    setSavingName(true)
    const res = await fetch('/api/student/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setSavingName(false)
    if (res.ok) {
      setNameSuccess(true)
      await update({ name: name.trim() })
    } else {
      const d = await res.json()
      setNameError(d.error || 'שגיאה')
    }
  }

  async function handleSavePwd(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(''); setPwdSuccess(false)
    if (next !== confirm) { setPwdError(L.mismatch); return }
    setSavingPwd(true)
    const res = await fetch('/api/student/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    setSavingPwd(false)
    if (res.ok) {
      setPwdSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
    } else {
      const d = await res.json()
      setPwdError(d.error || 'שגיאה')
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6" dir={dir}>
      <h1 className="text-3xl font-bold text-gray-900">{L.pageTitle}</h1>

      {/* Name */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4">{L.nameTitle}</h2>
        <form onSubmit={handleSaveName} className="space-y-3">
          <input type="text" value={name} onChange={e => { setName(e.target.value); setNameSuccess(false) }}
            required className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          {nameError && <p className="text-red-500 text-sm">{nameError}</p>}
          {nameSuccess && <p className="text-green-600 text-sm">{L.nameSuccess}</p>}
          <button type="submit" disabled={savingName}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium">
            {savingName ? L.nameSaving : L.nameSave}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-1">{L.pwdTitle}</h2>
        <p className="text-gray-500 text-sm mb-4">{L.pwdSubtitle}</p>
        <form onSubmit={handleSavePwd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{L.currentPwd}</label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
              required autoComplete="current-password"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{L.newPwd}</label>
            <input type="password" value={next} onChange={e => setNext(e.target.value)}
              required minLength={6} autoComplete="new-password"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">{L.hint}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{L.confirmPwd}</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required minLength={6} autoComplete="new-password"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
          </div>
          {pwdError && <p className="text-red-500 text-sm">{pwdError}</p>}
          {pwdSuccess && <p className="text-green-600 text-sm">{L.pwdSuccess}</p>}
          <button type="submit" disabled={savingPwd}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium">
            {savingPwd ? L.pwdSaving : L.pwdSave}
          </button>
        </form>
      </div>
    </div>
  )
}
