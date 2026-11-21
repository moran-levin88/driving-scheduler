import { prisma } from './prisma'
import { releaseSlots } from './availabilityRelease'

// Archive, don't delete — keeps the User row (and all its Booking/Payment/
// Invoice/Charge history) intact, just hidden from the active roster and
// blocked from booking further lessons. Only future pending/approved
// bookings are freed and cancelled — past lessons (whatever their status)
// are left untouched so they keep showing in the calendar/history.
export async function archiveStudent(studentId: string) {
  const now = new Date()
  const futureBookings = await prisma.booking.findMany({
    where: {
      studentId,
      status: { in: ['PENDING', 'APPROVED'] },
      availability: { startTime: { gt: now } },
    },
  })
  await releaseSlots(futureBookings.map(b => b.availabilityId))
  if (futureBookings.length > 0) {
    await prisma.booking.updateMany({
      where: { id: { in: futureBookings.map(b => b.id) } },
      data: { status: 'CANCELLED' },
    })
  }

  await prisma.session.deleteMany({ where: { userId: studentId } })
  await prisma.user.update({ where: { id: studentId }, data: { archivedAt: new Date() } })
}
