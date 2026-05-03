export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBlockedCalendarEvent } from '@/lib/calendar'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  const now = new Date()

  if (role === 'INSTRUCTOR') {
    const slots = await prisma.availability.findMany({
      where: { startTime: { gte: now } },
      include: {
        booking: {
          select: { id: true, status: true, pickupAddress: true, student: { select: { name: true, email: true, phone: true } } },
        },
      },
      orderBy: { startTime: 'asc' },
    })
    return NextResponse.json(slots)
  }

  // Student: all non-blocked future slots, excluding those inside a blocked range
  const studentId = (session.user as any).id
  const [slots, blockedRanges] = await Promise.all([
    prisma.availability.findMany({
      where: { isBlocked: false, startTime: { gte: now } },
      include: { booking: { select: { status: true, studentId: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.availability.findMany({
      where: { isBlocked: true, endTime: { gte: now } },
      select: { startTime: true, endTime: true },
    }),
  ])

  const filteredSlots = slots.filter(slot => {
    const s = slot.startTime.getTime()
    const e = slot.endTime.getTime()
    return !blockedRanges.some(b => s >= b.startTime.getTime() && e <= b.endTime.getTime())
  })

  // Deduplicate by startTime — keep booked/mine first, then any free slot
  const seen = new Map<string, typeof slots[0]>()
  for (const s of filteredSlots) {
    const key = s.startTime.toISOString()
    const existing = seen.get(key)
    if (!existing || s.isBooked) seen.set(key, s)
  }

  return NextResponse.json([...seen.values()].map(s => ({
    id: s.id,
    startTime: s.startTime,
    endTime: s.endTime,
    isBooked: s.isBooked,
    myBookingStatus: s.booking?.studentId === studentId ? s.booking?.status ?? null : null,
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { startTime, endTime, isBlocked, blockNote } = await req.json()
  const start = new Date(startTime)
  const end = new Date(endTime)
  const instructorId = (session.user as any).id

  // If blocking: create one block covering the entire range
  if (isBlocked) {
    const eventId = await createBlockedCalendarEvent(start, end, blockNote)
    await prisma.availability.create({
      data: { instructorId, startTime: start, endTime: end, isBlocked: true, blockNote: blockNote || null, calendarEventId: eventId },
    })
    return NextResponse.json({ created: 1, blocked: true }, { status: 201 })
  }

  // Otherwise: split into 20-minute base slots (2=lesson, 3=half, 4=double)
  const SLOT_MINUTES = 20
  const slots = []
  const cursor = new Date(start)
  while (cursor < end) {
    const slotEnd = new Date(cursor.getTime() + SLOT_MINUTES * 60 * 1000)
    if (slotEnd > end) break
    slots.push({ instructorId, startTime: new Date(cursor), endTime: new Date(slotEnd) })
    cursor.setTime(cursor.getTime() + SLOT_MINUTES * 60 * 1000)
  }

  if (slots.length === 0) {
    return NextResponse.json({ error: 'הטווח קצר מדי — נדרש לפחות 20 דקות' }, { status: 400 })
  }

  // Skip slots that already exist at the same startTime
  const existingTimes = await prisma.availability.findMany({
    where: { startTime: { in: slots.map(s => s.startTime) } },
    select: { startTime: true },
  })
  const existingSet = new Set(existingTimes.map(s => s.startTime.toISOString()))
  const newSlots = slots.filter(s => !existingSet.has(s.startTime.toISOString()))

  if (newSlots.length > 0) {
    await prisma.availability.createMany({ data: newSlots })
  }
  return NextResponse.json({ created: newSlots.length, skipped: slots.length - newSlots.length }, { status: 201 })
}
