import { notFound } from 'next/navigation'
import Link from 'next/link'
import StudentPaymentsPanel from './StudentPaymentsPanel'
import CancelLessonButton from './CancelLessonButton'
import { getStudentPaymentsPanelData } from '@/lib/paymentsPanelData'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתין', APPROVED: 'מאושר', REJECTED: 'נדחה', CANCELLED: 'בוטל', COMPLETED: 'הושלם',
}
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-800', COMPLETED: 'bg-blue-100 text-blue-800',
}

export default async function StudentHistoryPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const data = await getStudentPaymentsPanelData(studentId)
  if (!data) notFound()
  const { student, lessons, completedCount, balance, payableLessons, invoices } = data

  return (
    <div>
      <Link href="/instructor/students" className="text-blue-600 hover:underline mb-4 block text-sm">&larr; חזרה לרשימת תלמידים</Link>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
          <p className="text-gray-600 mt-1">{student.email} {student.phone ? `| ${student.phone}` : ''}</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-blue-700">{completedCount}</p>
            <p className="text-sm text-gray-500">שיעורים</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-700">₪{balance}</p>
            <p className="text-sm text-gray-500">יתרה</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">תאריך</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">שעות</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">סטטוס</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">תשלום</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lessons.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">{l.startTime.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</td>
                  <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                    {l.startTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                    {' - '}
                    {l.endTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[l.status]}`}>
                      {STATUS_LABELS[l.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {l.status === 'APPROVED' && (() => {
                      const price = student.pricePer20Min != null ? student.pricePer20Min * l.slots : null
                      const remaining = price != null ? price - l.paidSoFar : null
                      if (remaining != null && remaining <= 0) return <span className="text-xs text-green-700">✓ שולם</span>
                      if (l.paidSoFar > 0) return <span className="text-xs text-amber-600">שולם חלקית{price != null ? ` (₪${l.paidSoFar} מתוך ₪${price})` : ''}</span>
                      return <span className="text-xs text-gray-400">טרם שולם</span>
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {l.status === 'APPROVED' && <CancelLessonButton bookingId={l.firstBookingId} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lessons.length === 0 && (
          <div className="p-8 text-center text-gray-500">אין היסטוריית שיעורים</div>
        )}
      </div>

      <StudentPaymentsPanel
        studentId={studentId}
        pricePer20Min={student.pricePer20Min}
        payableLessons={payableLessons}
        invoices={invoices}
        initialBalance={balance}
      />
    </div>
  )
}
