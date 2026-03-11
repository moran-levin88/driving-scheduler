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
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">שם</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">אימייל</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">טלפון</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">שיעורים</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map(s => {
              const lessonCount = s.bookings.filter(b => ['APPROVED', 'COMPLETED'].includes(b.status)).length
              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{s.name}</td>
                  <td className="px-6 py-4 text-gray-600">{s.email}</td>
                  <td className="px-6 py-4 text-gray-600">{s.phone || '—'}</td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                      {lessonCount} שיעורים
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3 justify-end">
                      <Link href={`/instructor/students/${s.id}`} className="text-blue-600 hover:underline text-sm">
                        היסטוריה
                      </Link>
                      {confirmId === s.id ? (
                        <div className="flex gap-2 items-center">
                          <span className="text-sm text-gray-600">למחוק?</span>
                          <button
                            onClick={() => deleteStudent(s.id)}
                            disabled={deletingId === s.id}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50">
                            {deletingId === s.id ? '...' : 'כן'}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(s.id)}
                          className="text-red-500 hover:text-red-700 text-sm">
                          מחיקה
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {students.length === 0 && (
          <div className="p-8 text-center text-gray-500">אין תלמידים רשומים עדיין</div>
        )}
      </div>
    </div>
  )
}
