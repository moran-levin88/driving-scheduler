export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved, sendBookingRejected, sendBookingCancelled } from '@/lib/email'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/calendar'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await req.json()
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { student: true, availability: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find all consecutive sibling bookings (same student, status, pickupAddress, notes)
  // so the whole lesson is processed and the calendar event covers the full duration
  const siblings = await prisma.booking.findMany({
    where: { studentId: booking.studentId, status: booking.status },
    include: { student: true, availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })

  // Extract the consecutive chain that contains this booking
  let chain: typeof siblings = []
  let current: typeof siblings = []
  for (const b of siblings) {
    const last = current[current.length - 1]
    if (
      last &&
      (last.pickupAddress ?? null) === (b.pickupAddress ?? null) &&
      (last.notes ?? null) === (b.notes ?? null) &&
      new Date(last.availability.endTime).getTime() === new Date(b.availability.startTime).getTime()
    ) {
      current.push(b)
    } else {
      current = [b]
    }
    if (b.id === id) chain = [...current]
  }
  if (!chain.length) chain = [booking as any]

  const ids = chain.map(b => b.id)
  const first = chain[0]
  const last = chain[chain.length - 1]

  await prisma.booking.updateMany({ where: { id: { in: ids } }, data: { status } })

  if (status === 'REJECTED' || status === 'CANCELLED') {
    await prisma.availability.updateMany({
      where: { id: { in: chain.map(b => b.availabilityId) } },
      data: { isBooked: false },
    })
    if (status === 'CANCELLED' && (first as any).calendarEventId) {
      await deleteCalendarEvent((first as any).calendarEventId)
    }
  }

  if (status === 'APPROVED' && !(first as any).calendarEventId) {
    try {
      const eventId = await createCalendarEvent({
        student: first.student,
        availability: {
          startTime: first.availability.startTime,
          endTime: last.availability.endTime,
        },
        pickupAddress: first.pickupAddress,
      })
      if (eventId) {
        await prisma.booking.update({ where: { id: first.id }, data: { calendarEventId: eventId } })
      } else {
        console.error('createCalendarEvent returned null for booking', id)
      }
    } catch (err) {
      console.error('Calendar event creation failed for booking', id, err)
    }
  }

  const bookingForEmail = {
    ...first,
    availability: { ...first.availability, endTime: last.availability.endTime },
  }
  if (status === 'APPROVED') sendBookingApproved(bookingForEmail as any).catch(err => console.error('Email failed:', err))
  else if (status === 'REJECTED') sendBookingRejected(bookingForEmail as any).catch(err => console.error('Email failed:', err))
  else if (status === 'CANCELLED') sendBookingCancelled(bookingForEmail as any).catch(err => console.error('Email failed:', err))

  return NextResponse.json({ ok: true })
}
