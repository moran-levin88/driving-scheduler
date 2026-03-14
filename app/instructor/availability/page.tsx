'use client'
import { useState, useEffect } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'

type Slot = {
  id: string
  startTime: string
  endTime: string
  isBooked: boolean
  isBlocked: boolean
  blockNote?: string | null
  booking?: { student: { name: string }; status: string } | null
}

function minuteDiff(startTime: string, endTime: string) {
  return (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
}

export default function AvailabilityPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<'lesson' | 'block'>('lesson')
  const [form, setForm] = useState({ date: '', startTime: '09:00', endTime: '17:00', blockNote: '' })
  const [error, setError] = useState('')

  async function fetchSlots() {
    const res = await fetch('/api/availability')
    const data = await res.json()
    setSlots(data)
  }

  useEffect(() => { fetchSlots() }, [])

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))

  function calcLessons() {
    if (!form.startTime || !form.endTime) return 0
    const [sh, sm] = form.startTime.split(':').map(Number)
    const [eh, em] = form.endTime.split(':').map(Number)
    const diff = (eh * 60 + em) - (sh * 60 + sm)
    return diff > 0 ? Math.floor(diff / 40) : 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const startTime = new Date(`${form.date}T${form.startTime}:00`)
    const endTime = new Date(`${form.date}T${form.endTime}:00`)

    if (endTime <= startTime) { setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return }

    const res = await fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        isBlocked: mode === 'block',
        blockNote: form.blockNote || null,
      }),
    })

    let data: any = {}
    try {
      const text = await res.text()
      if (text) data = JSON.parse(text)
    } catch {}

    if (res.ok) {
      setCreating(false)
      setForm({ date: '', startTime: '09:00', endTime: '17:00', blockNote: '' })
      fetchSlots()
      if (mode === 'lesson' && data.created > 1) {
        alert(`נוצרו ${data.created} שיעורים של 40 דקות`)
      }
    } else {
      setError(data.error || `שגיאה (${res.status})`)
    }
  }

  async function deleteSlot(id: string) {
    await fetch(`/api/availability/${id}`, { method: 'DELETE' })
    fetchSlots()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">ניהול זמינות</h1>
        <button onClick={() => { setCreating(true); setMode('lesson') }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          + הוסף
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 inline-block"></span> פנוי</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 inline-block"></span> מוזמן</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span> חסום (טסט)</span>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-2 hover:bg-gray-100 rounded">&rarr;</button>
        <span className="font-medium">
          {format(weekStart, 'd MMM', { locale: he })} - {format(addDays(weekStart, 5), 'd MMM yyyy', { locale: he })}
        </span>
        <button onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-2 hover:bg-gray-100 rounded">&larr;</button>
      </div>

      {/* Weekly grid */}
      <div className="grid grid-cols-6 gap-3">
        {days.map(day => {
          const allDaySlots = slots
            .filter(s => isSameDay(new Date(s.startTime), day))
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          const blocks = allDaySlots.filter(s => s.isBlocked)
          const daySlots = allDaySlots.filter(s => {
            if (s.isBlocked) return true
            const start = new Date(s.startTime).getTime()
            const end = new Date(s.endTime).getTime()
            return !blocks.some(b => start >= new Date(b.startTime).getTime() && end <= new Date(b.endTime).getTime())
          })
          const isPast = day < new Date(new Date().setHours(0, 0, 0, 0))

          return (
            <div key={day.toISOString()} className={`bg-white rounded-xl shadow p-3 ${isPast ? 'opacity-50' : ''}`}>
              <div className="text-center mb-3 pb-2 border-b">
                <div className="text-xs text-gray-500 font-medium">{format(day, 'EEEE', { locale: he })}</div>
                <div className="text-xl font-bold text-gray-800">{format(day, 'd')}</div>
                <div className="text-xs text-gray-400">{format(day, 'MMM', { locale: he })}</div>
              </div>
              <div className="space-y-1 min-h-[60px]">
                {daySlots.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-2">אין</p>
                ) : daySlots.map(slot => {
                  const isBlock = slot.isBlocked
                  return (
                    <div key={slot.id}
                      className={`text-xs p-1.5 rounded-lg ${isBlock ? 'bg-red-100 text-red-800' : slot.isBooked ? 'bg-orange-100 text-orange-800' : 'bg-blue-50 text-blue-800'}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">
                          {format(new Date(slot.startTime), 'HH:mm')}
                          {isBlock ? `-${format(new Date(slot.endTime), 'HH:mm')}` : ''}
                        </span>
                        {!slot.isBooked && (
                          <button onClick={() => deleteSlot(slot.id)}
                            className="text-red-400 hover:text-red-600 font-bold">&times;</button>
                        )}
                      </div>
                      {isBlock && (
                        <div className="text-red-600 font-medium truncate">{slot.blockNote || 'חסום'}</div>
                      )}
                      {slot.booking && slot.booking.status !== 'CANCELLED' && slot.booking.status !== 'REJECTED' && (
                        <div className="text-orange-600 font-medium truncate">{slot.booking.student.name}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md" dir="rtl">

            {/* Mode toggle */}
            <div className="flex rounded-lg border overflow-hidden mb-4">
              <button type="button"
                onClick={() => { setMode('lesson'); setError('') }}
                className={`flex-1 py-2 text-sm font-medium transition ${mode === 'lesson' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                שיעורי נהיגה
              </button>
              <button type="button"
                onClick={() => { setMode('block'); setError(''); setForm(f => ({ ...f, startTime: '17:00', endTime: '18:00' })) }}
                className={`flex-1 py-2 text-sm font-medium transition ${mode === 'block' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                חסימה (טסט / פגישה)
              </button>
            </div>

            <h2 className="text-lg font-bold mb-4">
              {mode === 'lesson' ? 'הוספת זמינות לשיעורים' : 'חסימת זמן'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">תאריך</label>
                <input type="date" value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })} required
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">משעה</label>
                  <input type="time" value={form.startTime}
                    onChange={e => setForm({ ...form, startTime: e.target.value })} required
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עד שעה</label>
                  <input type="time" value={form.endTime}
                    onChange={e => setForm({ ...form, endTime: e.target.value })} required
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {mode === 'lesson' && calcLessons() > 0 && (
                <p className="text-sm text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                  יווצרו {calcLessons()} שיעורים של 40 דקות
                </p>
              )}

              {mode === 'block' && (
                <div>
                  <label className="block text-sm font-medium mb-1">סיבה (אופציונלי)</label>
                  <input type="text" value={form.blockNote}
                    onChange={e => setForm({ ...form, blockNote: e.target.value })}
                    placeholder="לדוגמא: טסט עם תלמיד"
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500" />
                </div>
              )}

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button type="submit"
                  className={`flex-1 text-white py-2 rounded-lg transition ${mode === 'block' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {mode === 'lesson' ? 'הוסף שיעורים' : 'חסום זמן'}
                </button>
                <button type="button" onClick={() => { setCreating(false); setError('') }}
                  className="flex-1 border py-2 rounded-lg hover:bg-gray-50">
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
