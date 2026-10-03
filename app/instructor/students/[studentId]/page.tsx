import { prisma } from '@/lib/prisma'
import { getStudentBalance } from '@/lib/balance'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StudentPaymentsPanel from './StudentPaymentsPanel'

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
        include: { availability: true, payments: true },
        orderBy: { availability: { startTime: 'asc' } },
      },
    },
  })

  if (!student) notFound()

  const [invoices, balance] = await Promise.all([
    prisma.invoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { paidAt: 'desc' },
    }),
    getStudentBalance(studentId),
  ])

  // Group consecutive bookings into lessons, keeping the first booking's id
  // (that's what a lesson's Payments, if any, are keyed on) and its total
  // paid-so-far — a lesson can be settled across more than one payment.
  type Lesson = { firstBookingId: string; status: string; startTime: Date; endTime: Date; slots: number; paidSoFar: number }
  const lessons: Lesson[] = []
  for (const b of student.bookings) {
    const last = lessons[lessons.length - 1]
    if (
      last &&
      last.status === b.status &&
      last.endTime.getTime() === b.availability.startTime.getTime()
    ) {
      last.endTime = b.availability.endTime
      last.slots += 1
    } else {
      lessons.push({
        firstBookingId: b.id,
        status: b.status,
        startTime: b.availability.startTime,
        endTime: b.availability.endTime,
        slots: 1,
        paidSoFar: b.payments.reduce((sum, p) => sum + p.amount, 0),
      })
    }
  }
  lessons.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

  // A "lesson" is 40 min = two 20-min slots — count slots, not sessions, so a
  // double (80 min) or "שיעור וחצי" (60 min) lesson counts for more than one.
  const completedSlots = student.bookings.filter(b => ['APPROVED', 'COMPLETED'].includes(b.status)).length
  const completedCount = Math.round(completedSlots / 2) + student.manualPriorLessons

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
          <table className="w-full min-w-[480px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">תאריך</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">שעות</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">סטטוס</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">תשלום</th>
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
        payableLessons={lessons
          .filter(l => {
            if (l.status !== 'APPROVED') return false
            const price = student.pricePer20Min != null ? student.pricePer20Min * l.slots : null
            return price == null || price - l.paidSoFar > 0
          })
          .map(l => ({
            firstBookingId: l.firstBookingId,
            startTime: l.startTime.toISOString(),
            endTime: l.endTime.toISOString(),
            paidSoFar: l.paidSoFar,
          }))}
        invoices={invoices.map(inv => ({
          id: inv.id, amount: inv.amount, method: inv.method, reference: inv.reference,
          paidAt: inv.paidAt.toISOString(), isDeposit: inv.isDeposit,
          invoiceId: inv.invoiceId, invoiceUrl: inv.invoiceUrl,
          lessonCount: inv.payments.length,
        }))}
        initialBalance={balance}
      />
    </div>
  )
}
