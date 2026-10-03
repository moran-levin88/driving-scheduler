// Pure, in-memory version of the "group consecutive same-criteria bookings
// into one lesson" logic — same matching rule as lib/lessonChain.ts, but
// operating on an already-fetched array instead of hitting the DB, for
// bulk stats (e.g. per-student lesson counts across the whole roster).
type BookingLike = {
  id: string
  status: string
  pickupAddress?: string | null
  notes?: string | null
  availability: { startTime: Date | string; endTime: Date | string }
  payments?: { amount: number }[]
}

export type GroupedLesson = {
  firstId: string
  status: string
  startTime: Date
  endTime: Date
  slots: number
  paidSoFar: number // sum of this lesson's Payment amounts — may be partial
}

export function groupBookingsIntoLessons<T extends BookingLike>(bookings: T[]): GroupedLesson[] {
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
  )

  const lessons: (GroupedLesson & { pickupAddress: string | null; notes: string | null })[] = []
  for (const b of sorted) {
    const last = lessons[lessons.length - 1]
    const bStart = new Date(b.availability.startTime).getTime()
    if (
      last &&
      last.status === b.status &&
      last.pickupAddress === (b.pickupAddress ?? null) &&
      last.notes === (b.notes ?? null) &&
      last.endTime.getTime() === bStart
    ) {
      last.slots += 1
      last.endTime = new Date(b.availability.endTime)
    } else {
      lessons.push({
        firstId: b.id,
        status: b.status,
        startTime: new Date(b.availability.startTime),
        endTime: new Date(b.availability.endTime),
        slots: 1,
        paidSoFar: (b.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
        pickupAddress: b.pickupAddress ?? null,
        notes: b.notes ?? null,
      })
    }
  }
  return lessons
}
