export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'
import { sendBookingApproved } from '@/lib/email'

const roundMin = (ms: number) => Math.round(ms / 60000) * 60000

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { alternativeDateTime } = await req.json()

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { availability: true, student: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const instructorId = (session.user as any).id
  const newStart = new Date(alternativeDateTime)

  // Find all consecutive siblings (the full lesson group)
  const siblings = await prisma.booking.findMany({
    where: { studentId: booking.studentId, status: booking.status },
    include: { availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })

  const allChains: typeof siblings[] = []
  let current: typeof siblings = []
  for (const b of siblings) {
    const last = current[current.length - 1]
    if (last && roundMin(last.availability.endTime.getTime()) === roundMin(b.availability.startTime.getTime())) {
      current.push(b)
    } else {
      if (current.length) allChains.push(current)
      current = [b]
    }
  }
  if (current.length) allChains.push(current)
  const chain = allChains.find(c => c.some(b => b.id === id)) ?? [booking as any]

  const first = chain[0]
  const last  = chain[chain.length - 1]
  const shiftMs = newStart.getTime() - first.availability.startTime.getTime()
  const oldStart = first.availability.startTime
  const oldEnd   = last.availability.endTime

  // Check for conflicts at the target time range
  const chainStart = newStart
  const chainEnd   = new Date(last.availability.endTime.getTime() + shiftMs)
  const conflict = await prisma.availability.findFirst({
    where: {
      instructorId,
      startTime: { gte: chainStart, lt: chainEnd },
      isBooked: true,
      id: { notIn: chain.map(b => b.availabilityId) },
    },
  })
  if (conflict) {
    return NextResponse.json({ error: 'אחת מהשעות במועד החלופי כבר תפוסה' }, { status: 409 })
  }

  // Move each slot in the chain
  for (const b of chain) {
    const newSlotStart = new Date(b.availability.startTime.getTime() + shiftMs)
    const newSlotEnd   = new Date(b.availability.endTime.getTime()   + shiftMs)

    const existingFree = await prisma.availability.findFirst({
      where: { startTime: newSlotStart, isBooked: false, isBlocked: false },
    })

    if (existingFree) {
      await prisma.booking.update({ where: { id: b.id }, data: { availabilityId: existingFree.id, status: 'APPROVED' } })
      await prisma.availability.update({ where: { id: existingFree.id }, data: { isBooked: true } })
      await prisma.availability.update({ where: { id: b.availabilityId }, data: { isBooked: false } })
    } else {
      const newSlot = await prisma.availability.create({
        data: { instructorId, startTime: newSlotStart, endTime: newSlotEnd, isBooked: true },
      })
      await prisma.booking.update({ where: { id: b.id }, data: { availabilityId: newSlot.id, status: 'APPROVED' } })
      await prisma.availability.update({ where: { id: b.availabilityId }, data: { isBooked: false } })
    }
  }

  // Update calendar event to new time
  if ((first as any).calendarEventId) {
    const newFirstEnd = new Date(oldEnd.getTime() + shiftMs)
    await updateCalendarEvent((first as any).calendarEventId, newStart, newFirstEnd)
  }

  // Send approval email to student with the new lesson time
  const newEnd = new Date(oldEnd.getTime() + shiftMs)
  const emailBooking = { ...first, availability: { ...first.availability, startTime: newStart, endTime: newEnd } }
  sendBookingApproved(emailBooking as any).catch(console.error)

  return NextResponse.json({ success: true })
}
