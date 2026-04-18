'use client'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

type Student = { id: string; name: string; email: string; phone?: string | null }
type Slot = { id: string; startTime: string; endTime: string }

type LessonType = 'single' | 'oneAndHalf' | 'double'
const LESSON_OPTIONS: { value: LessonType; label: string; slots: number }[] = [
  { value: 'single',      label: 'שיעור (40 דק׳)',       slots: 1 },
  { value: 'oneAndHalf',  label: 'שיעור וחצי (שעה)',     slots: 2 },
  { value: 'double',      label: 'שיעור כפול (80 דק׳)',  slots: 2 },
]

export default function InstructorBookPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [studentId, setStudentId] = useState('')
  const [availabilityId, setAvailabilityId] = useState('')
  const [lessonType, setLessonType] = useState<LessonType>('single')
  const [pickupAddress, setPickupAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // New student form state
  const [showNewStudent, setShowNewStudent] = useState(false)
  const [newStudent, setNewStudent] = useState({ name: '', phone: '', email: '' })
  const [creatingStudent, setCreatingStudent] = useState(false)
  const [newStudentError, setNewStudentError] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; tempPassword: string | null } | null>(null)

  function fetchData() {
    fetch('/api/students').then(r => r.json()).then(d => { if (Array.isArray(d)) setStudents(d) })
    fetch('/api/availability').then(r => r.json()).then((data: any) => {
      if (!Array.isArray(data)) return
      const free = data
        .filter((s: any) => !s.isBooked && !s.isBlocked && new Date(s.startTime) > new Date())
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      setSlots(free)
    })
  }

  useEffect(() => { fetchData() }, [])

  // Find next consecutive slot
  function getNextSlot(id: string): Slot | null {
    const current = slots.find(s => s.id === id)
    if (!current) return null
    return slots.find(s =>
      new Date(s.startTime).getTime() === new Date(current.endTime).getTime()
    ) || null
  }

  const selectedSlot = slots.find(s => s.id === availabilityId) || null
  const nextSlot = availabilityId ? getNextSlot(availabilityId) : null
  const needsTwo = lessonType === 'oneAndHalf' || lessonType === 'double'
  const missingNext = needsTwo && availabilityId && !nextSlot

  function getAvailabilityIds(): string[] {
    if (!availabilityId) return []
    if (needsTwo && nextSlot) return [availabilityId, nextSlot.id]
    return [availabilityId]
  }

  function formatSlot(slot: Slot) {
    const start = new Date(slot.startTime)
    const end = new Date(slot.endTime)
    return `${format(start, "EEEE, d בMMMM yyyy", { locale: he })} | ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
  }

  function formatSelectedRange() {
    if (!selectedSlot) return ''
    const start = new Date(selectedSlot.startTime)
    const endSlot = needsTwo && nextSlot ? nextSlot : selectedSlot
    const end = new Date(endSlot.endTime)
    return `${format(start, "EEEE, d בMMMM yyyy", { locale: he })} | ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
  }

  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault()
    setCreatingStudent(true)
    setNewStudentError('')

    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent),
    })
    const data = await res.json()
    setCreatingStudent(false)

    if (!res.ok) {
      setNewStudentError(data.error || 'שגיאה ביצירת התלמיד')
      return
    }

    setStudents(prev => [...prev, { id: data.id, name: data.name, email: data.email, phone: data.phone }].sort((a, b) => a.name.localeCompare(b.name, 'he')))
    setStudentId(data.id)
    setShowNewStudent(false)
    setNewStudent({ name: '', phone: '', email: '' })

    if (data.tempPassword) {
      setCreatedCredentials({ name: data.name, email: data.email, tempPassword: data.tempPassword })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ids = getAvailabilityIds()
    if (!studentId || ids.length === 0) {
      setError('יש לבחור תלמיד ושעה')
      return
    }
    if (needsTwo && !nextSlot) {
      setError('אין שיעור רצוף פנוי לאחר השעה שנבחרה')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/instructor/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, availabilityIds: ids, halfLesson: lessonType === 'oneAndHalf', pickupAddress, notes }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'שגיאה בקביעת השיעור')
    } else {
      setSuccess(true)
      setStudentId('')
      setAvailabilityId('')
      setLessonType('single')
      setPickupAddress('')
      setNotes('')
      setCreatedCredentials(null)
      fetchData()
    }
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

      {createdCredentials && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl px-5 py-4 mb-6 text-sm space-y-1">
          <p className="font-bold">✓ התלמיד {createdCredentials.name} נוסף למערכת</p>
          {createdCredentials.tempPassword && (
            <>
              <p>שלח/י לתלמיד את פרטי הכניסה הבאים:</p>
              <p>📧 אימייל: <span className="font-mono font-bold">{createdCredentials.email}</span></p>
              <p>🔑 סיסמה זמנית: <span className="font-mono font-bold">{createdCredentials.tempPassword}</span></p>
              <p className="text-blue-600 text-xs mt-1">התלמיד יוכל להתחבר עם פרטים אלו ולשנות סיסמה מהגדרות.</p>
            </>
          )}
          {!createdCredentials.tempPassword && (
            <p className="text-blue-700">התלמיד יוכל להירשם למערכת בעצמו כשיקבל את הקישור.</p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 space-y-5">

        {/* Student */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">תלמיד</label>
            <button type="button" onClick={() => { setShowNewStudent(v => !v); setNewStudentError('') }}
              className="text-sm text-blue-600 hover:underline">
              {showNewStudent ? 'ביטול' : '+ תלמיד חדש'}
            </button>
          </div>

          {showNewStudent ? (
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
              <p className="text-sm font-medium text-blue-800">הוספת תלמיד חדש למערכת</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">שם מלא <span className="text-red-500">*</span></label>
                <input type="text" value={newStudent.name}
                  onChange={e => setNewStudent(p => ({ ...p, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">טלפון</label>
                <input type="tel" value={newStudent.phone}
                  onChange={e => setNewStudent(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">
                  אימייל <span className="text-gray-400 font-normal">(אם ידוע — ישמש לכניסה למערכת)</span>
                </label>
                <input type="email" value={newStudent.email}
                  onChange={e => setNewStudent(p => ({ ...p, email: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              {newStudentError && <p className="text-red-500 text-xs">{newStudentError}</p>}
              <button type="button" onClick={handleCreateStudent}
                disabled={creatingStudent || !newStudent.name.trim()}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition">
                {creatingStudent ? 'מוסיף...' : 'הוסף תלמיד'}
              </button>
            </div>
          ) : (
            <select value={studentId} onChange={e => setStudentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">— בחר תלמיד —</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.phone ? ` (${s.phone})` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {/* Lesson type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">סוג שיעור</label>
          <div className="flex rounded-lg border overflow-hidden">
            {LESSON_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setLessonType(opt.value)}
                className={`flex-1 py-2 text-sm font-medium transition ${lessonType === opt.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Slot selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">מועד השיעור</label>
          {slots.length === 0 ? (
            <p className="text-gray-500 text-sm">אין שעות פנויות. <a href="/instructor/availability" className="text-blue-600 hover:underline">הוסף זמינות</a></p>
          ) : (
            <select value={availabilityId} onChange={e => setAvailabilityId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
              <option value="">— בחר מועד התחלה —</option>
              {slots.map(s => (
                <option key={s.id} value={s.id}>{formatSlot(s)}</option>
              ))}
            </select>
          )}
          {availabilityId && selectedSlot && (
            <p className={`text-xs mt-1 ${missingNext ? 'text-red-500' : 'text-gray-500'}`}>
              {needsTwo
                ? missingNext
                  ? '⚠ אין שיעור רצוף פנוי לאחר שעה זו'
                  : `✓ ${formatSelectedRange()}`
                : `✓ ${formatSelectedRange()}`
              }
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">כתובת איסוף <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
          <input type="text" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)}
            placeholder="לדוגמה: רחוב הרצל 12, תל אביב"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit"
          disabled={loading || slots.length === 0 || showNewStudent || !!missingNext}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50">
          {loading ? 'קובע שיעור...' : 'קבע שיעור'}
        </button>
      </form>
    </div>
  )
}
