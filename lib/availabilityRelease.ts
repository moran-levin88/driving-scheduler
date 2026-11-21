import { prisma } from './prisma'

// Releasing a slot that came from a published availability simply reopens it.
// A slot that was only created on the fly for a calendar booking (adHoc)
// reopens only if the instructor has actually opened that week to students —
// otherwise it goes back to being unavailable, as it was before the booking.
//
// "Opened" = the week has any published (non-adHoc, non-blocked) slot, booked
// or not — a week the students already filled is still an opened week.
// Weeks run Sunday–Saturday, in UTC like the rest of the booking rules.

function weekRange(d: Date) {
  const start = new Date(d)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  start.setUTCHours(0, 0, 0, 0)
  return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) }
}

export async function isWeekOpen(instructorId: string, when: Date): Promise<boolean> {
  const { start, end } = weekRange(when)
  const n = await prisma.availability.count({
    where: { instructorId, adHoc: false, isBlocked: false, unpublished: false, startTime: { gte: start, lt: end } },
  })
  return n > 0
}

// The state a freed slot should end up in.
export async function freedSlotState(instructorId: string, startTime: Date, adHoc: boolean) {
  const hidden = adHoc && !(await isWeekOpen(instructorId, startTime))
  return { isBooked: false, unpublished: hidden }
}

// Update operations that release the given slots, for use inside a
// prisma.$transaction([...]) array or awaited one by one.
export async function releaseSlotOps(slotIds: string[]) {
  if (slotIds.length === 0) return []
  const slots = await prisma.availability.findMany({
    where: { id: { in: slotIds } },
    select: { id: true, instructorId: true, startTime: true, adHoc: true },
  })
  const weekOpen = new Map<string, boolean>()
  const ops = []
  for (const s of slots) {
    let hidden = false
    if (s.adHoc) {
      const key = `${s.instructorId}|${weekRange(s.startTime).start.toISOString()}`
      if (!weekOpen.has(key)) weekOpen.set(key, await isWeekOpen(s.instructorId, s.startTime))
      hidden = !weekOpen.get(key)!
    }
    ops.push(prisma.availability.update({ where: { id: s.id }, data: { isBooked: false, unpublished: hidden } }))
  }
  return ops
}

export async function releaseSlots(slotIds: string[]) {
  await Promise.all(await releaseSlotOps(slotIds))
}
