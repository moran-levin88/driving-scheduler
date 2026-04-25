'use client'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

type Booking = {
  id: string
  status: string
  createdAt: string
  notes?: string | null
  pickupAddress?: string | null
  alternativeSlots?: string[] | null
  calendarEventId?: string | null
  student: { name: string; email: string; phone?: string | null }
  availability: { startTime: string; endTime: string }
}

// A lesson group = one or more consecutive bookings from the same student
type LessonGroup = {
  ids: string[]
  firstId: string
  status: string
  student: { name: string; email: string; phone?: string | null }
  startTime: string
  endTime: string
  pickupAddress?: string | null
  notes?: string | null
  alternativeSlots?: string[] | null
  createdAt: string
}

function groupBookings(bookings: Booking[]): LessonGroup[] {
  const sorted = [...bookings].sort((a, b) =>
    new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
  )
  const groups: LessonGroup[] = []
  for (const b of sorted) {
    const last = groups[groups.length - 1]
    if (
      last &&
      last.status === b.status &&
      last.student.email === b.student.email &&
      (last.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      (last.notes ?? null) === (b.notes ?? null) &&
      new Date(last.endTime).getTime() === new Date(b.availability.startTime).getTime()
    ) {
      last.ids.push(b.id)
      last.endTime = b.availability.endTime
    } else {
      groups.push({
        ids: [b.id],
        firstId: b.id,
        status: b.status,
        student: b.student,
        startTime: b.availability.startTime,
        endTime: b.availability.endTime,
        pickupAddress: b.pickupAddress ?? null,
        notes: b.notes ?? null,
        alternativeSlots: b.alternativeSlots,
        createdAt: b.createdAt,
      })
    }
  }
  return groups
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין', APPROVED: 'מאושר', REJECTED: 'נדחה', CANCELLED: 'בוטל', COMPLETED: 'הושלם',
}
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-800', COMPLETED: 'bg-blue-100 text-blue-800',
}

function formatAlt(iso: string) {
  try { return format(new Date(iso), "EEEE, d/M בשעה HH:mm", { locale: he }) }
  catch { return iso }
}

function durationLabel(startTime: string, endTime: string): string {
  const mins = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
  if (mins <= 20) return ''
  if (mins <= 40) return '40 דק׳'
  if (mins <= 60) return 'שעה'
  if (mins <= 80) return '80 דק׳'
  return `${mins} דק׳`
}

function LessonGroupCard({
  g,
  rescheduling,
  rescheduleErrors,
  onReschedule,
  onGroupStatus,
  onRemind,
}: {
  g: LessonGroup
  rescheduling: string | null
  rescheduleErrors: Record<string, string>
  onReschedule: (bookingId: string, alt: string) => void
  onGroupStatus: (ids: string[], status: string) => void
  onRemind: (id: string) => void
}) {
  const hasAlts = Array.isArray(g.alternativeSlots) && g.alternativeSlots.length > 0
  const dur = durationLabel(g.startTime, g.endTime)

  return (
    <div className={`bg-white rounded-xl shadow p-5 ${hasAlts ? 'border-r-4 border-orange-400' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="font-semibold text-lg">{g.student.name}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[g.status]}`}>
              {STATUS_LABELS[g.status]}
            </span>
            {hasAlts && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-800">
                🔄 יש מועדים חלופיים
              </span>
            )}
          </div>

          <p className="text-gray-500 text-sm mb-2">
            {g.student.email}{g.student.phone ? ` | ${g.student.phone}` : ''}
          </p>

          <div className="bg-gray-50 rounded-lg px-3 py-2 mb-2 inline-block">
            <p className="text-xs text-gray-500 mb-0.5">מועד השיעור</p>
            <p className="text-gray-800 font-medium text-sm">
              {format(new Date(g.startTime), "EEEE, d בMMMM", { locale: he })}
              {' | '}
              {format(new Date(g.startTime), 'HH:mm')}–{format(new Date(g.endTime), 'HH:mm')}
              {dur && <span className="text-gray-400 font-normal mr-1 text-xs">({dur})</span>}
            </p>
          </div>

          {g.pickupAddress && (
            <p className="text-sm text-gray-600 mb-1">📍 {g.pickupAddress}</p>
          )}
          {g.notes && (
            <p className="text-sm text-gray-500 mb-1">💬 {g.notes}</p>
          )}

          {hasAlts && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">מועדים חלופיים שהתלמיד הציע</p>
              <div className="flex flex-col gap-2">
                {(g.alternativeSlots as string[]).map((alt, i) => {
                  const errKey = g.firstId + alt
                  const err = rescheduleErrors[errKey]
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        <div>
                          <span className="text-xs text-orange-500 font-medium">אפשרות {i + 1}</span>
                          <p className="text-sm font-semibold text-gray-800">{formatAlt(alt)}</p>
                        </div>
                        <button
                          onClick={() => onReschedule(g.firstId, alt)}
                          disabled={rescheduling === errKey}
                          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap font-medium">
                          {rescheduling === errKey ? 'מעביר...' : 'הזז לשעה זו'}
                        </button>
                      </div>
                      {err && <p className="text-xs text-red-600 px-1">⚠️ {err}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {g.status === 'PENDING' && (<>
            <button onClick={() => onGroupStatus(g.ids, 'APPROVED')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm transition">
              אשר
            </button>
            <button onClick={() => onGroupStatus(g.ids, 'REJECTED')}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm transition">
              דחה
            </button>
          </>)}
          {g.status === 'APPROVED' && g.student.phone && (
            <button onClick={() => onRemind(g.firstId)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm transition">
              📲 שלח תזכורת WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState('PENDING')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [searchStudent, setSearchStudent] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const [rescheduleErrors, setRescheduleErrors] = useState<Record<string, string>>({})

  async function fetchBookings() {
    const res = await fetch('/api/bookings')
    const data = await res.json()
    setBookings(data)
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [])

  async function reschedule(bookingId: string, alternativeDateTime: string) {
    const key = bookingId + alternativeDateTime
    setRescheduling(key)
    setRescheduleErrors(prev => { const n = { ...prev }; delete n[key]; return n })
    const utcDateTime = new Date(alternativeDateTime).toISOString()
    const res = await fetch(`/api/bookings/${bookingId}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alternativeDateTime: utcDateTime }),
    })
    setRescheduling(null)
    if (!res.ok) {
      const data = await res.json()
      setRescheduleErrors(prev => ({ ...prev, [key]: data.error || 'שגיאה בהזזת השיעור' }))
    } else {
      fetchBookings()
    }
  }

  async function updateGroupStatus(ids: string[], status: string) {
    await fetch('/api/bookings/group/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status }),
    })
    fetchBookings()
  }

  async function sendReminder(id: string) {
    try {
      const res = await fetch(`/api/bookings/${id}/remind`, { method: 'POST' })
      if (res.ok) {
        alert('התזכורת נשלחה בהצלחה! ✅')
      } else {
        const data = await res.json().catch(() => ({}))
        alert('שגיאה: ' + (data.error || `סטטוס ${res.status}`))
      }
    } catch (err) {
      alert('שגיאת רשת: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const allGroups = groupBookings(bookings)

  const filtered = allGroups
    .filter(g => filter === 'ALL' || g.status === filter)
    .filter(g => !searchStudent || g.student.name.includes(searchStudent) || g.student.phone?.includes(searchStudent))
    .filter(g => !searchDate || new Date(g.startTime).toLocaleDateString('en-CA') === searchDate)
    .slice()
    .sort((a, b) => {
      const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">הזמנות</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="חיפוש לפי שם תלמיד או טלפון..."
          value={searchStudent}
          onChange={e => setSearchStudent(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 w-64"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={searchDate}
            onChange={e => setSearchDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
          {searchDate && (
            <button onClick={() => setSearchDate('')}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm transition ${filter === s ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
            {s === 'ALL' ? 'הכל' : STATUS_LABELS[s]}
          </button>
        ))}
        <div className="mr-auto flex gap-1">
          <button onClick={() => setSortDir('asc')}
            className={`px-3 py-2 rounded-lg text-sm border transition ${sortDir === 'asc' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
            תאריך ▲
          </button>
          <button onClick={() => setSortDir('desc')}
            className={`px-3 py-2 rounded-lg text-sm border transition ${sortDir === 'desc' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>
            תאריך ▼
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">אין הזמנות</p>
      ) : (
        <div className="space-y-4">
          {filtered.map(g => (
            <LessonGroupCard
              key={g.firstId}
              g={g}
              rescheduling={rescheduling}
              rescheduleErrors={rescheduleErrors}
              onReschedule={reschedule}
              onGroupStatus={updateGroupStatus}
              onRemind={sendReminder}
            />
          ))}
        </div>
      )}
    </div>
  )
}
