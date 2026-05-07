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
  const student = await prisma.user.findUnique({ where: { id: studentId }, select: { isRestricted: true } })
  const isRestricted = student?.isRestricted ?? false

  const [slots, blockedRanges] = await Promise.all([
    prisma.availability.findMany({
      where: { isBlocked: false, startTime: { gte: now } },
      include: { booking: { select: { status: true, studentId: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.availability.findMany({
      where: { isBlocked: true, endTime: { gte: now } },
      select: { id: true, startTime: true, endTime: true },
    }),
  ])

  // Round to nearest minute to avoid millisecond precision issues
  const min = (ms: number) => Math.round(ms / 60000) * 60000
  const filteredSlots = slots.filter(slot => {
    const s = min(slot.startTime.getTime())
    const e = min(slot.endTime.getTime())
    // Exclude any slot that overlaps (even partially) with a blocked range
    return !blockedRanges.some(b => {
      const bs = min(b.startTime.getTime())
      const be = min(b.endTime.getTime())
      return s < be && e > bs
    })
  })

  // Deduplicate by startTime — keep booked/mine first, then any free slot
  const seen = new Map<string, typeof slots[0]>()
  for (const s of filteredSlots) {
    const key = s.startTime.toISOString()
    const existing = seen.get(key)
    if (!existing || s.isBooked) seen.set(key, s)
  }

  const allVisible = [...seen.values()]

  // For restricted students: hide any slot ending in the last 20 min of that day's availability
  const TWENTY_MIN = 20 * 60 * 1000
  const visibleSlots = isRestricted ? (() => {
    // Build max endTime per calendar day (UTC date string)
    const dayMax = new Map<string, number>()
    for (const s of allVisible) {
      const day = s.startTime.toISOString().slice(0, 10)
      const e = s.endTime.getTime()
      if (!dayMax.has(day) || e > dayMax.get(day)!) dayMax.set(day, e)
    }
    return allVisible.filter(s => {
      const day = s.startTime.toISOString().slice(0, 10)
      return s.endTime.getTime() <= (dayMax.get(day)! - TWENTY_MIN)
    })
  })() : allVisible

  // Generate synthetic 20-min "תפוס" slots from blocked ranges so students see
  // blocked times as occupied (same visual as a booked lesson by another student).
  const SLOT_MS = 20 * 60 * 1000
  type StudentSlot = { id: string; startTime: Date; endTime: Date; isBooked: boolean; myBookingStatus: string | null }
  const syntheticBlocked: StudentSlot[] = []
  for (const block of blockedRanges) {
    let t = block.startTime.getTime()
    while (t < block.endTime.getTime()) {
      syntheticBlocked.push({ id: `block_${block.id}_${t}`, startTime: new Date(t), endTime: new Date(t + SLOT_MS), isBooked: true, myBookingStatus: null })
      t += SLOT_MS
    }
  }

  const regularSlots = visibleSlots.map(s => ({
    id: s.id,
    startTime: s.startTime,
    endTime: s.endTime,
    isBooked: s.isBooked,
    myBookingStatus: s.booking?.studentId === studentId ? s.booking?.status ?? null : null,
  }))

  return NextResponse.json([...regularSlots, ...syntheticBlocked])
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
    // Prevent duplicate blocks at the same time
    const existing = await prisma.availability.findFirst({
      where: { isBlocked: true, startTime: start, endTime: end },
    })
    if (existing) return NextResponse.json({ created: 0, skipped: 1 }, { status: 201 })

    const eventId = await createBlockedCalendarEvent(start, end, blockNote)
    await prisma.availability.create({
      data: { instructorId, startTime: start, endTime: end, isBlocked: true, blockNote: blockNote || null, calendarEventId: eventId },
    })
    // Mark any free lesson slots inside the blocked range as blocked too
    await prisma.availability.updateMany({
      where: { isBlocked: false, isBooked: false, startTime: { gte: start }, endTime: { lte: end } },
      data: { isBlocked: true },
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
