export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'
import { findLessonChain, type ChainBooking } from '@/lib/lessonChain'
import type { Prisma } from '@prisma/client'

const SLOT_MINUTES = 20
const ALLOWED_MINUTES = [20, 40, 60, 80, 100, 120]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { minutes } = await req.json()
  if (!ALLOWED_MINUTES.includes(minutes)) {
    return NextResponse.json({ error: 'משך לא תקין' }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking || booking.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Rebuild the lesson group the same way the calendar/status routes do
  const result = await findLessonChain(id, 'APPROVED')
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { chain, first, last } = result
  const instructorId = first.availability.instructorId

  // Elapsed time, not chain.length — a row doesn't have to be exactly
  // 20 min (e.g. a 30-min lesson booked directly from the calendar is one
  // row spanning 30 min). Counting rows undercounts any chain with such a
  // row and silently lands on the wrong target duration.
  const currentMinutes = (last.availability.endTime.getTime() - first.availability.startTime.getTime()) / 60000

  if (minutes === currentMinutes) {
    return NextResponse.json({ error: 'השיעור כבר במשך הזמן הזה' }, { status: 409 })
  }

  let newEndTime: Date

  if (minutes > currentMinutes) {
    // Extend — walk forward from the real end time, in 20-min chunks where
    // possible (reusing a published slot if one already exists there), with
    // one final shorter chunk if the gap to the target isn't a clean
    // multiple of 20 (the same non-standard-duration case as a 30-min
    // booking — see the comment in instructor/book/route.ts). A slot only
    // blocks the extension if another active booking actually occupies it;
    // whether an Availability row happens to exist there (e.g. it was never
    // published, common for correcting a lesson already in the past)
    // doesn't matter — one is created on the fly if needed.
    let deltaMinutes = minutes - currentMinutes
    let cursor = last.availability.endTime
    const claimed: { id: string; endTime: Date }[] = []

    while (deltaMinutes > 0) {
      const chunkMinutes = Math.min(SLOT_MINUTES, deltaMinutes)
      const slotEnd = new Date(cursor.getTime() + chunkMinutes * 60 * 1000)

      const [conflict, chargeConflict] = await Promise.all([
        prisma.booking.findFirst({
          where: {
            status: { in: ['PENDING', 'APPROVED'] },
            availability: { instructorId, startTime: { lt: slotEnd }, endTime: { gt: cursor } },
          },
        }),
        prisma.charge.findFirst({ where: { startTime: { lt: slotEnd }, endTime: { gt: cursor } } }),
      ])
      if (conflict || chargeConflict) {
        return NextResponse.json({ error: 'השעה שאחרי השיעור כבר תפוסה' }, { status: 409 })
      }

      // A short remainder chunk (the last bit needed to reach a non-20-
      // multiple target) never matches a published slot — only a full
      // 20-min chunk starting exactly on the grid can reuse one.
      let slot = chunkMinutes === SLOT_MINUTES
        ? await prisma.availability.findFirst({ where: { instructorId, startTime: cursor } })
        : null
      // A block only matters for a future slot — backdating into one that
      // was just marked blocked back then is fine.
      if (slot?.isBlocked && cursor >= new Date()) {
        return NextResponse.json({ error: 'השעה שאחרי השיעור חסומה' }, { status: 409 })
      }
      if (!slot) {
        slot = await prisma.availability.create({
          data: { instructorId, startTime: cursor, endTime: slotEnd, isBooked: false },
        })
      }
      claimed.push(slot)
      cursor = slot.endTime
      deltaMinutes -= chunkMinutes
    }

    await prisma.$transaction([
      ...claimed.map(slot => prisma.availability.update({ where: { id: slot.id }, data: { isBooked: true } })),
      prisma.booking.createMany({
        data: claimed.map(slot => ({
          studentId: booking.studentId,
          availabilityId: slot.id,
          status: 'APPROVED' as const,
          pickupAddress: first.pickupAddress,
          notes: first.notes,
        })),
      }),
    ])
    newEndTime = claimed[claimed.length - 1].endTime
  } else {
    // Shrink — cancel whole trailing rows that fall entirely past the
    // target. If the cut point lands inside a row instead (e.g. trimming a
    // 30-min row down to 20), shrink that one row's own Availability window
    // rather than dropping it outright, and open up the leftover time as a
    // new free slot.
    let minutesToKeep = minutes
    const toCancel: ChainBooking[] = []
    let trim: { booking: ChainBooking; keepMinutes: number } | null = null
    let lastKeptEnd = first.availability.startTime

    for (const b of chain) {
      const rowMinutes = (b.availability.endTime.getTime() - b.availability.startTime.getTime()) / 60000
      if (minutesToKeep <= 0) {
        toCancel.push(b)
      } else if (rowMinutes <= minutesToKeep) {
        minutesToKeep -= rowMinutes
        lastKeptEnd = b.availability.endTime
      } else {
        trim = { booking: b, keepMinutes: minutesToKeep }
        lastKeptEnd = new Date(b.availability.startTime.getTime() + minutesToKeep * 60 * 1000)
        minutesToKeep = 0
      }
    }

    const ops: Prisma.PrismaPromise<unknown>[] = []
    if (toCancel.length > 0) {
      ops.push(
        prisma.booking.updateMany({ where: { id: { in: toCancel.map(b => b.id) } }, data: { status: 'CANCELLED' } }),
        prisma.availability.updateMany({ where: { id: { in: toCancel.map(b => b.availabilityId) } }, data: { isBooked: false } }),
      )
    }
    if (trim) {
      ops.push(
        prisma.availability.update({ where: { id: trim.booking.availabilityId }, data: { endTime: lastKeptEnd } }),
        prisma.availability.create({
          data: { instructorId, startTime: lastKeptEnd, endTime: trim.booking.availability.endTime, isBooked: false },
        }),
      )
    }
    await prisma.$transaction(ops)
    newEndTime = lastKeptEnd
  }

  if ((first as any).calendarEventId) {
    await updateCalendarEvent((first as any).calendarEventId, first.availability.startTime, newEndTime)
  }

  return NextResponse.json({ ok: true, startTime: first.availability.startTime, endTime: newEndTime })
}
