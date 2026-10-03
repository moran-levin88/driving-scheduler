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

// Same computation as getStudentBalance, but for every student at once —
// two grouped queries instead of 2×N, for list views like the students page.
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
