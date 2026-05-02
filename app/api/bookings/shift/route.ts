export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'
import { sendBookingShifted } from '@/lib/email'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { bookingIds, minutes, direction } = await req.json()
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return NextResponse.json({ error: 'bookingIds required' }, { status: 400 })
  }
  if (minutes !== 20 && minutes !== 40) {
    return NextResponse.json({ error: 'minutes must be 20 or 40' }, { status: 400 })
  }

  // earlier = subtract, later = add
  const shiftMs = minutes * 60 * 1000 * (direction === 'later' ? 1 : -1)

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds }, status: 'APPROVED' },
    include: { student: true, availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })

  // Group consecutive bookings into lesson groups
  type Booking = typeof bookings[0]
  type Group = { bookings: Booking[] }
  const groups: Group[] = []

  for (const b of bookings) {
    if (new Date(b.availability.startTime) < tomorrow) continue
    const last = groups[groups.length - 1]
    const prev = last?.bookings[last.bookings.length - 1]
    if (
      prev &&
      prev.studentId === b.studentId &&
      (prev.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      (prev.notes ?? null) === (b.notes ?? null) &&
      new Date(prev.availability.endTime).getTime() === new Date(b.availability.startTime).getTime()
    ) {
      last.bookings.push(b)
    } else {
      groups.push({ bookings: [b] })
    }
  }

  for (const group of groups) {
    const first = group.bookings[0]
    const last = group.bookings[group.bookings.length - 1]
    const oldStart = new Date(first.availability.startTime)
    const oldEnd = new Date(last.availability.endTime)

    // Shift all availability slots
    for (const b of group.bookings) {
      await prisma.availability.update({
        where: { id: b.availabilityId },
        data: {
          startTime: new Date(new Date(b.availability.startTime).getTime() + shiftMs),
          endTime: new Date(new Date(b.availability.endTime).getTime() + shiftMs),
        },
      })
    }

    const newStart = new Date(oldStart.getTime() + shiftMs)
    const newEnd = new Date(oldEnd.getTime() + shiftMs)

    // Update Google Calendar event
    if (first.calendarEventId) {
      await updateCalendarEvent(first.calendarEventId, newStart, newEnd)
    }

    // Notify student by email (fire-and-forget)
    const emailBooking = {
      ...first,
      availability: { ...first.availability, startTime: newStart, endTime: newEnd },
    }
    sendBookingShifted(emailBooking as any, oldStart, oldEnd).catch(err =>
      console.error('Shift email failed:', err)
    )
  }

  return NextResponse.json({ ok: true, shifted: groups.length })
}
