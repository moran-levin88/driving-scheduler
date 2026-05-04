'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type Student = {
  id: string
  name: string
  email: string
  phone: string | null
  bookings: { status: string }[]
}

type ResetResult = { name: string; email: string; tempPassword: string }

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<ResetResult | null>(null)
  const [search, setSearch] = useState('')

  async function fetchStudents() {
    const res = await fetch('/api/students')
    const data = await res.json()
    setStudents(data)
  }

  useEffect(() => { fetchStudents() }, [])

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
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">תלמידים</h1>
        <input
          type="text"
          placeholder="חיפוש לפי שם, אימייל או טלפון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 w-64"
        />
      </div>

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

      {(() => {
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
            const lessonCount = s.bookings.filter(b => ['APPROVED', 'COMPLETED'].includes(b.status)).length
            return (
              <div key={s.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Student info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-base">{s.name}</p>
                    <p className="text-sm text-gray-500 truncate">{s.email}</p>
                    {s.phone && (
                      <a href={`tel:${s.phone}`} className="text-sm text-blue-600 hover:underline block">
                        📞 {s.phone}
                      </a>
                    )}
                    <span className="inline-block mt-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                      {lessonCount} שיעורים
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link href={`/instructor/students/${s.id}`}
                      className="text-sm text-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                      היסטוריה
                    </Link>
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
