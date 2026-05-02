'use client'
import { useState, useEffect, useRef } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { he } from 'date-fns/locale'

const HOUR_HEIGHT = 64  // px per hour
const START_HOUR = 7
const END_HOUR = 22
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT

type Lesson = {
  key: string
  studentName: string
  phone: string | null
  startTime: Date
  endTime: Date
  pickupAddress: string | null
}

type Booking = {
  id: string
  status: string
  studentId: string
  pickupAddress?: string | null
  notes?: string | null
  student: { name: string; phone?: string | null }
  availability: { startTime: string; endTime: string }
}

function groupToLessons(bookings: Booking[]): Lesson[] {
  const approved = bookings
    .filter(b => b.status === 'APPROVED')
    .sort((a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime())

  const lessons: Lesson[] = []
  for (const b of approved) {
    const last = lessons[lessons.length - 1]
    if (
      last &&
      last.studentName === b.student.name &&
      (last.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      last.endTime.getTime() === new Date(b.availability.startTime).getTime()
    ) {
      last.endTime = new Date(b.availability.endTime)
    } else {
      lessons.push({
        key: b.id,
        studentName: b.student.name,
        phone: b.student.phone ?? null,
        startTime: new Date(b.availability.startTime),
        endTime: new Date(b.availability.endTime),
        pickupAddress: b.pickupAddress ?? null,
      })
    }
  }
  return lessons
}

function getTop(time: Date): number {
  const h = time.getHours(); const m = time.getMinutes()
  return Math.max(0, ((h - START_HOUR) * 60 + m) / 60 * HOUR_HEIGHT)
}

function getHeight(start: Date, end: Date): number {
  return Math.max(20, (end.getTime() - start.getTime()) / 1000 / 60 / 60 * HOUR_HEIGHT)
}

const COLORS = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-teal-500',
  'bg-sky-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-purple-500',
]
const colorMap = new Map<string, string>()
let colorIdx = 0
function lessonColor(name: string) {
  if (!colorMap.has(name)) { colorMap.set(name, COLORS[colorIdx % COLORS.length]); colorIdx++ }
  return colorMap.get(name)!
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [tooltip, setTooltip] = useState<Lesson | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/bookings').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLessons(groupToLessons(data))
    })
  }, [])

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [])

  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const now = new Date()
  const isCurrentWeek = days.some(d => isSameDay(d, now))

  const nowTop = isCurrentWeek ? getTop(now) : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">קלנדר</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg border text-gray-600">→</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700">היום</button>
          <button onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg border text-gray-600">←</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {/* Day headers */}
        <div className="flex border-b sticky top-0 bg-white z-20">
          <div className="w-12 shrink-0 border-l" />
          {days.map(day => {
            const isToday = isSameDay(day, now)
            return (
              <div key={day.toISOString()} className="flex-1 text-center py-2 border-l last:border-l-0 min-w-0">
                <div className="text-xs text-gray-500">{format(day, 'EEE', { locale: he })}</div>
                <div className={`text-base font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-gray-800'}`}>
                  {format(day, 'd')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Scrollable time grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: '75vh' }}>
          <div className="flex relative" style={{ height: `${TOTAL_HEIGHT}px` }}>

            {/* Hour labels */}
            <div className="w-12 shrink-0 border-l relative">
              {hours.map(h => (
                <div key={h} style={{ position: 'absolute', top: `${(h - START_HOUR) * HOUR_HEIGHT - 9}px`, right: 0, left: 0 }}
                  className="text-right pr-1">
                  <span className="text-xs text-gray-400">{h}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dayLessons = lessons.filter(l => isSameDay(l.startTime, day))
              return (
                <div key={day.toISOString()} className="flex-1 relative border-l last:border-l-0 min-w-0">
                  {/* Hour grid lines */}
                  {hours.map(h => (
                    <div key={h} style={{ position: 'absolute', top: `${(h - START_HOUR) * HOUR_HEIGHT}px`, left: 0, right: 0 }}
                      className={`border-t ${h % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`} />
                  ))}

                  {/* "Now" line */}
                  {nowTop !== null && isSameDay(day, now) && (
                    <div style={{ position: 'absolute', top: `${nowTop}px`, left: 0, right: 0, zIndex: 10 }}
                      className="border-t-2 border-red-500">
                      <div className="w-2 h-2 bg-red-500 rounded-full -mt-1 -mr-0.5 absolute right-0" />
                    </div>
                  )}

                  {/* Lessons */}
                  {dayLessons.map(lesson => {
                    const top = getTop(lesson.startTime)
                    const height = getHeight(lesson.startTime, lesson.endTime)
                    const color = lessonColor(lesson.studentName)
                    return (
                      <div key={lesson.key}
                        style={{ position: 'absolute', top: `${top}px`, height: `${height}px`, left: '2px', right: '2px', zIndex: 5 }}
                        onClick={() => setTooltip(tooltip?.key === lesson.key ? null : lesson)}
                        className={`${color} text-white rounded-lg px-1.5 py-1 cursor-pointer overflow-hidden select-none hover:opacity-90 transition`}>
                        <p className="text-xs font-semibold leading-tight truncate">{lesson.studentName}</p>
                        {height >= 36 && (
                          <p className="text-xs opacity-90 leading-tight">
                            {format(lesson.startTime, 'HH:mm')}–{format(lesson.endTime, 'HH:mm')}
                          </p>
                        )}
                        {height >= 56 && lesson.pickupAddress && (
                          <p className="text-xs opacity-80 leading-tight truncate">📍 {lesson.pickupAddress}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lesson tooltip/popup */}
      {tooltip && (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setTooltip(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className={`w-3 h-3 rounded-full ${lessonColor(tooltip.studentName)} inline-block ml-2`} />
            <span className="font-bold text-lg">{tooltip.studentName}</span>
            <p className="text-gray-500 text-sm mt-1">
              {format(tooltip.startTime, "EEEE, d בMMMM yyyy", { locale: he })}
            </p>
            <p className="text-gray-700 font-medium mt-1">
              🕐 {format(tooltip.startTime, 'HH:mm')}–{format(tooltip.endTime, 'HH:mm')}
            </p>
            {tooltip.phone && (
              <a href={`tel:${tooltip.phone}`} className="block text-blue-600 text-sm mt-1 hover:underline">
                📞 {tooltip.phone}
              </a>
            )}
            {tooltip.pickupAddress && (
              <p className="text-gray-600 text-sm mt-1">📍 {tooltip.pickupAddress}</p>
            )}
            <button onClick={() => setTooltip(null)} className="mt-4 w-full border py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">סגור</button>
          </div>
        </div>
      )}
    </div>
  )
}
