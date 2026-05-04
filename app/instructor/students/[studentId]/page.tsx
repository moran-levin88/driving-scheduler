import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין', APPROVED: 'מאושר', REJECTED: 'נדחה', CANCELLED: 'בוטל', COMPLETED: 'הושלם',
}
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-800', COMPLETED: 'bg-blue-100 text-blue-800',
}

// Format date/time in Israel timezone (server runs in UTC)
function israelDate(date: Date) {
  const local = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  return format(local, "d בMMMM yyyy", { locale: he })
}
function israelTime(date: Date) {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  }).format(date)
}

export default async function StudentHistoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const student = await prisma.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    include: {
      bookings: {
        include: { availability: true },
        orderBy: { availability: { startTime: 'asc' } },
      },
    },
  })

  if (!student) notFound()

  // Group consecutive bookings into lessons
  type Booking = typeof student.bookings[0]
  type Lesson = { status: string; startTime: Date; endTime: Date }
  const lessons: Lesson[] = []
  for (const b of student.bookings) {
    const last = lessons[lessons.length - 1]
    if (
      last &&
      last.status === b.status &&
      last.endTime.getTime() === b.availability.startTime.getTime()
    ) {
      last.endTime = b.availability.endTime
    } else {
      lessons.push({ status: b.status, startTime: b.availability.startTime, endTime: b.availability.endTime })
    }
  }
  // Sort descending by lesson start
  lessons.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

  const completedCount = lessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status)).length

  return (
    <div>
      <Link href="/instructor/students" className="text-blue-600 hover:underline mb-4 block text-sm">&larr; חזרה לרשימת תלמידים</Link>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
          <p className="text-gray-600 mt-1">{student.email} {student.phone ? `| ${student.phone}` : ''}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{completedCount}</p>
          <p className="text-sm text-gray-500">שיעורים</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">תאריך</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">שעות</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lessons.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4">{israelDate(l.startTime)}</td>
                <td className="px-6 py-4 text-gray-600">
                  {israelTime(l.startTime)} - {israelTime(l.endTime)}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[l.status]}`}>
                    {STATUS_LABELS[l.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lessons.length === 0 && (
          <div className="p-8 text-center text-gray-500">אין היסטוריית שיעורים</div>
        )}
      </div>
    </div>
  )
}
