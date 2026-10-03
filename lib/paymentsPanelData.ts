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

  const [invoices, balance, pendingCharges] = await Promise.all([
    prisma.invoice.findMany({
      where: { studentId },
      include: { payments: true },
      orderBy: { paidAt: 'desc' },
    }),
    getStudentBalance(studentId),
    // Practical/internal tests booked from the calendar that haven't been
    // paid yet — once paid they get a normal Invoice (with a description)
    // and show up in the invoices list below like any other charge.
    prisma.charge.findMany({
      where: { studentId, invoiceId: null },
      orderBy: { startTime: 'desc' },
    }),
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
  // Only lessons that have actually happened (ended already) count — a
  // future approved booking isn't "taken" yet.
  const now = new Date()
  // No rounding — a lone 60-min lesson is already a fractional 1.5, and
  // manualPriorLessons can carry its own quarter-lesson fraction too.
  const completedSlots = student.bookings.filter(b => ['APPROVED', 'COMPLETED'].includes(b.status) && b.availability.endTime <= now).length
  const completedCount = completedSlots / 2 + student.manualPriorLessons

  const payableLessons = lessons
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
    }))

  const CHARGE_LABELS: Record<string, string> = { PRACTICAL_TEST: 'מבחן מעשי', INTERNAL_TEST: 'טסט פנימי' }

  return {
    student: { id: student.id, name: student.name, email: student.email, phone: student.phone, pricePer20Min: student.pricePer20Min },
    lessons,
    completedCount,
    balance,
    payableLessons,
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
