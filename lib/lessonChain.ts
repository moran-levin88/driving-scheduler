import { prisma } from './prisma'
import type { Prisma, BookingStatus } from '@prisma/client'

const chainInclude = {
  student: true,
  availability: true,
} satisfies Prisma.BookingInclude

export type ChainBooking = Prisma.BookingGetPayload<{ include: typeof chainInclude }>

/**
 * Rebuilds the full lesson a single 20-minute booking belongs to: all
 * consecutive same-student/pickupAddress/notes bookings at the given status,
 * sorted by time. Lessons may span 2-4 of these base slots (40/60/80 min).
 */
export async function findLessonChain(
  bookingId: string,
  status: BookingStatus
): Promise<{ chain: ChainBooking[]; first: ChainBooking; last: ChainBooking } | null> {
  const booking: ChainBooking | null = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: chainInclude,
  })
  if (!booking) return null

  const siblings = await prisma.booking.findMany({
    where: { studentId: booking.studentId, status },
    include: chainInclude,
    orderBy: { availability: { startTime: 'asc' } },
  })

  const chains: ChainBooking[][] = []
  let current: ChainBooking[] = []
  for (const b of siblings) {
    const last = current[current.length - 1]
    if (
      last &&
      (last.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      (last.notes ?? null) === (b.notes ?? null) &&
      new Date(last.availability.endTime).getTime() === new Date(b.availability.startTime).getTime()
    ) {
      current.push(b)
    } else {
      if (current.length) chains.push(current)
      current = [b]
    }
  }
  if (current.length) chains.push(current)

  const chain = (chains.find(c => c.some(b => b.id === bookingId)) ?? [booking])
    .sort((a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime())

  return { chain, first: chain[0], last: chain[chain.length - 1] }
}
