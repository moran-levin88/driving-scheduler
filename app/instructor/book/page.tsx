'use client'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

type Student = { id: string; name: string; email: string; phone?: string | null }
type Slot = { id: string; startTime: string; endTime: string }

export default function InstructorBookPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [studentId, setStudentId] = useState('')
  const [availabilityId, setAvailabilityId] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(setStudents)
    fetch('/api/availability').then(r => r.json()).then((data: any[]) => {
      const free = data
        .filter(s => !s.isBooked && !s.isBlocked && new Date(s.startTime) > new Date())
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setSlots(free)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!studentId || !availabilityId) {
      setError('יש לבחור תלמיד ושעה')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/instructor/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, availabilityId, pickupAddress, notes }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'שגיאה בקביעת השיעור')
    } else {
      setSuccess(true)
      setStudentId('')
      setAvailabilityId('')
      setPickupAddress('')
      setNotes('')
      // Refresh free slots
      fetch('/api/availability').then(r => r.json()).then((data: any[]) => {
        const free = data
          .filter(s => !s.isBooked && !s.isBlocked && new Date(s.startTime) > new Date())
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        setSlots(free)
      })
    }
  }

  function formatSlot(slot: Slot) {
    const start = new Date(slot.startTime)
    const end = new Date(slot.endTime)
    return `${format(start, "EEEE, d בMMMM yyyy", { locale: he })} | ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">קביעת שיעור לתלמיד</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 mb-6">
          השיעור נקבע בהצלחה! התלמיד קיבל אישור במייל.
          <button onClick={() => setSuccess(false)} className="mr-4 text-green-600 hover:underline text-sm">קביעת שיעור נוסף</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תלמיד</label>
          <select
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">— בחר תלמיד —</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.phone ? ` (${s.phone})` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">מועד השיעור</label>
          {slots.length === 0 ? (
            <p className="text-gray-500 text-sm">אין שעות פנויות. <a href="/instructor/availability" className="text-blue-600 hover:underline">הוסף זמינות</a></p>
          ) : (
            <select
              value={availabilityId}
              onChange={e => setAvailabilityId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">— בחר מועד —</option>
              {slots.map(s => (
                <option key={s.id} value={s.id}>{formatSlot(s)}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">כתובת איסוף <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
          <input
            type="text"
            value={pickupAddress}
            onChange={e => setPickupAddress(e.target.value)}
            placeholder="לדוגמה: רחוב הרצל 12, תל אביב"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || slots.length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'קובע שיעור...' : 'קבע שיעור'}
        </button>
      </form>
    </div>
  )
}
