export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved, sendBookingRejected, sendBookingCancelled } from '@/lib/email'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/calendar'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ids, status } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const bookings = await prisma.booking.findMany({
    where: { id: { in: ids } },
    include: { student: true, availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })
  if (bookings.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const firstBooking = bookings[0]
  const lastBooking = bookings[bookings.length - 1]

  await prisma.booking.updateMany({ where: { id: { in: ids } }, data: { status } })

  if (status === 'REJECTED' || status === 'CANCELLED') {
    await prisma.availability.updateMany({
      where: { id: { in: bookings.map(b => b.availabilityId) } },
      data: { isBooked: false },
    })
    if (status === 'CANCELLED' && (firstBooking as any).calendarEventId) {
      await deleteCalendarEvent((firstBooking as any).calendarEventId)
    }
  }

  if (status === 'APPROVED' && !(firstBooking as any).calendarEventId) {
    const eventId = await createCalendarEvent({
      student: firstBooking.student,
      availability: {
        startTime: firstBooking.availability.startTime,
        endTime: lastBooking.availability.endTime,
      },
      pickupAddress: firstBooking.pickupAddress,
    })
    if (eventId) {
      await prisma.booking.update({ where: { id: firstBooking.id }, data: { calendarEventId: eventId } })
    }
  }

  // Send one email for the whole lesson with correct start→end time
  const bookingForEmail = {
    ...firstBooking,
    availability: { ...firstBooking.availability, endTime: lastBooking.availability.endTime },
  }
  try {
    if (status === 'APPROVED') await sendBookingApproved(bookingForEmail as any)
    else if (status === 'REJECTED') await sendBookingRejected(bookingForEmail as any)
    else if (status === 'CANCELLED') await sendBookingCancelled(bookingForEmail as any)
  } catch (err) {
    console.error('Email send failed:', err)
  }

  return NextResponse.json({ ok: true })
}
