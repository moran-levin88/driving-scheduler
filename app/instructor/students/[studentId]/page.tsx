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

export default async function StudentHistoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const student = await prisma.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    include: {
      bookings: {
        include: { availability: true },
        orderBy: { availability: { startTime: 'desc' } },
      },
    },
  })

  if (!student) notFound()

  const completedCount = student.bookings.filter(b => ['APPROVED', 'COMPLETED'].includes(b.status)).length

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
            {student.bookings.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{format(b.availability.startTime, "d בMMMM yyyy", { locale: he })}</td>
                <td className="px-6 py-4 text-gray-600">
                  {format(b.availability.startTime, 'HH:mm')} - {format(b.availability.endTime, 'HH:mm')}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>
                    {STATUS_LABELS[b.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {student.bookings.length === 0 && (
          <div className="p-8 text-center text-gray-500">אין היסטוריית שיעורים</div>
        )}
      </div>
    </div>
  )
}
