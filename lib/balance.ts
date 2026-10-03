import { prisma } from './prisma'

// A student's prepaid credit, always computed fresh — never stored — so it
// can't drift: deposits add to it, lessons settled with method BALANCE
// subtract from it.
export async function getStudentBalance(studentId: string): Promise<number> {
  const [deposits, deductions] = await Promise.all([
    prisma.invoice.aggregate({
      where: { studentId, isDeposit: true },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { studentId, method: 'BALANCE' },
      _sum: { amount: true },
    }),
  ])
  return (deposits._sum.amount ?? 0) - (deductions._sum.amount ?? 0)
}
