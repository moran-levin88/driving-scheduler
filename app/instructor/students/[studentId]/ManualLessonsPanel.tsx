'use client'
import { useState } from 'react'

type ManualLessonRecord = { id: string; date: string; lessons: number; amountPaid: number | null }

export default function ManualLessonsPanel({
  studentId, initialRecords,
}: {
  studentId: string
  initialRecords: ManualLessonRecord[]
}) {
  const [records, setRecords] = useState(initialRecords)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [lessons, setLessons] = useState('')
  const [amountPaid, setAmountPaid] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd() {
    if (!date) { setError('יש לבחור תאריך'); return }
    const lessonsNum = Number(lessons)
    if (!Number.isFinite(lessonsNum) || lessonsNum <= 0) { setError('כמות שיעורים לא תקינה'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/students/${studentId}/manual-lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, lessons: lessonsNum, amountPaid: amountPaid === '' ? null : Number(amountPaid) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setRecords(prev => [...prev, data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()))
        setDate(''); setLessons(''); setAmountPaid('')
      } else {
        setError(data.error || 'שגיאה')
      }
    } catch {
      setError('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/manual-lessons/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setRecords(prev => prev.filter(r => r.id !== id))
      } else {
        alert('שגיאה במחיקה')
      }
    } catch {
      alert('שגיאת רשת — נסה שוב')
    } finally {
      setDeletingId(null)
    }
  }

  const total = records.reduce((sum, r) => sum + r.lessons, 0)

  return (
    <div className="bg-white rounded-xl shadow p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-gray-900">
          שיעורים מהפלטפורמה הקודמת
          {records.length > 0 && <span className="text-sm font-normal text-gray-500 mr-2">({total} שיעורים)</span>}
        </h2>
        <button onClick={() => setOpen(v => !v)} className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
          + הוסף שיעור
        </button>
      </div>

      {records.length > 0 && (
        <div className="space-y-1 mb-2">
          {records.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-gray-50 text-sm">
              <span>
                {new Date(r.date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                {' — '}{r.lessons} שיעורים
                {r.amountPaid != null && <span className="text-gray-500"> — ₪{r.amountPaid}</span>}
              </span>
              <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                className="shrink-0 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition disabled:opacity-50">
                {deletingId === r.id ? '...' : '🗑'}
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="bg-blue-50 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">תאריך</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">כמות שיעורים</label>
              <input type="number" min={0} step={0.25} value={lessons} onChange={e => setLessons(e.target.value)}
                placeholder="1"
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">סכום ששולם (אופציונלי)</label>
              <input type="number" min={0} value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                placeholder="₪"
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={handleAdd} disabled={saving}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'שומר...' : 'הוסף שיעור'}
          </button>
        </div>
      )}
    </div>
  )
}
