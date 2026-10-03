export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent } from '@/lib/calendar'
import { findLessonChain } from '@/lib/lessonChain'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking || booking.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Rebuild the lesson group the same way the status routes do, so the event
  // covers the full lesson duration and is stored on the group's first booking.
  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { chain, first, last } = result

  if (chain.some(b => b.calendarEventId)) {
    return NextResponse.json({ error: 'כבר מסונכרן ליומן' }, { status: 409 })
  }

  const eventId = await createCalendarEvent({
    student: first.student,
    availability: { startTime: first.availability.startTime, endTime: last.availability.endTime },
    pickupAddress: first.pickupAddress,
  })
  if (!eventId) {
    return NextResponse.json({ error: 'יצירת האירוע ביומן נכשלה — בדוק את הגדרות Google Calendar' }, { status: 502 })
  }

  await prisma.booking.update({ where: { id: first.id }, data: { calendarEventId: eventId } })
  return NextResponse.json({ ok: true, firstId: first.id })
}
