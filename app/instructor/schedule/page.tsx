'use client'
import { useState, useEffect } from 'react'
import { format, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'

type Booking = {
  id: string
  pickupAddress?: string | null
  alternativeSlots?: string[] | null
  student: { name: string; email: string; phone?: string | null }
  availability: { startTime: string; endTime: string }
}

export default function SchedulePage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    fetch('/api/bookings')
      .then(r => r.json())
      .then((data: any[]) => {
        const approved = Array.isArray(data)
          ? data.filter(b => b.status === 'APPROVED')
          : []
        setBookings(approved)
        setLoading(false)
      })
  }, [])

  const now = new Date()

  // Only show days that have at least one lesson that hasn't ended yet
  const sorted = bookings
    .filter(b => new Date(b.availability.endTime) > now)
    .sort((a, b) => {
      const diff = new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
      return sortDir === 'asc' ? diff : -diff
    })

  // Group by day
  const days: { date: Date; lessons: Booking[] }[] = []
  for (const b of sorted) {
    const d = new Date(b.availability.startTime)
    const existing = days.find(g => isSameDay(g.date, d))
    if (existing) existing.lessons.push(b)
    else days.push({ date: d, lessons: [b] })
  }

  function whatsappLink(b: Booking) {
    const phone = b.student.phone?.replace(/\D/g, '').replace(/^0/, '972')
    if (!phone) return null
    const text = encodeURIComponent(
      `שלום ${b.student.name}, תזכורת: יש לך שיעור נהיגה ביום ${format(new Date(b.availability.startTime), "EEEE, d בMMMM", { locale: he })} בשעה ${format(new Date(b.availability.startTime), 'HH:mm')}. בהצלחה!`
    )
    return `https://wa.me/${phone}?text=${text}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">לו״ז שיעורים</h1>
        <div className="flex gap-1">
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
      ) : days.length === 0 ? (
        <p className="text-gray-500">אין שיעורים קבועים</p>
      ) : (
        <div className="space-y-6">
          {days.map(({ date, lessons }) => (
            <div key={date.toISOString()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-600 text-white rounded-xl px-4 py-2 text-center min-w-[72px]">
                  <div className="text-xs font-medium opacity-80">
                    {format(date, 'EEEE', { locale: he })}
                  </div>
                  <div className="text-xl font-bold leading-tight">{format(date, 'd')}</div>
                  <div className="text-xs opacity-80">{format(date, 'MMM yyyy', { locale: he })}</div>
                </div>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="space-y-3 mr-6">
                {lessons.map(b => {
                  const wa = whatsappLink(b)
                  return (
                    <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-start gap-4">
                      <div className="text-center shrink-0 w-16">
                        <div className="text-lg font-bold text-blue-700">
                          {format(new Date(b.availability.startTime), 'HH:mm')}
                        </div>
                        <div className="text-xs text-gray-400">
                          {format(new Date(b.availability.endTime), 'HH:mm')}
                        </div>
                      </div>

                      <div className="w-px self-stretch bg-blue-100 shrink-0" />

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-base">{b.student.name}</p>
                        {b.student.phone ? (
                          <a href={`tel:${b.student.phone}`}
                            className="text-sm text-blue-600 hover:underline block">
                            📞 {b.student.phone}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">אין מספר טלפון</p>
                        )}
                        {b.pickupAddress ? (
                          <p className="text-sm text-gray-600 mt-1">📍 {b.pickupAddress}</p>
                        ) : (
                          <p className="text-sm text-gray-400 mt-1">כתובת איסוף לא צוינה</p>
                        )}
                        {Array.isArray(b.alternativeSlots) && b.alternativeSlots.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-orange-100">
                            <p className="text-xs font-semibold text-orange-600 mb-1">🔄 מועדים חלופיים:</p>
                            {b.alternativeSlots.map((alt, i) => {
                              try {
                                const d = new Date(alt)
                                return (
                                  <p key={i} className="text-xs text-orange-700">
                                    {i + 1}. {format(d, "EEEE d/M", { locale: he })} בשעה {format(d, 'HH:mm')}
                                  </p>
                                )
                              } catch { return null }
                            })}
                          </div>
                        )}
                      </div>

                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer"
                          className="shrink-0 bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-2 rounded-lg transition whitespace-nowrap">
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
