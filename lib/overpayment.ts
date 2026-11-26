import type { GroupedLesson } from './groupLessons'

// A lesson can be paid with more than it costs (the instructor types a bigger
// amount). That surplus used to vanish: debt just floored at 0 and the
// student's balance only counted explicit deposits, so e.g. a ₪20 overpayment
// never showed up as credit. The surplus is now treated as prepaid credit,
// always derived from the payments themselves (never stored, so it can't
// drift) — see getStudentBalance.

// Full price of a lesson after discount, or null when the student has no price set.
export function lessonPriceOf(pricePer20Min: number | null, slots: number, discountAmount: number): number | null {
  if (pricePer20Min == null) return null
  return Math.max(0, pricePer20Min * slots - discountAmount)
}

// How much of a payment goes beyond what was still owed on its lesson.
export function excessOver(amount: number, price: number | null, alreadyPaidBefore: number): number {
  if (price == null) return 0
  return Math.max(0, amount - Math.max(0, price - alreadyPaidBefore))
}

// Total surplus across a student's lessons: paid more than the (discounted)
// price. Capped at the real money actually received on the lesson, so a
// previous-platform "EXTERNAL" record (not money received here) never turns
// into credit.
export function lessonOverpayment(pricePer20Min: number | null, lessons: GroupedLesson[]): number {
  if (pricePer20Min == null) return 0
  let total = 0
  for (const l of lessons) {
    if (!['APPROVED', 'COMPLETED'].includes(l.status)) continue
    const price = lessonPriceOf(pricePer20Min, l.slots, l.discountAmount) ?? 0
    total += Math.min(Math.max(0, l.paidSoFar - price), l.realPaid)
  }
  return total
}
