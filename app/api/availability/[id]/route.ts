export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteCalendarEvent, updateCalendarEvent } from '@/lib/calendar'
import { Prisma } from '@prisma/client'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { startTime, endTime, blockNote } = await req.json()

  const slot = await prisma.availability.findUnique({ where: { id } })
  if (!slot || !slot.isBlocked) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newStart = new Date(startTime)
  const newEnd = new Date(endTime)
  if (newEnd <= newStart) return NextResponse.json({ error: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' }, { status: 400 })

  await prisma.availability.update({
    where: { id },
    data: { startTime: newStart, endTime: newEnd, blockNote: blockNote || null },
  })

  if ((slot as any).calendarEventId) {
    await updateCalendarEvent((slot as any).calendarEventId, newStart, newEnd)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const slot = await prisma.availability.findUnique({ where: { id } })
  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (slot.isBooked) return NextResponse.json({ error: 'Cannot delete a booked slot' }, { status: 409 })

  if (slot.isBlocked && (slot as any).calendarEventId) {
    await deleteCalendarEvent((slot as any).calendarEventId)
  }
  try {
    // Clear any cancelled/rejected booking records linked to this slot so the
    // slot itself can be deleted — but a booking that was ever paid keeps a
    // Payment row pointing at it, which blocks this and should: deleting the
    // slot would otherwise sever the trail back to that payment's lesson time.
    await prisma.booking.deleteMany({ where: { availabilityId: id, status: { in: ['CANCELLED', 'REJECTED'] } } })
    await prisma.availability.delete({ where: { id } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return NextResponse.json({ error: 'לא ניתן למחוק שעה זו — יש לה היסטוריית תשלומים מקושרת' }, { status: 409 })
    }
    throw err
  }
  return NextResponse.json({ success: true })
}
