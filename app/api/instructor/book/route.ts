export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved } from '@/lib/email'
import { createCalendarEvent } from '@/lib/calendar'
import { Prisma } from '@prisma/client'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { studentId, availabilityIds, halfLesson, pickupAddress, notes } = await req.json()

  if (!studentId || !availabilityIds?.length) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  try {
    const firstBooking = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const slots = await tx.availability.findMany({
        where: { id: { in: availabilityIds } },
        orderBy: { startTime: 'asc' },
      })
      if (slots.length !== availabilityIds.length || slots.some(s => s.isBooked || s.isBlocked)) {
        throw new Error('SLOT_UNAVAILABLE')
      }

      let first: any = null
      for (let i = 0; i < availabilityIds.length; i++) {
        const availabilityId = availabilityIds[i]
        const slot = slots.find(s => s.id === availabilityId)!

        // For half-lesson (60 min): truncate the second slot to 20 min
        if (halfLesson && i === 1) {
          const truncatedEnd = new Date(slot.startTime.getTime() + 20 * 60 * 1000)
          await tx.availability.update({
            where: { id: availabilityId },
            data: { endTime: truncatedEnd, isBooked: true },
          })
        } else {
          await tx.availability.update({ where: { id: availabilityId }, data: { isBooked: true } })
        }

        await tx.booking.deleteMany({
          where: { availabilityId, status: { in: ['CANCELLED', 'REJECTED'] } },
        })
        const created = await tx.booking.create({
          data: {
            studentId,
            availabilityId,
            pickupAddress: pickupAddress || null,
            notes: notes || null,
            status: 'APPROVED',
          },
          include: { student: true, availability: true },
        })
        if (!first) first = created
      }
      return first
    })

    sendBookingApproved(firstBooking as any).catch(console.error)

    createCalendarEvent(firstBooking as any).then(async (eventId) => {
      if (eventId) {
        await prisma.booking.update({ where: { id: firstBooking.id }, data: { calendarEventId: eventId } })
      }
    }).catch(console.error)

    return NextResponse.json(firstBooking, { status: 201 })
  } catch (err: any) {
    if (err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'השעה כבר לא פנויה' }, { status: 409 })
    }
    throw err
  }
}
