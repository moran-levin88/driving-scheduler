import { prisma } from './prisma'
import { getAllStudentBalances } from './balance'
import { groupBookingsIntoLessons } from './groupLessons'
import { computeDebt } from './debt'

const STUDENT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  isRestricted: true,
  pricePer20Min: true,
  idNumber: true,
  dateOfBirth: true,
  manualPriorLessons: true,
  manualPriorOtherTeacherLessons: true,
  manualPriorPracticalTests: true,
  manualPriorInternalTests: true,
  previousPlatformDebt: true,
  privacyConsentAt: true,
  archivedAt: true,
  bookings: {
    include: { availability: true, payments: { select: { amount: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} as const

// Shared by GET /api/students and the year-end debtors/creditors report —
// previously duplicated inline in the API route, which is exactly the kind
// of "same grouping logic copied into more than one file" that caused
// several of this app's earlier bugs.
export async function getStudentsWithStats(scope: 'active' | 'archived' | 'all') {
  const now = new Date()
  const where =
    scope === 'all' ? { role: 'STUDENT' as const } :
    scope === 'archived' ? { role: 'STUDENT' as const, archivedAt: { not: null } } :
    { role: 'STUDENT' as const, archivedAt: null }

  const [students, balances, unpaidCharges, manualLessonSums] = await Promise.all([
    prisma.user.findMany({ where, select: STUDENT_SELECT, orderBy: { name: 'asc' } }),
    getAllStudentBalances(),
    // Only a test that's already happened can be owed for — one scheduled
    // for the future isn't a debt yet.
    prisma.charge.groupBy({ by: ['studentId'], where: { invoiceId: null, startTime: { lte: now } }, _sum: { amount: true } }),
    prisma.manualLessonRecord.groupBy({ by: ['studentId'], _sum: { lessons: true } }),
  ])
  const unpaidChargeByStudent = new Map(unpaidCharges.map(c => [c.studentId, c._sum.amount ?? 0]))
  const manualLessonsByStudent = new Map(manualLessonSums.map(m => [m.studentId, m._sum.lessons ?? 0]))

  return students.map(s => {
    const lessons = groupBookingsIntoLessons(s.bookings)
    // Only lessons that have actually happened (ended already) count toward
    // the displayed lesson count — a future approved booking isn't "taken" yet.
    const completedLessons = lessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status) && l.endTime <= now)
    const debt = computeDebt({
      pricePer20Min: s.pricePer20Min,
      previousPlatformDebt: s.previousPlatformDebt,
      lessons,
      unpaidChargesTotal: unpaidChargeByStudent.get(s.id) ?? 0,
      now,
    })
    // A "lesson" is 40 min = two 20-min slots (a "שיעור וחצי" is 1.5, "כפול" is 2,
    // etc.) — count total slots, not sessions, so longer lessons count for more.
    // No rounding: a 60-min lesson alone is already a fractional 1.5, and
    // manualPriorLessons can carry its own quarter-lesson fraction too.
    const completedSlots = completedLessons.reduce((sum, l) => sum + l.slots, 0)
    return {
      ...s,
      lessonCount: completedSlots / 2 + s.manualPriorLessons + s.manualPriorOtherTeacherLessons + (manualLessonsByStudent.get(s.id) ?? 0),
      debt,
      balance: balances.get(s.id) ?? 0,
    }
  })
}
