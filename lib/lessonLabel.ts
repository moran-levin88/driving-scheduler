import { formatIsraelDate, formatIsraelTime } from './israelTime'

// Splits one lesson chain's full time span into individual invoice lines —
// one per 40-minute lesson, plus a trailing 20-minute line if the chain
// doesn't divide evenly (e.g. a 60-min "שיעור וחצי") — each with its own
// date/time and a proportional share of the total amount. The last line
// absorbs the rounding remainder so the lines always sum to exactly the
// amount paid.
export function splitIntoLessonLines(params: {
  startTime: Date
  totalSlots: number // 20-min units
  totalAmount: number
}): { description: string; amount: number }[] {
  const { startTime, totalSlots, totalAmount } = params

  const segmentSlots: number[] = []
  let remaining = totalSlots
  while (remaining >= 2) {
    segmentSlots.push(2)
    remaining -= 2
  }
  if (remaining > 1e-9) segmentSlots.push(remaining)

  const amountPerSlot = totalAmount / totalSlots
  let cursor = startTime
  let allocated = 0

  return segmentSlots.map((slots, i) => {
    const isLast = i === segmentSlots.length - 1
    const amount = isLast ? totalAmount - allocated : Math.round(amountPerSlot * slots)
    allocated += amount

    const description = `שיעור נהיגה — ${formatIsraelDate(cursor)} ${formatIsraelTime(cursor)}`
    cursor = new Date(cursor.getTime() + slots * 20 * 60 * 1000)
    return { description, amount }
  })
}
