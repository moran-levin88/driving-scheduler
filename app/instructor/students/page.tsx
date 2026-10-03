'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { he } from 'date-fns/locale'

type Student = {
  id: string
  name: string
  email: string
  phone: string | null
  isRestricted: boolean
  pricePer20Min: number | null
  idNumber: string | null
  dateOfBirth: string | null
  manualPriorLessons: number
  lessonCount: number
  debt: number
  balance: number
  bookings: { status: string; availability: { startTime: string } }[]
}

type ResetResult = { name: string; email: string; tempPassword: string }

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<ResetResult | null>(null)
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', pricePer20Min: '', idNumber: '', dateOfBirth: '', manualPriorLessons: '' })
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [weekOffset, setWeekOffset] = useState(1)
  const [showWeeklyCheck, setShowWeeklyCheck] = useState(false)
  const [showStudentList, setShowStudentList] = useState(false)

  function openEdit(s: Student) {
    setEditingStudent(s)
    setEditForm({
      name: s.name, email: s.email, phone: s.phone || '',
      pricePer20Min: s.pricePer20Min != null ? String(s.pricePer20Min) : '',
      idNumber: s.idNumber || '',
      dateOfBirth: s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : '',
      manualPriorLessons: String(s.manualPriorLessons ?? 0),
    })
    setEditError('')
  }

  async function saveEdit() {
    if (!editingStudent) return
    setSavingEdit(true)
    setEditError('')
    const res = await fetch(`/api/students/${editingStudent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name, email: editForm.email, phone: editForm.phone,
        pricePer20Min: editForm.pricePer20Min === '' ? null : Number(editForm.pricePer20Min),
        idNumber: editForm.idNumber,
        dateOfBirth: editForm.dateOfBirth || null,
        manualPriorLessons: editForm.manualPriorLessons === '' ? 0 : Number(editForm.manualPriorLessons),
      }),
    })
    setSavingEdit(false)
    if (res.ok) {
      setEditingStudent(null)
      fetchStudents() // refetch — lessonCount/debt/balance are server-computed
    } else {
      const d = await res.json().catch(() => ({}))
      setEditError(d.error || 'שגיאה בשמירה')
    }
  }

  async function fetchStudents() {
    const res = await fetch('/api/students')
    const data = await res.json()
    setStudents(data)
  }

  useEffect(() => { fetchStudents() }, [])

  async function toggleRestriction(id: string, current: boolean) {
    setTogglingId(id)
    const res = await fetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRestricted: !current }),
    })
    setTogglingId(null)
    if (res.ok) setStudents(prev => prev.map(s => s.id === id ? { ...s, isRestricted: !current } : s))
  }

  async function resetPassword(id: string) {
    setResettingId(id)
    const res = await fetch('/api/students/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id }),
    })
    setResettingId(null)
    if (res.ok) {
      const data = await res.json()
      setResetResult(data)
    }
  }

  async function deleteStudent(id: string) {
    setDeletingId(id)
    await fetch('/api/students', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id }),
    })
    setConfirmId(null)
    setDeletingId(null)
    fetchStudents()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">תלמידים</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowWeeklyCheck(v => !v)}
            title="מי עוד לא קבע שיעור"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
              showWeeklyCheck ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}>
            📋 מי לא קבע
          </button>
          <button onClick={() => setShowStudentList(v => !v)}
            title="רשימת תלמידים"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
              showStudentList ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}>
            👥 רשימת תלמידים
          </button>
          <input
            type="text"
            placeholder="חיפוש לפי שם, אימייל או טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>

      {/* Weekly check — who hasn't booked yet */}
      {showWeeklyCheck && (() => {
        const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset)
        const weekEnd = addDays(weekStart, 6) // exclusive — covers Sunday through Friday
        const hasBookingThatWeek = (s: Student) => s.bookings.some(b => {
          if (!['PENDING', 'APPROVED'].includes(b.status)) return false
          const t = new Date(b.availability.startTime)
          return t >= weekStart && t < weekEnd
        })
        const notBooked = students.filter(s => !hasBookingThatWeek(s))
        const rangeLabel = `${format(weekStart, 'd/M', { locale: he })}–${format(addDays(weekStart, 5), 'd/M', { locale: he })}`

        return (
          <div className="bg-white rounded-xl shadow p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-bold text-gray-900">מי עוד לא קבע שיעור</h2>
              <div className="flex items-center gap-1 mr-auto text-sm">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 hover:bg-gray-100 rounded">&rarr;</button>
                <span className="font-medium text-gray-600">{rangeLabel}</span>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 hover:bg-gray-100 rounded">&larr;</button>
              </div>
            </div>
            {weekOffset === 1 && <p className="text-xs text-gray-400 mb-3">שבוע הבא</p>}

            {students.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">טוען...</p>
            ) : notBooked.length === 0 ? (
              <p className="text-sm text-green-700 py-2">✓ כל התלמידים קבעו שיעור לשבוע הזה</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 mb-2">{notBooked.length} מתוך {students.length} תלמידים עדיין לא קבעו:</p>
                {notBooked.map(s => {
                  const waPhone = s.phone?.replace(/\D/g, '').replace(/^0/, '972')
                  const waText = encodeURIComponent(`היי ${s.name.trim()}, שמנו לב שעוד לא קבעת שיעור נהיגה לשבוע הבא (${rangeLabel}). רוצה לקבוע? היכנסו למערכת 🚗`)
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-800 truncate">{s.name}</span>
                      {waPhone ? (
                        <a href={`https://wa.me/${waPhone}?text=${waText}`} target="_blank" rel="noreferrer"
                          className="shrink-0 text-xs bg-green-500 text-white px-2.5 py-1 rounded-full hover:bg-green-600 transition">
                          📲 תזכורת
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-gray-300">אין טלפון</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Edit student modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" dir="rtl">
            <h2 className="text-lg font-bold mb-4">✏️ עריכת פרטי תלמיד</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">שם</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">אימייל</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">טלפון</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">מחיר ל-20 דק׳ (₪)</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.pricePer20Min}
                  onChange={e => setEditForm(f => ({ ...f, pricePer20Min: e.target.value }))}
                  placeholder="לדוגמה: 50"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">תעודת זהות</label>
                <input
                  type="text"
                  value={editForm.idNumber}
                  onChange={e => setEditForm(f => ({ ...f, idNumber: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">תאריך לידה</label>
                <input
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">שיעורים שבוצעו לפני המערכת</label>
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={editForm.manualPriorLessons}
                  onChange={e => setEditForm(f => ({ ...f, manualPriorLessons: e.target.value }))}
                  placeholder="0"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">לתלמידים ותיקים — שיעורים שהתבצעו לפני שהתחלתם להשתמש במערכת. ניתן להזין גם חצאי ורבעי שיעור (למשל 9.5 או 9.25)</p>
              </div>
            </div>
            {editError && <p className="text-red-600 text-sm mb-3">{editError}</p>}
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={savingEdit}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50">
                {savingEdit ? 'שומר...' : 'שמירה'}
              </button>
              <button onClick={() => setEditingStudent(null)}
                className="flex-1 border py-2 rounded-lg hover:bg-gray-50 transition">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password reset result modal */}
      {resetResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl" dir="rtl">
            <h2 className="text-lg font-bold mb-1">✅ סיסמה אופסה</h2>
            <p className="text-gray-600 text-sm mb-4">שלח/י לתלמיד {resetResult.name} את פרטי הכניסה:</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">אימייל:</span>
                <span className="font-mono font-semibold select-all">{resetResult.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">סיסמה זמנית:</span>
                <span className="font-mono font-bold text-blue-700 text-lg select-all">{resetResult.tempPassword}</span>
              </div>
            </div>
            {resetResult.email.includes('@placeholder') ? (
              <p className="text-xs text-orange-600 mb-4">⚠ לתלמיד זה אין אימייל רשמי — שתף את הסיסמה ישירות</p>
            ) : (
              <p className="text-xs text-gray-500 mb-4">התלמיד יכול להתחבר עם פרטים אלו ולשנות סיסמה בהגדרות.</p>
            )}
            <button onClick={() => setResetResult(null)}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium">
              סגור
            </button>
          </div>
        </div>
      )}

      {(showStudentList || search.trim().length > 0) && (() => {
        const q = search.trim().toLowerCase()
        const filtered = q
          ? students.filter(s =>
              s.name.toLowerCase().includes(q) ||
              s.email.toLowerCase().includes(q) ||
              (s.phone || '').includes(q)
            )
          : students
        if (filtered.length === 0) return (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
            {q ? `לא נמצאו תלמידים עבור "${search}"` : 'אין תלמידים רשומים עדיין'}
          </div>
        )
        return (
        <div className="space-y-3">
          {filtered.map(s => {
            return (
              <div key={s.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Student info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-semibold text-gray-900 text-base">{s.name}</p>
                      <span className="flex items-baseline gap-1 text-blue-700">
                        <span className="text-2xl font-bold leading-none">{s.lessonCount}</span>
                        <span className="text-xs text-blue-500">שיעורים</span>
                      </span>
                      {s.debt > 0 && (
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          חוב: ₪{s.debt}
                        </span>
                      )}
                      {s.balance > 0 && (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          יתרה: ₪{s.balance}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-1">{s.email}</p>
                    {s.phone && (
                      <a href={`tel:${s.phone}`} className="text-sm text-blue-600 hover:underline block">
                        📞 {s.phone}
                      </a>
                    )}
                    <button
                      onClick={() => toggleRestriction(s.id, s.isRestricted)}
                      disabled={togglingId === s.id}
                      title={s.isRestricted ? 'הגבלת שעות פעילה — לחץ להסרה' : 'ללא הגבלת שעות — לחץ להפעלה'}
                      className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs transition disabled:opacity-50 ${
                        s.isRestricted
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}>
                      {s.isRestricted ? '⏰ מוגבל שעות' : '⏰'}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link href={`/instructor/students/${s.id}`}
                      className="text-sm text-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                      היסטוריה
                    </Link>
                    <button onClick={() => openEdit(s)}
                      className="text-sm text-center bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                      ✏️ עריכת פרטים
                    </button>
                    <button onClick={() => resetPassword(s.id)} disabled={resettingId === s.id}
                      className="text-sm bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition disabled:opacity-50">
                      {resettingId === s.id ? '...' : '🔑 איפוס סיסמה'}
                    </button>

                    {confirmId === s.id ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => deleteStudent(s.id)} disabled={deletingId === s.id}
                          className="flex-1 text-xs bg-red-600 text-white px-2 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 transition">
                          {deletingId === s.id ? '...' : 'מחק'}
                        </button>
                        <button onClick={() => setConfirmId(null)}
                          className="flex-1 text-xs border px-2 py-1.5 rounded-lg hover:bg-gray-50 transition">
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmId(s.id)}
                        className="text-sm text-center bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition">
                        מחיקה
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        )
      })()}
    </div>
  )
}
