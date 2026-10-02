export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEvent } from '@/lib/calendar'

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

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { student: true, availability: true },
  })
  if (!booking || booking.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Rebuild the lesson group the same way the calendar/status routes do
  const siblings = await prisma.booking.findMany({
    where: { studentId: booking.studentId, status: 'APPROVED' },
    include: { student: true, availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })
  const chains: (typeof siblings)[] = []
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
      if (current.length) chains.push(current)
      current = [b]
    }
  }
  if (current.length) chains.push(current)
  const chain = (chains.find(c => c.some(b => b.id === id)) ?? [booking as any])
    .sort((a, b) => new Date(a.availability.startTime).getTime() - new Date(b.availability.startTime).getTime())

  const first = chain[0]
  const currentSlots = chain.length
  const targetSlots = minutes / SLOT_MINUTES

  if (targetSlots === currentSlots) {
    return NextResponse.json({ error: 'השיעור כבר במשך הזמן הזה' }, { status: 409 })
  }

  let newEndTime: Date

  if (targetSlots > currentSlots) {
    // Extend — find enough consecutive free slots right after the lesson's current end
    const needed = targetSlots - currentSlots
    const extra: typeof siblings[0]['availability'][] = []
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
