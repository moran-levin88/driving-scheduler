export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteCalendarEvent, updateCalendarEvent } from '@/lib/calendar'

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
  await prisma.availability.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
