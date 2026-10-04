export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createChargeCalendarEvent } from '@/lib/calendar'

const VALID_TYPES = ['PRACTICAL_TEST', 'INTERNAL_TEST']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const charges = await prisma.charge.findMany({
    include: {
      student: { select: { id: true, name: true, phone: true } },
      invoice: { select: { id: true, amount: true, invoiceUrl: true } },
    },
    orderBy: { startTime: 'desc' },
  })
  return NextResponse.json(charges)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const instructorId = (session.user as any).id

  const { studentId, type, startTime, minutes, amount } = await req.json()

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'סוג אירוע לא תקין' }, { status: 400 })
  }
  if (!studentId) {
    return NextResponse.json({ error: 'יש לבחור תלמיד' }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }
  const start = new Date(startTime)
  if (isNaN(start.getTime()) || !Number.isFinite(minutes) || minutes <= 0) {
    return NextResponse.json({ error: 'זמן לא תקין' }, { status: 400 })
  }
  const end = new Date(start.getTime() + minutes * 60 * 1000)

  const student = await prisma.user.findUnique({ where: { id: studentId, role: 'STUDENT' } })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  // The instructor can only be in one place at a time — block the slot if a
  // lesson or another test is already there. An explicit "block" only
  // matters for a future time — backdating a test into a slot that just
  // happened to be marked blocked back then is fine, nothing real was there.
  const isPast = start < new Date()
  const [bookingConflict, blockConflict, chargeConflict] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        availability: { instructorId, startTime: { lt: end }, endTime: { gt: start } },
      },
    }),
    isPast ? null : prisma.availability.findFirst({
      where: { instructorId, isBlocked: true, startTime: { lt: end }, endTime: { gt: start } },
    }),
    prisma.charge.findFirst({ where: { startTime: { lt: end }, endTime: { gt: start } } }),
  ])
  if (bookingConflict || blockConflict || chargeConflict) {
    return NextResponse.json({ error: 'השעה הזו כבר תפוסה' }, { status: 409 })
  }

  const charge = await prisma.charge.create({
    data: { studentId, type, startTime: start, endTime: end, amount },
    include: { student: { select: { id: true, name: true, phone: true } } },
  })

  const eventId = await createChargeCalendarEvent({
    student: { name: charge.student.name, phone: charge.student.phone },
    type: charge.type,
    startTime: charge.startTime,
    endTime: charge.endTime,
  })
  if (eventId) {
    await prisma.charge.update({ where: { id: charge.id }, data: { calendarEventId: eventId } })
  }

  return NextResponse.json({ ...charge, calendarEventId: eventId }, { status: 201 })
}
