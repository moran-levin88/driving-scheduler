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

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function fetchStudents() {
    const res = await fetch('/api/students')
    const data = await res.json()
    setStudents(data)
  }

  useEffect(() => { fetchStudents() }, [])

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
      <h1 className="text-3xl font-bold text-gray-900 mb-6">תלמידים</h1>

      {students.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
          אין תלמידים רשומים עדיין
        </div>
      ) : (
        <div className="space-y-3">
          {students.map(s => {
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
      )}
    </div>
  )
}
