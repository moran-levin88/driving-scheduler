import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { groupBookingsIntoLessons } from '@/lib/groupLessons'
import { INSTRUCTOR_NAME, INSTRUCTOR_LICENSE_NUMBER } from '@/lib/instructorInfo'
import { getStageProgress } from '@/lib/curriculumStages'
import DownloadPdfButton from '@/components/DownloadPdfButton'

const STATUS_LABELS: Record<string, string> = { done: '✓ הושלם', in_progress: 'בתהליך', not_started: 'טרם החל' }

export default async function StudyStagesPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params

  const student = await prisma.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    include: {
      bookings: { include: { availability: true } },
      manualLessonRecords: true,
    },
  })
  if (!student) notFound()

  const now = new Date()
  const groupedLessons = groupBookingsIntoLessons(student.bookings)
  const completedLessons = groupedLessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status) && l.endTime <= now)
  // Same formula as the student card's own "סה"כ שיעורים" — kept in sync so
  // the two documents never disagree on which stages are done.
  const completedSlots = completedLessons.reduce((sum, l) => sum + l.slots, 0)
  const manualTotal = student.manualLessonRecords.reduce((sum, r) => sum + r.lessons, 0)
  const totalLessons = completedSlots / 2 + student.manualPriorLessons + student.manualPriorOtherTeacherLessons + manualTotal

  const stages = getStageProgress(totalLessons)
  const allStagesDone = stages.every(s => s.status === 'done')

  return (
    <div className="max-w-3xl mx-auto" dir="rtl">
      <div className="mb-4 print:hidden flex justify-between items-center">
        <Link href={`/instructor/students/${studentId}`} className="text-blue-600 hover:underline text-sm">&larr; חזרה</Link>
        <DownloadPdfButton targetId="study-stages-content" fileName={`שלבי-לימוד-${student.name}.pdf`} />
      </div>

      <div id="study-stages-content" className="bg-white rounded-xl shadow p-8">
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">שלבי לימוד</h1>
            <p className="text-sm text-gray-500 mt-1">הופק בתאריך {now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
          <div className="text-left text-sm text-gray-700">
            <p className="font-semibold">{INSTRUCTOR_NAME}</p>
            <p>מספר הוראה: {INSTRUCTOR_LICENSE_NUMBER}</p>
          </div>
        </div>

        <div className="flex justify-between text-sm mb-6">
          <div><span className="text-gray-500">תלמיד/ה: </span><span className="font-medium">{student.name}</span></div>
          <div><span className="text-gray-500">סה&quot;כ שיעורים: </span><span className="font-medium">{totalLessons}</span></div>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 mb-2">תוכנית לימוד לפי שלבים (לפי תוכנית הלימוד הארצית)</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-right py-2">שלב</th>
              <th className="text-right py-2">נושאים</th>
              <th className="text-right py-2">שיעורים</th>
              <th className="text-right py-2">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {stages.map(s => (
              <tr key={s.key} className="border-b border-gray-100 align-top">
                <td className="py-1.5 font-medium whitespace-nowrap">{s.title}</td>
                <td className="py-1.5 text-gray-600">
                  <ul className="list-disc pr-4 space-y-0.5">
                    {s.topics.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </td>
                <td className="py-1.5 whitespace-nowrap">{s.fromLesson}–{s.toLesson}</td>
                <td className={`py-1.5 whitespace-nowrap ${s.status === 'done' ? 'text-green-700' : s.status === 'in_progress' ? 'text-amber-600' : 'text-gray-400'}`}>
                  {STATUS_LABELS[s.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">
          הסטטוס נקבע אוטומטית לפי מספר השיעורים שבוצעו בפועל ({totalLessons} מתוך 28 לפחות), ללא קביעה ידנית.
        </p>
        <div className="mt-4 pt-3 border-t text-sm text-gray-700 flex justify-between items-end">
          <p>
            {allStagesDone
              ? 'מאשר/ת כי התלמיד/ה השלים/ה את כל שלבי תוכנית הלימוד המעשית.'
              : 'מאשר/ת כי שלבי תוכנית הלימוד המעשית שסומנו לעיל כ״הושלם״ הועברו לתלמיד/ה בפועל.'}
          </p>
          <div className="text-left whitespace-nowrap">
            <p className="font-semibold">{INSTRUCTOR_NAME}</p>
            <p className="text-xs text-gray-500">מס&apos; הוראה {INSTRUCTOR_LICENSE_NUMBER} · נחתם אוטומטית בתאריך {now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
