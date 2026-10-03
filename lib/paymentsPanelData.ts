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

  return {
    student: { id: student.id, name: student.name, email: student.email, phone: student.phone, pricePer20Min: student.pricePer20Min },
    lessons,
    completedCount,
    balance,
    payableLessons,
    invoices: invoices.map(inv => ({
      id: inv.id, amount: inv.amount, method: inv.method, reference: inv.reference,
      paidAt: inv.paidAt.toISOString(), isDeposit: inv.isDeposit,
      invoiceId: inv.invoiceId, invoiceUrl: inv.invoiceUrl,
      lessonCount: inv.payments.length,
    })),
  }
}
