import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { groupBookingsIntoLessons } from '@/lib/groupLessons'
import { computeDebt } from '@/lib/debt'
import { getDefaultVehicle } from '@/lib/vehicle'
import { INSTRUCTOR_NAME, INSTRUCTOR_LICENSE_NUMBER } from '@/lib/instructorInfo'
import DownloadPdfButton from './DownloadPdfButton'

type Row = {
  date: Date
  timeLabel: string
  lessonUnits: number
  price: number | null
  amountPaid: number | null
  remaining: number | null
  invoiceNumber: string | null
}

export default async function StudentCardPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params

  const [student, vehicle] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId, role: 'STUDENT' },
      include: {
        bookings: {
          include: { availability: true, payments: { include: { invoice: { select: { invoiceNumber: true } } } } },
          orderBy: { availability: { startTime: 'asc' } },
        },
        manualLessonRecords: { orderBy: { date: 'asc' } },
        charges: true,
      },
    }),
    getDefaultVehicle(),
  ])
  if (!student) notFound()

  const now = new Date()
  const bookingsById = new Map(student.bookings.map(b => [b.id, b]))
  const groupedLessons = groupBookingsIntoLessons(student.bookings)
  const completedLessons = groupedLessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status) && l.endTime <= now)

  const bookingRows: Row[] = completedLessons.map(l => {
    const price = student.pricePer20Min != null ? student.pricePer20Min * l.slots : null
    const amountPaid = l.paidSoFar > 0 ? l.paidSoFar : null
    // A lesson's Payment rows all live on the chain's first booking — see
    // the schema comment on Payment.bookingId.
    const payments = bookingsById.get(l.firstId)?.payments ?? []
    const invoiceNumbers = [...new Set(payments.map(p => p.invoice?.invoiceNumber).filter((n): n is string => !!n))]
    return {
      date: l.startTime,
      timeLabel: `${l.startTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}–${l.endTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}`,
      lessonUnits: l.slots / 2,
      price,
      amountPaid,
      remaining: price != null ? Math.max(0, price - l.paidSoFar) : null,
      invoiceNumber: invoiceNumbers.length > 0 ? invoiceNumbers.join(', ') : null,
    }
  })
  const manualRows: Row[] = student.manualLessonRecords.map(r => ({
    date: r.date,
    timeLabel: '—',
    lessonUnits: r.lessons,
    price: null,
    amountPaid: r.amountPaid,
    remaining: null,
    invoiceNumber: null,
  }))
  const allRows = [...bookingRows, ...manualRows].sort((a, b) => a.date.getTime() - b.date.getTime())

  const completedSlots = completedLessons.reduce((sum, l) => sum + l.slots, 0)
  const manualTotal = student.manualLessonRecords.reduce((sum, r) => sum + r.lessons, 0)
  const totalLessons = completedSlots / 2 + student.manualPriorLessons + student.manualPriorOtherTeacherLessons + manualTotal

  // Only tests that have actually happened count — one scheduled for the
  // future hasn't been taken yet.
  const practicalTestCount = student.charges.filter(c => c.type === 'PRACTICAL_TEST' && c.startTime <= now).length
    + student.manualPriorPracticalTests + student.manualPriorOtherTeacherPracticalTests
  const internalTestCount = student.charges.filter(c => c.type === 'INTERNAL_TEST' && c.startTime <= now).length
    + student.manualPriorInternalTests + student.manualPriorOtherTeacherInternalTests
  const totalPaid = allRows.reduce((sum, r) => sum + (r.amountPaid ?? 0), 0)
  // Sum of this table's own "remaining" column — distinct from totalDebt
  // below, which also folds in unpaid tests and previous-platform debt that
  // never appear as rows here.
  const totalRemaining = allRows.reduce((sum, r) => sum + (r.remaining ?? 0), 0)
  const unpaidChargesTotal = student.charges
    .filter(c => !c.invoiceId && c.startTime <= now)
    .reduce((sum, c) => sum + c.amount, 0)
  const totalDebt = computeDebt({
    pricePer20Min: student.pricePer20Min,
    previousPlatformDebt: student.previousPlatformDebt,
    lessons: groupedLessons,
    unpaidChargesTotal,
    now,
  })

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <div className="mb-4 print:hidden flex justify-between items-center">
        <Link href={`/instructor/students/${studentId}`} className="text-blue-600 hover:underline text-sm">&larr; חזרה</Link>
        <DownloadPdfButton targetId="student-card-content" fileName={`כרטיס-תלמיד-${student.name}.pdf`} />
      </div>

      <div id="student-card-content" className="bg-white rounded-xl shadow p-8">
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">כרטיס תלמיד</h1>
            <p className="text-sm text-gray-500 mt-1">הופק בתאריך {now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
          <div className="text-left text-sm text-gray-700">
            <p className="font-semibold">{INSTRUCTOR_NAME}</p>
            <p>מספר הוראה: {INSTRUCTOR_LICENSE_NUMBER}</p>
            <p>מספר רכב: {vehicle.licensePlate}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">פרטי תלמיד</h2>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-gray-500">שם</dt><dd className="font-medium">{student.name}</dd></div>
              {student.idNumber && <div className="flex justify-between"><dt className="text-gray-500">ת&quot;ז</dt><dd className="font-medium">{student.idNumber}</dd></div>}
              {student.dateOfBirth && <div className="flex justify-between"><dt className="text-gray-500">תאריך לידה</dt><dd className="font-medium">{student.dateOfBirth.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</dd></div>}
              {student.address && <div className="flex justify-between"><dt className="text-gray-500">מען</dt><dd className="font-medium">{student.address}</dd></div>}
              {student.phone && <div className="flex justify-between"><dt className="text-gray-500">טלפון</dt><dd className="font-medium">{student.phone}</dd></div>}
              {!student.email.includes('@placeholder') && <div className="flex justify-between"><dt className="text-gray-500">אימייל</dt><dd className="font-medium">{student.email}</dd></div>}
            </dl>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">סיכום</h2>
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-gray-500">סה&quot;כ שיעורים</dt><dd className="font-medium">{totalLessons}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">מבחנים מעשיים</dt><dd className="font-medium">{practicalTestCount}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">טסטים פנימיים</dt><dd className="font-medium">{internalTestCount}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">סה&quot;כ שולם</dt><dd className="font-medium">₪{totalPaid}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">סה&quot;כ חוב</dt><dd className={`font-medium ${totalDebt > 0 ? 'text-red-600' : ''}`}>₪{totalDebt}</dd></div>
            </dl>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 mb-2">פירוט תשלומים</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-right py-2">תאריך</th>
              <th className="text-right py-2">שעות</th>
              <th className="text-right py-2">כמות שיעורים</th>
              <th className="text-right py-2">מחיר</th>
              <th className="text-right py-2">מספר חשבונית</th>
              <th className="text-right py-2">שולם</th>
              <th className="text-right py-2">יתרה לתשלום</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5">{r.date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</td>
                <td className="py-1.5 text-gray-600">{r.timeLabel}</td>
                <td className="py-1.5">{r.lessonUnits}</td>
                <td className="py-1.5">{r.price != null ? `₪${r.price}` : '—'}</td>
                <td className="py-1.5 text-gray-600">{r.invoiceNumber ?? '—'}</td>
                <td className="py-1.5">{r.amountPaid != null ? `₪${r.amountPaid}` : '—'}</td>
                <td className={`py-1.5 ${r.remaining ? 'text-red-600' : ''}`}>{r.remaining != null ? `₪${r.remaining}` : '—'}</td>
              </tr>
            ))}
          </tbody>
          {allRows.length > 0 && (
            <tfoot>
              <tr className="font-bold border-t-2 border-gray-300">
                <td className="py-2" colSpan={5}>סה&quot;כ</td>
                <td className="py-2">₪{totalPaid}</td>
                <td className="py-2">₪{totalRemaining}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {allRows.length === 0 && <p className="text-center text-gray-400 py-6">אין היסטוריית שיעורים</p>}
        {student.manualPriorLessons > 0 && (
          <p className="text-xs text-gray-400 mt-3">+ {student.manualPriorLessons} שיעורים נוספים מהפלטפורמה הקודמת (ללא פירוט תאריכים)</p>
        )}
        {student.manualPriorOtherTeacherLessons > 0 && (
          <p className="text-xs text-gray-400 mt-1">+ {student.manualPriorOtherTeacherLessons} שיעורים נוספים אצל מורה אחר (ללא פירוט תאריכים)</p>
        )}
      </div>
    </div>
  )
}
