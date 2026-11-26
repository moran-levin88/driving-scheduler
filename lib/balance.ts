import { prisma } from './prisma'
import { groupBookingsIntoLessons } from './groupLessons'
import { lessonOverpayment, chargeOverpayment } from './overpayment'

// A student's prepaid credit, always computed fresh — never stored — so it
// can't drift: deposits add to it, lessons settled with method BALANCE
// subtract from it, and anything paid beyond a lesson's price counts as credit
// (see lib/overpayment.ts).
export async function getStudentBalance(studentId: string): Promise<number> {
  const [deposits, deductions, student, bookings, paidCharges] = await Promise.all([
    prisma.invoice.aggregate({
      where: { studentId, isDeposit: true },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { studentId, method: 'BALANCE' },
      _sum: { amount: true },
    }),
    prisma.user.findUnique({ where: { id: studentId }, select: { pricePer20Min: true } }),
    prisma.booking.findMany({
      where: { studentId, status: { in: ['APPROVED', 'COMPLETED'] } },
      select: {
        id: true, status: true, discountAmount: true, discountReason: true,
        availability: { select: { startTime: true, endTime: true } },
        payments: { select: { amount: true, method: true } },
      },
    }),
    prisma.charge.findMany({
      where: { studentId, invoiceId: { not: null } },
      select: { amount: true, invoice: { select: { amount: true } } },
    }),
  ])
  const overpaid = lessonOverpayment(student?.pricePer20Min ?? null, groupBookingsIntoLessons(bookings)) + chargeOverpayment(paidCharges)
  return (deposits._sum.amount ?? 0) - (deductions._sum.amount ?? 0) + overpaid
}

// Same deposits/deductions computation as getStudentBalance, but for every
// student at once — two grouped queries instead of 2×N, for list views like
// the students page. The overpayment part needs each student's lessons, which
// the caller (lib/studentStats.ts) already has, so it adds that itself.
export async function getAllStudentBalances(): Promise<Map<string, number>> {
  const [deposits, deductions] = await Promise.all([
    prisma.invoice.groupBy({ by: ['studentId'], where: { isDeposit: true }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['studentId'], where: { method: 'BALANCE' }, _sum: { amount: true } }),
  ])
  const map = new Map<string, number>()
  for (const d of deposits) map.set(d.studentId, (map.get(d.studentId) ?? 0) + (d._sum.amount ?? 0))
  for (const p of deductions) map.set(p.studentId, (map.get(p.studentId) ?? 0) - (p._sum.amount ?? 0))
  return map
}
