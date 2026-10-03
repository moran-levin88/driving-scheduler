export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'
import { findLessonChain } from '@/lib/lessonChain'

const SLOT_MINUTES = 20
const ALLOWED_MINUTES = [40, 60, 80]

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
  const { chain, first } = result
  const currentSlots = chain.length
  const targetSlots = minutes / SLOT_MINUTES

  if (targetSlots === currentSlots) {
    return NextResponse.json({ error: 'השיעור כבר במשך הזמן הזה' }, { status: 409 })
  }

  let newEndTime: Date

  if (targetSlots > currentSlots) {
    // Extend — find enough consecutive free slots right after the lesson's current end
    const needed = targetSlots - currentSlots
    const extra: (typeof first.availability)[] = []
    let cursor = chain[chain.length - 1].availability.endTime
    for (let i = 0; i < needed; i++) {
      const next = await prisma.availability.findFirst({
        where: { instructorId: first.availability.instructorId, startTime: cursor, isBooked: false, isBlocked: false },
      })
      if (!next) {
        return NextResponse.json({ error: 'אין מספיק זמינות פנויה בהמשך כדי להאריך את השיעור' }, { status: 409 })
      }
      extra.push(next)
      cursor = next.endTime
    }

    await prisma.$transaction([
      ...extra.map(slot => prisma.availability.update({ where: { id: slot.id }, data: { isBooked: true } })),
      prisma.booking.createMany({
        data: extra.map(slot => ({
          studentId: booking.studentId,
          availabilityId: slot.id,
          status: 'APPROVED' as const,
          pickupAddress: first.pickupAddress,
          notes: first.notes,
        })),
      }),
    ])
    newEndTime = extra[extra.length - 1].endTime
  } else {
    // Shrink — cancel the trailing slots and free them up
    const toRemove = chain.slice(targetSlots)
    await prisma.$transaction([
      prisma.booking.updateMany({ where: { id: { in: toRemove.map(b => b.id) } }, data: { status: 'CANCELLED' } }),
      prisma.availability.updateMany({ where: { id: { in: toRemove.map(b => b.availabilityId) } }, data: { isBooked: false } }),
    ])
    newEndTime = chain[targetSlots - 1].availability.endTime
  }

  if ((first as any).calendarEventId) {
    await updateCalendarEvent((first as any).calendarEventId, first.availability.startTime, newEndTime)
  }

  return NextResponse.json({ ok: true, startTime: first.availability.startTime, endTime: newEndTime })
}
