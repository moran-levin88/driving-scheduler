export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved } from '@/lib/email'
import { createCalendarEvent } from '@/lib/calendar'
import { Prisma } from '@prisma/client'

const SLOT_MINUTES = 20

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const instructorId = (session.user as any).id

  const { studentId, availabilityIds, startTime, minutes, pickupAddress, notes } = await req.json()

  if (!studentId || (!availabilityIds?.length && !(startTime && minutes))) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  try {
    const { firstBooking, lastSlotEndTime } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let ids: string[]

      if (availabilityIds?.length) {
        // Booking into already-published, open Availability rows — used by
        // the availability management page's inline "book a student" action.
        const slots = await tx.availability.findMany({ where: { id: { in: availabilityIds } } })
        if (slots.length !== availabilityIds.length || slots.some(s => s.isBooked || s.isBlocked)) {
          throw new Error('SLOT_UNAVAILABLE')
        }
        ids = availabilityIds
      } else {
        // Booking directly into a clicked calendar time — the slot(s) may
        // never have been formally published to students, so create them on
        // the fly as long as nothing else is actually booked there.
        const needed = Math.round(minutes / SLOT_MINUTES)
        let cursor = new Date(startTime)
        const resolved: string[] = []
        for (let i = 0; i < needed; i++) {
          const slotEnd = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000)
          const isPast = cursor < new Date()
          const [conflict, chargeConflict] = await Promise.all([
            tx.booking.findFirst({
              where: { status: { in: ['PENDING', 'APPROVED'] }, availability: { instructorId, startTime: cursor } },
            }),
            tx.charge.findFirst({ where: { startTime: { lt: slotEnd }, endTime: { gt: cursor } } }),
          ])
          if (conflict || chargeConflict) throw new Error('SLOT_UNAVAILABLE')
          let slot = await tx.availability.findFirst({ where: { instructorId, startTime: cursor } })
          // A "block" only matters for a future slot — backdating a lesson
          // into one that was just marked blocked back then is fine.
          if (slot?.isBlocked && !isPast) throw new Error('SLOT_UNAVAILABLE')
          if (!slot) {
            slot = await tx.availability.create({ data: { instructorId, startTime: cursor, endTime: slotEnd, isBooked: false } })
          }
          resolved.push(slot.id)
          cursor = slot.endTime
        }
        ids = resolved
      }

      const slotsFinal = await tx.availability.findMany({ where: { id: { in: ids } }, orderBy: { startTime: 'asc' } })
      const lastSlotEndTime = slotsFinal[slotsFinal.length - 1].endTime

      let first: any = null
      for (const availabilityId of ids) {
        await tx.availability.update({ where: { id: availabilityId }, data: { isBooked: true } })
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
      return { firstBooking: first, lastSlotEndTime }
    })

    const approvalEmail = { ...firstBooking, availability: { ...firstBooking.availability, endTime: lastSlotEndTime } }
    sendBookingApproved(approvalEmail as any).catch(console.error)

    const eventId = await createCalendarEvent({
      student: firstBooking.student,
      availability: {
        startTime: firstBooking.availability.startTime,
        endTime: lastSlotEndTime,
      },
      pickupAddress: firstBooking.pickupAddress,
    })
    if (eventId) {
      await prisma.booking.update({ where: { id: firstBooking.id }, data: { calendarEventId: eventId } })
    }

    return NextResponse.json(firstBooking, { status: 201 })
  } catch (err: any) {
    if (err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'השעה כבר לא פנויה' }, { status: 409 })
    }
    throw err
  }
}
