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

  // Build all consecutive chains, then find the one containing this booking
  const allChains: (typeof siblings)[] = []
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
      if (current.length) allChains.push(current)
      current = [b]
    }
  }
  if (current.length) allChains.push(current)
  const chain = allChains.find(c => c.some(b => b.id === id)) ?? [booking as any]

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
  else if (status === 'CANCELLED') {
    sendBookingCancelled(bookingForEmail as any).catch(err => console.error('Email failed:', err))
    const now = new Date()
    const smsCutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    if (first.availability.startTime > now && first.availability.startTime <= smsCutoff) {
      const israelLocal = new Date(first.availability.startTime.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
      const dateStr = format(israelLocal, "EEEE, d בMMMM", { locale: he })
      const timeStr = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(first.availability.startTime)
      const msg = `שיעור נהיגה התפנה ב${dateStr} בשעה ${timeStr}. מי מעוניין? היכנסו למערכת וקבעו שיעור 🚗\nביטל: ${first.student.name}`
      sendSmsToInstructor(msg).catch(console.error)
      sendPushToInstructor('שיעור התפנה', `${first.student.name} — שיעור ב${dateStr} ${timeStr} בוטל`).catch(console.error)
    }
  }

  return NextResponse.json({ ok: true })
}
