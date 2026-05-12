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

  const { idsA, idsB } = await req.json()
  if (!Array.isArray(idsA) || !Array.isArray(idsB) || idsA.length === 0 || idsB.length === 0) {
    return NextResponse.json({ error: 'idsA and idsB required' }, { status: 400 })
  }

  const [bookingsA, bookingsB] = await Promise.all([
    prisma.booking.findMany({
      where: { id: { in: idsA }, status: 'APPROVED' },
      include: { student: true, availability: true },
      orderBy: { availability: { startTime: 'asc' } },
    }),
    prisma.booking.findMany({
      where: { id: { in: idsB }, status: 'APPROVED' },
      include: { student: true, availability: true },
      orderBy: { availability: { startTime: 'asc' } },
    }),
  ])

  if (bookingsA.length === 0 || bookingsB.length === 0) {
    return NextResponse.json({ error: 'שיעורים לא נמצאו' }, { status: 404 })
  }
  if (bookingsA.length !== bookingsB.length) {
    return NextResponse.json({ error: 'ניתן להחליף רק בין שיעורים באורך זהה' }, { status: 400 })
  }

  // Capture original times before any updates
  const origA = bookingsA.map(b => ({ start: b.availability.startTime, end: b.availability.endTime }))
  const origB = bookingsB.map(b => ({ start: b.availability.startTime, end: b.availability.endTime }))

  // Swap the startTime/endTime of each pair of availability slot records.
  // The bookings keep pointing to the same slot records — only the records' times change.
  // No new records are created, so no duplicate-slot issues.
  for (let i = 0; i < bookingsA.length; i++) {
    await prisma.availability.update({
      where: { id: bookingsA[i].availabilityId },
      data: { startTime: origB[i].start, endTime: origB[i].end },
    })
    await prisma.availability.update({
      where: { id: bookingsB[i].availabilityId },
      data: { startTime: origA[i].start, endTime: origA[i].end },
    })
  }

  const firstA = bookingsA[0]
  const lastA  = bookingsA[bookingsA.length - 1]
  const firstB = bookingsB[0]
  const lastB  = bookingsB[bookingsB.length - 1]

  const newStartA = origB[0].start
  const newEndA   = origB[origB.length - 1].end
  const newStartB = origA[0].start
  const newEndB   = origA[origA.length - 1].end

  if ((firstA as any).calendarEventId) {
    updateCalendarEvent((firstA as any).calendarEventId, newStartA, newEndA).catch(console.error)
  }
  if ((firstB as any).calendarEventId) {
    updateCalendarEvent((firstB as any).calendarEventId, newStartB, newEndB).catch(console.error)
  }

  const emailA = { ...firstA, availability: { ...firstA.availability, startTime: newStartA, endTime: newEndA } }
  const emailB = { ...firstB, availability: { ...firstB.availability, startTime: newStartB, endTime: newEndB } }
  sendBookingShifted(emailA as any, origA[0].start, origA[origA.length - 1].end).catch(console.error)
  sendBookingShifted(emailB as any, origB[0].start, origB[origB.length - 1].end).catch(console.error)

  return NextResponse.json({ ok: true })
}
