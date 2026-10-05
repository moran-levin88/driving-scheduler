import { prisma } from './prisma'
import { getStudentBalance } from './balance'

// Everything StudentPaymentsPanel needs for one student — shared between
// the student History page (server component) and the calendar's payments
// modal (client component, via an API route), so both stay in sync.
export async function getStudentPaymentsPanelData(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    include: {
      bookings: {
        include: { availability: true, payments: true },
        orderBy: { availability: { startTime: 'asc' } },
      },
    },
  })
  if (!student) return null

  const now = new Date()

  const [invoices, balance, pendingCharges, manualLessonRecords] = await Promise.all([
    prisma.invoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { paidAt: 'desc' },
    }),
    getStudentBalance(studentId),
    // Practical/internal tests booked from the calendar that haven't been
    // paid yet — once paid they get a normal Invoice (with a description)
    // and show up in the invoices list below like any other charge. Only
    // ones that have actually happened can be closed out — a test still in
    // the future isn't owed for yet.
    prisma.charge.findMany({
      where: { studentId, invoiceId: null, startTime: { lte: now } },
      orderBy: { startTime: 'desc' },
    }),
    prisma.manualLessonRecord.findMany({ where: { studentId }, orderBy: { date: 'asc' } }),
  ])

  // Group consecutive bookings into lessons, keeping the first booking's id
  // (that's what a lesson's Payments, if any, are keyed on) and its total
  // paid-so-far — a lesson can be settled across more than one payment.
  // Partitioned by status before chaining — a slot can hold more than one
  // Booking row over time (e.g. a cancelled earlier attempt sitting at the
  // same time as the real one), and that interloper's different status would
  // otherwise break the chain between two bookings that are really one lesson.
  type Lesson = { firstBookingId: string; status: string; startTime: Date; endTime: Date; slots: number; paidSoFar: number }
  const byStatus = new Map<string, typeof student.bookings>()
  for (const b of student.bookings) {
    const arr = byStatus.get(b.status)
    if (arr) arr.push(b)
    else byStatus.set(b.status, [b])
  }
  const lessons: Lesson[] = []
  for (const list of byStatus.values()) {
    const sorted = [...list].sort((a, b) => a.availability.startTime.getTime() - b.availability.startTime.getTime())
    let last: Lesson | null = null
    for (const b of sorted) {
      if (last && last.endTime.getTime() === b.availability.startTime.getTime()) {
        last.endTime = b.availability.endTime
        last.slots += 1
      } else {
        last = {
          firstBookingId: b.id,
          status: b.status,
          startTime: b.availability.startTime,
          endTime: b.availability.endTime,
          slots: 1,
          paidSoFar: b.payments.reduce((sum, p) => sum + p.amount, 0),
        }
        lessons.push(last)
      }
    }
  }
  lessons.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())

  // A "lesson" is 40 min = two 20-min slots — count slots, not sessions, so a
  // double (80 min) or "שיעור וחצי" (60 min) lesson counts for more than one.
  // Only lessons that have actually happened (ended already) count — a
  // future approved booking isn't "taken" yet.
  // No rounding — a lone 60-min lesson is already a fractional 1.5, and
  // manualPriorLessons can carry its own quarter-lesson fraction too.
  const completedSlots = student.bookings.filter(b => ['APPROVED', 'COMPLETED'].includes(b.status) && b.availability.endTime <= now).length
  const manualLessonsTotal = manualLessonRecords.reduce((sum, r) => sum + r.lessons, 0)
  const completedCount = completedSlots / 2 + student.manualPriorLessons + manualLessonsTotal

  const payableLessons = lessons
    .filter(l => {
      if (l.status !== 'APPROVED') return false
      if (l.endTime > now) return false // not owed yet — hasn't happened
      const price = student.pricePer20Min != null ? student.pricePer20Min * l.slots : null
      return price == null || price - l.paidSoFar > 0
    })
    .map(l => ({
      firstBookingId: l.firstBookingId,
      startTime: l.startTime.toISOString(),
      endTime: l.endTime.toISOString(),
      paidSoFar: l.paidSoFar,
    }))

  const CHARGE_LABELS: Record<string, string> = { PRACTICAL_TEST: 'מבחן מעשי', INTERNAL_TEST: 'טסט פנימי' }

  return {
    student: { id: student.id, name: student.name, email: student.email, phone: student.phone, pricePer20Min: student.pricePer20Min },
    lessons,
    completedCount,
    balance,
    previousPlatformDebt: student.previousPlatformDebt,
    payableLessons,
    manualLessonRecords: manualLessonRecords.map(r => ({
      id: r.id, date: r.date.toISOString(), lessons: r.lessons, amountPaid: r.amountPaid,
    })),
    pendingCharges: pendingCharges.map(c => ({
      id: c.id,
      label: CHARGE_LABELS[c.type] ?? c.type,
      startTime: c.startTime.toISOString(),
      amount: c.amount,
    })),
    invoices: invoices.map(inv => ({
      id: inv.id, amount: inv.amount, method: inv.method, reference: inv.reference,
      paidAt: inv.paidAt.toISOString(), isDeposit: inv.isDeposit, description: inv.description,
      invoiceId: inv.invoiceId, invoiceUrl: inv.invoiceUrl,
      lessonCount: inv.payments.length,
    })),
  }
}
