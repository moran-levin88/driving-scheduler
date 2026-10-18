export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'

// A test (PRACTICAL_TEST/INTERNAL_TEST) isn't tied to an Availability slot
// the way a lesson is — it's just a startTime/endTime on the Charge row —
// so shifting it is a straight time update, not the slot-juggling dance
// bookings/shift does.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const instructorId = (session.user as any).id
  const { id } = await params
  const { targetStartTimeIso } = await req.json()

  const newStart = new Date(targetStartTimeIso)
  if (isNaN(newStart.getTime())) {
    return NextResponse.json({ error: 'זמן לא תקין' }, { status: 400 })
  }

  const charge = await prisma.charge.findUnique({ where: { id } })
  if (!charge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const duration = charge.endTime.getTime() - charge.startTime.getTime()
  const newEnd = new Date(newStart.getTime() + duration)

  const isPast = newStart < new Date()
  const [bookingConflict, blockConflict, chargeConflict] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        availability: { instructorId, startTime: { lt: newEnd }, endTime: { gt: newStart } },
      },
    }),
    isPast ? null : prisma.availability.findFirst({
      where: { instructorId, isBlocked: true, startTime: { lt: newEnd }, endTime: { gt: newStart } },
    }),
    prisma.charge.findFirst({ where: { id: { not: id }, startTime: { lt: newEnd }, endTime: { gt: newStart } } }),
  ])
  if (bookingConflict || blockConflict || chargeConflict) {
    return NextResponse.json({ error: 'השעה הזו כבר תפוסה' }, { status: 409 })
  }

  await prisma.charge.update({ where: { id }, data: { startTime: newStart, endTime: newEnd } })

  if (charge.calendarEventId) {
    await updateCalendarEvent(charge.calendarEventId, newStart, newEnd)
  }

  return NextResponse.json({ ok: true })
}
