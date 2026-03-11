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
  student: { name: string; email: string; phone?: string | null }
  availability: { startTime: string; endTime: string }
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין', APPROVED: 'מאושר', REJECTED: 'נדחה', CANCELLED: 'בוטל', COMPLETED: 'הושלם',
}
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-800', COMPLETED: 'bg-blue-100 text-blue-800',
}

function formatAlt(iso: string) {
  try {
    return format(new Date(iso), "EEEE, d/M בשעה HH:mm", { locale: he })
  } catch { return iso }
}

function BookingCard({
  b,
  rescheduling,
  onReschedule,
  onStatus,
}: {
  b: Booking
  rescheduling: string | null
  onReschedule: (bookingId: string, alt: string) => void
  onStatus: (id: string, status: string) => void
}) {
  const hasAlts = Array.isArray(b.alternativeSlots) && b.alternativeSlots.length > 0

  return (
    <div className={`bg-white rounded-xl shadow p-5 ${hasAlts ? 'border-r-4 border-orange-400' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-semibold text-lg">{b.student.name}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>
              {STATUS_LABELS[b.status]}
            </span>
            {hasAlts && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-800">
                🔄 יש מועדים חלופיים
              </span>
            )}
          </div>

          <p className="text-gray-500 text-sm mb-2">
            {b.student.email}{b.student.phone ? ` | ${b.student.phone}` : ''}
          </p>

          {/* Current slot */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 mb-2 inline-block">
            <p className="text-xs text-gray-500 mb-0.5">מועד נוכחי</p>
            <p className="text-gray-800 font-medium text-sm">
              {format(new Date(b.availability.startTime), "EEEE, d בMMMM", { locale: he })}
              {' | '}
              {format(new Date(b.availability.startTime), 'HH:mm')}–{format(new Date(b.availability.endTime), 'HH:mm')}
            </p>
          </div>

          {b.pickupAddress && (
            <p className="text-sm text-gray-600 mb-1">📍 {b.pickupAddress}</p>
          )}
          {b.notes && (
            <p className="text-sm text-gray-500 mb-1">💬 {b.notes}</p>
          )}

          {/* Alternative slots — prominent cards */}
          {hasAlts && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">מועדים חלופיים שהתלמיד הציע</p>
              <div className="flex flex-col gap-2">
                {(b.alternativeSlots as string[]).map((alt, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-xs text-orange-500 font-medium">אפשרות {i + 1}</span>
                      <p className="text-sm font-semibold text-gray-800">{formatAlt(alt)}</p>
                    </div>
                    <button
                      onClick={() => onReschedule(b.id, alt)}
                      disabled={rescheduling === b.id + alt}
                      className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap font-medium">
                      {rescheduling === b.id + alt ? 'מעביר...' : 'הזז לשעה זו'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {b.status === 'PENDING' && (
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={() => onStatus(b.id, 'APPROVED')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm transition">
              אשר
            </button>
            <button onClick={() => onStatus(b.id, 'REJECTED')}
              className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm transition">
              דחה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [rescheduling, setRescheduling] = useState<string | null>(null)

  async function fetchBookings() {
    const res = await fetch('/api/bookings')
    const data = await res.json()
    setBookings(data)
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [])

  async function reschedule(bookingId: string, alternativeDateTime: string) {
    setRescheduling(bookingId + alternativeDateTime)
    await fetch(`/api/bookings/${bookingId}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alternativeDateTime }),
    })
    setRescheduling(null)
    fetchBookings()
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/bookings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchBookings()
  }

  const withAlts = bookings.filter(b =>
    Array.isArray(b.alternativeSlots) && b.alternativeSlots.length > 0
  )

  const filtered = filter === 'ALL' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">הזמנות</h1>

      {/* Reschedule requests banner */}
      {withAlts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <p className="font-semibold text-orange-800 mb-3">
            🔄 {withAlts.length} הזמנות עם בקשת החלפת מועד
          </p>
          <div className="flex flex-col gap-3">
            {withAlts.map(b => (
              <div key={b.id} className="bg-white rounded-lg border border-orange-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-gray-900">{b.student.name}</span>
                  <span className="text-gray-400 text-sm">
                    מועד נוכחי: {format(new Date(b.availability.startTime), "d/M בשעה HH:mm", { locale: he })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(b.alternativeSlots as string[]).map((alt, i) => (
                    <button
                      key={i}
                      onClick={() => reschedule(b.id, alt)}
                      disabled={rescheduling === b.id + alt}
                      className="flex items-center gap-2 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                      <span className="opacity-70 text-xs">אפשרות {i + 1}:</span>
                      <span className="font-medium">{formatAlt(alt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm transition ${filter === s ? 'bg-blue-600 text-white' : 'bg-white border hover:bg-gray-50'}`}>
            {s === 'ALL' ? 'הכל' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">אין הזמנות</p>
      ) : (
        <div className="space-y-4">
          {filtered.map(b => (
            <BookingCard
              key={b.id}
              b={b}
              rescheduling={rescheduling}
              onReschedule={reschedule}
              onStatus={updateStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}
