export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved, sendBookingRejected, sendBookingCancelled } from '@/lib/email'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/calendar'
import { sendSmsToInstructor } from '@/lib/sms'
import { sendPushToInstructor } from '@/lib/push'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

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
    try {
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
      } else {
        console.error('createCalendarEvent returned null for booking group', ids)
      }
    } catch (err) {
      console.error('Calendar event creation failed for booking group', ids, err)
    }
  }

  // Fire-and-forget email so the function returns before email latency hits Vercel timeout
  const bookingForEmail = {
    ...firstBooking,
    availability: { ...firstBooking.availability, endTime: lastBooking.availability.endTime },
  }
  if (status === 'APPROVED') sendBookingApproved(bookingForEmail as any).catch(err => console.error('Email failed:', err))
  else if (status === 'REJECTED') sendBookingRejected(bookingForEmail as any).catch(err => console.error('Email failed:', err))
  else if (status === 'CANCELLED') {
    sendBookingCancelled(bookingForEmail as any).catch(err => console.error('Email failed:', err))
    const hoursUntil = (firstBooking.availability.startTime.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil >= 0 && hoursUntil <= 96) {
      const dateStr = format(firstBooking.availability.startTime, "EEEE, d בMMMM", { locale: he })
      const timeStr = format(firstBooking.availability.startTime, 'HH:mm')
      const msg = `שיעור נהיגה התפנה ב${dateStr} בשעה ${timeStr}. מי מעוניין? היכנסו למערכת וקבעו שיעור 🚗`
      sendSmsToInstructor(msg).catch(console.error)
      sendPushToInstructor('שיעור התפנה', `${firstBooking.student.name} — שיעור ב${dateStr} ${timeStr} בוטל`).catch(console.error)
    }
  }

  return NextResponse.json({ ok: true })
}
