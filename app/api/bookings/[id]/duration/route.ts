export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'
import { findLessonChain } from '@/lib/lessonChain'

const SLOT_MINUTES = 20
const ALLOWED_MINUTES = [40, 60, 80, 100, 120]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { minutes } = await req.json()
  if (!ALLOWED_MINUTES.includes(minutes)) {
    return NextResponse.json({ error: 'משך לא תקין' }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking || booking.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Rebuild the lesson group the same way the calendar/status routes do
  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { chain, first } = result
  const currentSlots = chain.length
  const targetSlots = minutes / SLOT_MINUTES

  if (targetSlots === currentSlots) {
    return NextResponse.json({ error: 'השיעור כבר במשך הזמן הזה' }, { status: 409 })
  }

  let newEndTime: Date

  if (targetSlots > currentSlots) {
    // Extend — walk forward 20 minutes at a time. A slot only blocks the
    // extension if another active booking actually occupies it; whether an
    // Availability row happens to exist there (e.g. it was never published,
    // common for correcting a lesson that's already in the past) doesn't
    // matter — one is created on the fly if needed.
    const needed = targetSlots - currentSlots
    const extra: (typeof first.availability)[] = []
    let cursor = chain[chain.length - 1].availability.endTime
    for (let i = 0; i < needed; i++) {
      const slotEnd = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000)
      const [conflict, chargeConflict] = await Promise.all([
        prisma.booking.findFirst({
          where: {
            status: { in: ['PENDING', 'APPROVED'] },
            availability: { instructorId: first.availability.instructorId, startTime: cursor },
          },
        }),
        prisma.charge.findFirst({ where: { startTime: { lt: slotEnd }, endTime: { gt: cursor } } }),
      ])
      if (conflict || chargeConflict) {
        return NextResponse.json({ error: 'השעה שאחרי השיעור כבר תפוסה' }, { status: 409 })
      }
      let slot = await prisma.availability.findFirst({
        where: { instructorId: first.availability.instructorId, startTime: cursor },
      })
      // A block only matters for a future slot — backdating into one that
      // was just marked blocked back then is fine.
      if (slot?.isBlocked && cursor >= new Date()) {
        return NextResponse.json({ error: 'השעה שאחרי השיעור חסומה' }, { status: 409 })
      }
      if (!slot) {
        slot = await prisma.availability.create({
          data: { instructorId: first.availability.instructorId, startTime: cursor, endTime: slotEnd, isBooked: false },
        })
      }
      extra.push(slot)
      cursor = slot.endTime
    }

    await prisma.$transaction([
      ...extra.map(slot => prisma.availability.update({ where: { id: slot.id }, data: { isBooked: true } })),
      // A slot that was previously booked and then cancelled/rejected keeps
      // that Booking row for history (availabilityId is unique on Booking),
      // so it has to be cleared before a new booking can claim the same slot.
      prisma.booking.deleteMany({
        where: { availabilityId: { in: extra.map(s => s.id) }, status: { in: ['CANCELLED', 'REJECTED'] } },
      }),
      prisma.booking.createMany({
        data: extra.map(slot => ({
          studentId: booking.studentId,
          availabilityId: slot.id,
          status: 'APPROVED' as const,
          pickupAddress: first.pickupAddress,
          notes: first.notes,
        })),
      }),
    ])
    newEndTime = extra[extra.length - 1].endTime
  } else {
    // Shrink — cancel the trailing slots and free them up
    const toRemove = chain.slice(targetSlots)
    await prisma.$transaction([
      prisma.booking.updateMany({ where: { id: { in: toRemove.map(b => b.id) } }, data: { status: 'CANCELLED' } }),
      prisma.availability.updateMany({ where: { id: { in: toRemove.map(b => b.availabilityId) } }, data: { isBooked: false } }),
    ])
    newEndTime = chain[targetSlots - 1].availability.endTime
  }

  if ((first as any).calendarEventId) {
    await updateCalendarEvent((first as any).calendarEventId, first.availability.startTime, newEndTime)
  }

  return NextResponse.json({ ok: true, startTime: first.availability.startTime, endTime: newEndTime })
}
