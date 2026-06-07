export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'
import { sendBookingShifted } from '@/lib/email'

const roundMs = (ms: number) => Math.round(ms / 60000) * 60000

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { bookingIds, minutes, direction, targetStartTimeIso } = await req.json()
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return NextResponse.json({ error: 'bookingIds required' }, { status: 400 })
  }

  // targetStartTimeIso = precise shift to a specific time (single lesson)
  // minutes + direction = relative shift (bulk shift)
  const usePrecise = !!targetStartTimeIso
  if (!usePrecise && (!minutes || !direction)) {
    return NextResponse.json({ error: 'minutes and direction required for bulk shift' }, { status: 400 })
  }

  const now = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  // Precise single-lesson shifts (from the calendar) may target lessons later today;
  // bulk shifts only apply from tomorrow onwards.
  const cutoff = usePrecise ? now : tomorrow

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
    if (new Date(b.availability.startTime) < cutoff) continue
    const last = groups[groups.length - 1]
    const prev = last?.bookings[last.bookings.length - 1]
    if (
      prev &&
      prev.studentId === b.studentId &&
      roundMs(new Date(prev.availability.endTime).getTime()) === roundMs(new Date(b.availability.startTime).getTime())
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

    // Calculate shiftMs
    let shiftMs: number
    if (usePrecise) {
      shiftMs = new Date(targetStartTimeIso).getTime() - oldStart.getTime()
    } else {
      shiftMs = minutes * 60 * 1000 * (direction === 'later' ? 1 : -1)
    }

    // Shift all slots in the group.
    // If a free slot already exists at the target time → reassign the booking to it
    // and free the original slot. Otherwise → update the original slot's times and
    // recreate a free slot at the original position so availability is not lost.
    for (const b of group.bookings) {
      const newSlotStart = new Date(b.availability.startTime.getTime() + shiftMs)
      const newSlotEnd   = new Date(b.availability.endTime.getTime()   + shiftMs)
      const oldSlotId    = b.availabilityId
      const oldStart     = b.availability.startTime
      const oldEnd       = b.availability.endTime
      const instructorId = b.availability.instructorId

      const existingAtTarget = await prisma.availability.findFirst({
        where: { startTime: newSlotStart, endTime: newSlotEnd, isBooked: false, isBlocked: false },
      })

      if (existingAtTarget) {
        // Reassign booking to the pre-existing slot, free the original slot.
        // Clean up stale cancelled/rejected booking records first (their availabilityId @unique
        // would block the reassignment even though the slot is free).
        await prisma.booking.deleteMany({
          where: { availabilityId: existingAtTarget.id, status: { in: ['CANCELLED', 'REJECTED'] } },
        })
        await prisma.booking.update({ where: { id: b.id }, data: { availabilityId: existingAtTarget.id } })
        await prisma.availability.update({ where: { id: existingAtTarget.id }, data: { isBooked: true } })
        await prisma.availability.update({ where: { id: oldSlotId }, data: { isBooked: false } })
      } else {
        // Create a new booked slot at the target time and free the original.
        // Never mutate the slot's time in place — that causes duplicates when the
        // shift amount is smaller than the lesson duration (target overlaps source slots).
        const newSlot = await prisma.availability.create({
          data: { instructorId, startTime: newSlotStart, endTime: newSlotEnd, isBooked: true },
        })
        await prisma.booking.update({ where: { id: b.id }, data: { availabilityId: newSlot.id } })
        await prisma.availability.update({ where: { id: oldSlotId }, data: { isBooked: false } })
      }
    }

    const newStart = new Date(oldStart.getTime() + shiftMs)
    const newEnd = new Date(oldEnd.getTime() + shiftMs)

    if (first.calendarEventId) {
      await updateCalendarEvent(first.calendarEventId, newStart, newEnd)
    }

    const emailBooking = {
      ...first,
      availability: { ...first.availability, startTime: newStart, endTime: newEnd },
    }
    sendBookingShifted(emailBooking as any, oldStart, oldEnd).catch(err =>
      console.error('Shift email failed:', err)
    )
  }

  if (groups.length === 0) {
    return NextResponse.json({ error: 'לא נמצא שיעור מתאים להזזה' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, shifted: groups.length })
}
