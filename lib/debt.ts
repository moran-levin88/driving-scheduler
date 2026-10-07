import { GroupedLesson } from './groupLessons'

// Pure formula, shared by the students list (lib/studentStats.ts) and the
// student card — previously only lived inline in the students-list route,
// which would have meant copying it a second time for the card's own debt
// summary instead of reusing the one place it's already correct.
export function computeDebt(params: {
  pricePer20Min: number | null
  previousPlatformDebt: number
  lessons: GroupedLesson[]
  unpaidChargesTotal: number
  now: Date
}): number {
  // Debt is the shortfall per approved lesson that's already happened
  // (price minus whatever's been paid so far) — a future booked lesson
  // isn't owed yet, and a partially-paid past lesson still owes the
  // difference, not just lessons with zero payments.
  const approvedLessons = params.lessons.filter(l => l.status === 'APPROVED' && l.endTime <= params.now)
  const lessonDebt = params.pricePer20Min != null
    ? approvedLessons.reduce((sum, l) => sum + Math.max(0, params.pricePer20Min! * l.slots - l.paidSoFar), 0)
    : 0
  return lessonDebt + params.unpaidChargesTotal + params.previousPlatformDebt
}
