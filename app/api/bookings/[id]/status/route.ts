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
  const booking = await prisma.booking.update({
    where: { id },
    data: { status },
    include: {
      student: true,
      availability: true,
    },
  })

  if (status === 'REJECTED' || status === 'CANCELLED') {
    await prisma.availability.update({
      where: { id: booking.availabilityId },
      data: { isBooked: false },
    })
  }

  if (status === 'APPROVED') {
    const eventId = await createCalendarEvent(booking as any)
    if (eventId) {
      await prisma.booking.update({ where: { id }, data: { calendarEventId: eventId } })
    }
  } else if (status === 'CANCELLED' && (booking as any).calendarEventId) {
    await deleteCalendarEvent((booking as any).calendarEventId)
  }

  try {
    if (status === 'APPROVED') {
      await sendBookingApproved(booking as any)
    } else if (status === 'REJECTED') {
      await sendBookingRejected(booking as any)
    } else if (status === 'CANCELLED') {
      await sendBookingCancelled(booking as any)
    }
  } catch (err) {
    console.error('Email send failed:', err)
  }

  return NextResponse.json(booking)
}
