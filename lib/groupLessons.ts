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
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime()
  )

  const lessons: GroupedLesson[] = []
  for (const b of sorted) {
    const last = lessons[lessons.length - 1]
    const bStart = new Date(b.availability.startTime).getTime()
    if (last && last.status === b.status && last.endTime.getTime() === bStart) {
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
      })
    }
  }
  return lessons
}
