// Pure, in-memory version of the "group consecutive same-criteria bookings
// into one lesson" logic — same matching rule as lib/lessonChain.ts, but
// operating on an already-fetched array instead of hitting the DB, for
// bulk stats (e.g. per-student lesson counts across the whole roster).
//
// Matching is on status + exact time adjacency only — NOT pickupAddress/notes.
// Those used to be part of the match, but a single real lesson's slots always
// share identical pickupAddress/notes (they come from one booking request),
// so requiring equality only added a way for incidental text differences to
// split one lesson into two — undercounting nothing, but showing e.g. one
// 40-minute lesson as two separate 20-minute ones.
//
// Bookings are partitioned by status before chaining, rather than compared
// against "whatever was pushed last overall" — a slot can hold more than one
// Booking row over time (e.g. a cancelled earlier attempt sitting at the same
// time as the real one), and that interloper's different status would
// otherwise break the chain between two bookings that are really one lesson.
type BookingLike = {
  id: string
  status: string
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
  const partitions = new Map<string, T[]>()
  for (const b of bookings) {
    const arr = partitions.get(b.status)
    if (arr) arr.push(b)
    else partitions.set(b.status, [b])
  }

  const lessons: GroupedLesson[] = []
  for (const list of partitions.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
    )
    let last: GroupedLesson | null = null
    for (const b of sorted) {
      const bStart = new Date(b.availability.startTime).getTime()
      if (last && last.endTime.getTime() === bStart) {
        last.slots += 1
        last.endTime = new Date(b.availability.endTime)
      } else {
        last = {
          firstId: b.id,
          status: b.status,
          startTime: new Date(b.availability.startTime),
          endTime: new Date(b.availability.endTime),
          slots: 1,
          paidSoFar: (b.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
        }
        lessons.push(last)
      }
    }
  }
  return lessons
}
