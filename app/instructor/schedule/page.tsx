'use client'
import { useState, useEffect, useRef } from 'react'
import { format, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'

type Booking = {
  id: string
  studentId: string
  pickupAddress?: string | null
  notes?: string | null
  alternativeSlots?: string[] | null
  student: { name: string; email: string; phone?: string | null }
  availability: { startTime: string; endTime: string }
}

type Lesson = {
  ids: string[]
  student: Booking['student']
  startTime: string
  endTime: string
  pickupAddress?: string | null
  notes?: string | null
  alternativeSlots?: string[] | null
}

type Day = { date: Date; lessons: Lesson[] }

function groupIntoLessons(bookings: Booking[]): Lesson[] {
  const sorted = [...bookings].sort((a, b) =>
    new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
  )
  const lessons: Lesson[] = []
  for (const b of sorted) {
    const last = lessons[lessons.length - 1]
    if (
      last &&
      last.student.email === b.student.email &&
      (last.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      (last.notes ?? null) === (b.notes ?? null) &&
      new Date(last.endTime).getTime() === new Date(b.availability.startTime).getTime()
    ) {
      last.ids.push(b.id)
      last.endTime = b.availability.endTime
    } else {
      lessons.push({
        ids: [b.id],
        student: b.student,
        startTime: b.availability.startTime,
        endTime: b.availability.endTime,
        pickupAddress: b.pickupAddress,
        notes: b.notes,
        alternativeSlots: b.alternativeSlots,
      })
    }
  }
  return lessons
}

export default function SchedulePage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({})

  async function fetchBookings() {
    const res = await fetch('/api/bookings')
    const data = await res.json()
    const approved = Array.isArray(data) ? data.filter((b: any) => b.status === 'APPROVED') : []
    setBookings(approved)
    setLoading(false)
  }

  async function cancelBooking(ids: string[]) {
    if (!confirm('לבטל את השיעור הזה? התלמיד יקבל הודעה במייל.')) return
    setCancelling(ids[0])
    await fetch('/api/bookings/group/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: 'CANCELLED' }),
    })
    setCancelling(null)
    fetchBookings()
  }

  useEffect(() => { fetchBookings() }, [])

  const now = new Date()

  const lessons = groupIntoLessons(
    bookings.filter(b => new Date(b.availability.endTime) > now)
  ).sort((a, b) => {
    const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    return sortDir === 'asc' ? diff : -diff
  })

  // Group lessons by day
  const days: Day[] = []
  for (const lesson of lessons) {
    const d = new Date(lesson.startTime)
    const existing = days.find(g => isSameDay(g.date, d))
    if (existing) existing.lessons.push(lesson)
    else days.push({ date: d, lessons: [lesson] })
  }

  function dayKey(date: Date) {
    return format(date, 'yyyy-MM-dd')
  }

  function scrollToDay(key: string) {
    setActiveDay(key)
    dayRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function whatsappLink(lesson: Lesson) {
    const phone = lesson.student.phone?.replace(/\D/g, '').replace(/^0/, '972')
    if (!phone) return null
    const text = encodeURIComponent(
      `שלום ${lesson.student.name}, תזכורת: יש לך שיעור נהיגה ביום ${format(new Date(lesson.startTime), "EEEE, d בMMMM", { locale: he })} בשעה ${format(new Date(lesson.startTime), 'HH:mm')}. בהצלחה!`
    )
    return `https://wa.me/${phone}?text=${text}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
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

      {/* Day selector — sticky */}
      {!loading && days.length > 0 && (
        <div className="sticky top-0 z-10 bg-gray-50 pb-3 pt-1 -mx-4 px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {days.map(({ date }) => {
              const key = dayKey(date)
              const isActive = activeDay === key
              const isToday = isSameDay(date, now)
              return (
                <button key={key} onClick={() => scrollToDay(key)}
                  className={`flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-xl text-sm font-medium transition border ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : isToday
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}>
                  <span className="text-xs opacity-75">{format(date, 'EEE', { locale: he }).replace('יום ', '')}</span>
                  <span className="font-bold">{format(date, 'd')}</span>
                  <span className="text-xs opacity-75">{format(date, 'MMM', { locale: he })}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">טוען...</p>
      ) : days.length === 0 ? (
        <p className="text-gray-500">אין שיעורים קבועים</p>
      ) : (
        <div className="space-y-6">
          {days.map(({ date, lessons: dayLessons }) => {
            const key = dayKey(date)
            return (
              <div key={key} ref={el => { dayRefs.current[key] = el }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-blue-600 text-white rounded-xl px-4 py-2 text-center min-w-[72px]">
                    <div className="text-xs font-medium opacity-80">{format(date, 'EEEE', { locale: he })}</div>
                    <div className="text-xl font-bold leading-tight">{format(date, 'd')}</div>
                    <div className="text-xs opacity-80">{format(date, 'MMM yyyy', { locale: he })}</div>
                  </div>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                <div className="space-y-3 mr-6">
                  {dayLessons.map(lesson => {
                    const wa = whatsappLink(lesson)
                    return (
                      <div key={lesson.ids[0]} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-start gap-4">
                        <div className="text-center shrink-0 w-16">
                          <div className="text-lg font-bold text-blue-700">
                            {format(new Date(lesson.startTime), 'HH:mm')}
                          </div>
                          <div className="text-xs text-gray-400">
                            {format(new Date(lesson.endTime), 'HH:mm')}
                          </div>
                        </div>

                        <div className="w-px self-stretch bg-blue-100 shrink-0" />

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-base">{lesson.student.name}</p>
                          {lesson.student.phone ? (
                            <a href={`tel:${lesson.student.phone}`}
                              className="text-sm text-blue-600 hover:underline block">
                              📞 {lesson.student.phone}
                            </a>
                          ) : (
                            <p className="text-sm text-gray-400">אין מספר טלפון</p>
                          )}
                          {lesson.pickupAddress ? (
                            <p className="text-sm text-gray-600 mt-1">📍 {lesson.pickupAddress}</p>
                          ) : (
                            <p className="text-sm text-gray-400 mt-1">כתובת איסוף לא צוינה</p>
                          )}
                          {Array.isArray(lesson.alternativeSlots) && lesson.alternativeSlots.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-orange-100">
                              <p className="text-xs font-semibold text-orange-600 mb-1">🔄 מועדים חלופיים:</p>
                              {lesson.alternativeSlots.map((alt, i) => {
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

                        <div className="flex flex-col gap-2 shrink-0">
                          {wa && (
                            <a href={wa} target="_blank" rel="noreferrer"
                              className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-2 rounded-lg transition whitespace-nowrap text-center">
                              WhatsApp
                            </a>
                          )}
                          <button
                            onClick={() => cancelBooking(lesson.ids)}
                            disabled={cancelling === lesson.ids[0]}
                            className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-2 rounded-lg transition whitespace-nowrap disabled:opacity-50">
                            {cancelling === lesson.ids[0] ? 'מבטל...' : 'בטל שיעור'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
