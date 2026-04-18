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

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-800', COMPLETED: 'bg-blue-100 text-blue-800',
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
    setBookings(data)
  }

  useEffect(() => { fetchBookings() }, [])

  async function cancelBooking(id: string) {
    setCancelling(id)
    setError(prev => ({ ...prev, [id]: '' }))
    const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setError(prev => ({ ...prev, [id]: data.error || t('cancelError') }))
    } else {
      fetchBookings()
    }
    setCancelling(null)
  }

  const upcoming = bookings.filter(b =>
    ['PENDING', 'APPROVED'].includes(b.status) &&
    new Date(b.availability.startTime) >= new Date()
  )
  const past = bookings.filter(b =>
    !['PENDING', 'APPROVED'].includes(b.status) ||
    new Date(b.availability.startTime) < new Date()
  )

  function canCancel(b: Booking) {
    const hoursUntil = (new Date(b.availability.startTime).getTime() - Date.now()) / (1000 * 60 * 60)
    return hoursUntil >= 24
  }

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
            {upcoming.map(b => (
              <div key={b.id} className="bg-white rounded-xl shadow p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-lg">
                      {format(new Date(b.availability.startTime), t('dateFormat'), { locale })}
                    </p>
                    <p className="text-gray-600">
                      {format(new Date(b.availability.startTime), 'HH:mm')} - {format(new Date(b.availability.endTime), 'HH:mm')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status]}
                    </span>
                    {canCancel(b) ? (
                      <button
                        onClick={() => cancelBooking(b.id)}
                        disabled={cancelling === b.id}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline disabled:opacity-50 transition">
                        {cancelling === b.id ? t('cancelling') : t('cancelLesson')}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">{t('cannotCancel')}<br/>{t('lessThan24')}</span>
                    )}
                  </div>
                </div>
                {error[b.id] && (
                  <p className="text-red-500 text-sm mt-2">{error[b.id]}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800">{t('lessonHistory')}</h2>
          <div className="space-y-2">
            {past.map(b => (
              <div key={b.id} className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {format(new Date(b.availability.startTime), t('dateFormatShort'), { locale })}
                    {' | '}
                    {format(new Date(b.availability.startTime), 'HH:mm')} - {format(new Date(b.availability.endTime), 'HH:mm')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>
                  {STATUS_LABELS[b.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
