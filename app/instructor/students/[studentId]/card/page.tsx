import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { groupBookingsIntoLessons } from '@/lib/groupLessons'
import { INSTRUCTOR_NAME, INSTRUCTOR_LICENSE_NUMBER } from '@/lib/instructorInfo'
import PrintButton from './PrintButton'

type Row = { date: Date; timeLabel: string; lessonUnits: number; amountPaid: number | null }

export default async function StudentCardPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params

  const student = await prisma.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    include: {
      bookings: { include: { availability: true, payments: true }, orderBy: { availability: { startTime: 'asc' } } },
      manualLessonRecords: { orderBy: { date: 'asc' } },
      charges: true,
    },
  })
  if (!student) notFound()

  const now = new Date()
  const groupedLessons = groupBookingsIntoLessons(student.bookings)
  const completedLessons = groupedLessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status) && l.endTime <= now)

  const bookingRows: Row[] = completedLessons.map(l => ({
    date: l.startTime,
    timeLabel: `${l.startTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}–${l.endTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}`,
    lessonUnits: l.slots / 2,
    amountPaid: l.paidSoFar > 0 ? l.paidSoFar : null,
  }))
  const manualRows: Row[] = student.manualLessonRecords.map(r => ({
    date: r.date,
    timeLabel: '—',
    lessonUnits: r.lessons,
    amountPaid: r.amountPaid,
  }))
  const allRows = [...bookingRows, ...manualRows].sort((a, b) => a.date.getTime() - b.date.getTime())

  const completedSlots = completedLessons.reduce((sum, l) => sum + l.slots, 0)
  const manualTotal = student.manualLessonRecords.reduce((sum, r) => sum + r.lessons, 0)
  const totalLessons = completedSlots / 2 + student.manualPriorLessons + student.manualPriorOtherTeacherLessons + manualTotal

  // Only tests that have actually happened count — one scheduled for the
  // future hasn't been taken yet.
  const practicalTestCount = student.charges.filter(c => c.type === 'PRACTICAL_TEST' && c.startTime <= now).length + student.manualPriorPracticalTests
  const internalTestCount = student.charges.filter(c => c.type === 'INTERNAL_TEST' && c.startTime <= now).length + student.manualPriorInternalTests
  const totalPaid = allRows.reduce((sum, r) => sum + (r.amountPaid ?? 0), 0)

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <div className="mb-4 print:hidden flex justify-between items-center">
        <Link href={`/instructor/students/${studentId}`} className="text-blue-600 hover:underline text-sm">&larr; חזרה</Link>
        <PrintButton />
      </div>

      <div className="bg-white rounded-xl shadow p-8 print:shadow-none print:p-0">
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">כרטיס תלמיד</h1>
            <p className="text-sm text-gray-500 mt-1">הופק בתאריך {now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
          <div className="text-left text-sm text-gray-700">
            <p className="font-semibold">{INSTRUCTOR_NAME}</p>
            <p>מספר הוראה: {INSTRUCTOR_LICENSE_NUMBER}</p>
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
            </dl>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 mb-2">פירוט שיעורים</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-right py-2">תאריך</th>
              <th className="text-right py-2">שעות</th>
              <th className="text-right py-2">כמות שיעורים</th>
              <th className="text-right py-2">כסף שהתקבל</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5">{r.date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</td>
                <td className="py-1.5 text-gray-600">{r.timeLabel}</td>
                <td className="py-1.5">{r.lessonUnits}</td>
                <td className="py-1.5">{r.amountPaid != null ? `₪${r.amountPaid}` : '—'}</td>
              </tr>
            ))}
          </tbody>
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
