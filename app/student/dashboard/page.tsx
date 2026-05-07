'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { he, ru } from 'date-fns/locale'
import { useLanguage } from '@/contexts/LanguageContext'

type Booking = {
  id: string
  status: string
  availability: { startTime: string; endTime: string }
}

type Lesson = {
  ids: string[]
  status: string
  startTime: string
  endTime: string
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-800', COMPLETED: 'bg-blue-100 text-blue-800',
}

const roundMin = (d: string) => Math.round(new Date(d).getTime() / 60000) * 60000

function groupToLessons(bookings: Booking[]): Lesson[] {
  const sorted = [...bookings].sort((a, b) =>
    new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
  )
  const lessons: Lesson[] = []
  for (const b of sorted) {
    const last = lessons[lessons.length - 1]
    if (last && last.status === b.status &&
        roundMin(last.endTime) === roundMin(b.availability.startTime)) {
      last.ids.push(b.id)
      last.endTime = b.availability.endTime
    } else {
      lessons.push({ ids: [b.id], status: b.status, startTime: b.availability.startTime, endTime: b.availability.endTime })
    }
  }
  return lessons
}

export default function StudentDashboard() {
  const { data: session } = useSession()
  const studentName = (session?.user as any)?.name || ''
  const [bookings, setBookings] = useState<Booking[]>([])
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError] = useState<Record<string, string>>({})
  const { t, lang } = useLanguage()
  const locale = lang === 'ru' ? ru : he

  const STATUS_LABELS: Record<string, string> = {
    PENDING: t('statusPending'), APPROVED: t('statusApproved'),
    REJECTED: t('statusRejected'), CANCELLED: t('statusCancelled'), COMPLETED: t('statusCompleted'),
  }

  async function fetchBookings() {
    const res = await fetch('/api/bookings')
    const data = await res.json()
    setBookings(Array.isArray(data) ? data : [])
  }

  useEffect(() => { fetchBookings() }, [])

  // Cancel the first booking — the DELETE handler cascades to all siblings
  async function cancelLesson(lesson: Lesson) {
    const key = lesson.ids[0]
    setCancelling(key)
    setError(prev => ({ ...prev, [key]: '' }))
    const res = await fetch(`/api/bookings/${key}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setError(prev => ({ ...prev, [key]: data.error || t('cancelError') }))
    } else {
      fetchBookings()
    }
    setCancelling(null)
  }

  function canCancel(lesson: Lesson) {
    const hoursUntil = (new Date(lesson.startTime).getTime() - Date.now()) / (1000 * 60 * 60)
    return hoursUntil >= 24
  }

  function durationLabel(startTime: string, endTime: string): string {
    const mins = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
    if (mins <= 40) return ''
    if (mins <= 60) return lang === 'ru' ? ' (60 мин)' : ' (שעה)'
    return lang === 'ru' ? ' (80 мин)' : ' (80 דק׳)'
  }

  const allLessons = groupToLessons(bookings)
  const upcoming = allLessons.filter(l =>
    ['PENDING', 'APPROVED'].includes(l.status) && new Date(l.startTime) >= new Date()
  )
  const past = allLessons.filter(l =>
    !['PENDING', 'APPROVED'].includes(l.status) || new Date(l.startTime) < new Date()
  ).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">{t('myLessons')}</h1>
      {studentName && <p className="text-gray-500 mb-8">{t('hello')}, {studentName}</p>}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">{t('upcomingLessons')}</h2>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">
            {t('noLessons')}{' '}
            <a href="/student/book" className="text-blue-600 hover:underline">{t('bookNow')}</a>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(lesson => {
              const key = lesson.ids[0]
              return (
                <div key={key} className="bg-white rounded-xl shadow p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-lg">
                        {format(new Date(lesson.startTime), t('dateFormat'), { locale })}
                      </p>
                      <p className="text-gray-600">
                        {format(new Date(lesson.startTime), 'HH:mm')} – {format(new Date(lesson.endTime), 'HH:mm')}
                        <span className="text-blue-600 font-medium">{durationLabel(lesson.startTime, lesson.endTime)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[lesson.status]}`}>
                        {STATUS_LABELS[lesson.status]}
                      </span>
                      {canCancel(lesson) ? (
                        <button onClick={() => cancelLesson(lesson)} disabled={cancelling === key}
                          className="text-xs text-red-400 hover:text-red-600 hover:underline disabled:opacity-50 transition">
                          {cancelling === key ? t('cancelling') : t('cancelLesson')}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">{t('cannotCancel')}<br/>{t('lessThan24')}</span>
                      )}
                    </div>
                  </div>
                  {error[key] && <p className="text-red-500 text-sm mt-2">{error[key]}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800">{t('lessonHistory')}</h2>
          <div className="space-y-2">
            {past.map(lesson => (
              <div key={lesson.ids[0]} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {format(new Date(lesson.startTime), t('dateFormatShort'), { locale })}
                    {' | '}
                    {format(new Date(lesson.startTime), 'HH:mm')} – {format(new Date(lesson.endTime), 'HH:mm')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[lesson.status]}`}>
                  {STATUS_LABELS[lesson.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
