export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushToInstructor } from '@/lib/push'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  const userId = (session.user as any).id

  if (role === 'INSTRUCTOR') {
    const bookings = await prisma.booking.findMany({
      include: {
        student: { select: { name: true, email: true, phone: true } },
        availability: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(bookings)
  }

  const bookings = await prisma.booking.findMany({
    where: { studentId: userId },
    include: { availability: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(bookings)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'STUDENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { availabilityIds, notes, pickupAddress, alternativeSlots } = await req.json()
  const studentId = (session.user as any).id

  if (!pickupAddress?.trim()) {
    return NextResponse.json({ error: 'כתובת איסוף היא שדה חובה' }, { status: 400 })
  }

  if (!availabilityIds || !Array.isArray(availabilityIds) || availabilityIds.length === 0) {
    return NextResponse.json({ error: 'לא נבחרה שעה' }, { status: 400 })
  }

  try {
    const bookings = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify all slots are available
      const slots = await tx.availability.findMany({
        where: { id: { in: availabilityIds } },
      })
      if (slots.length !== availabilityIds.length) throw new Error('SLOT_UNAVAILABLE')
      if (slots.some(s => s.isBooked)) throw new Error('SLOT_UNAVAILABLE')

      // Edge gap rule: don't allow booking that leaves < 3 free slots (60 min)
      // isolated at the very start or end of the day's availability window.
      const sortedForEdge = slots.slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      const lessonStart = sortedForEdge[0].startTime
      const lessonEnd   = sortedForEdge[sortedForEdge.length - 1].endTime
      const dayKey      = lessonStart.toISOString().slice(0, 10)
      const dayStartUtc = new Date(dayKey + 'T00:00:00.000Z')
      const dayEndUtc   = new Date(dayKey + 'T23:59:59.999Z')
      const freeBefore  = await tx.availability.count({
        where: { isBooked: false, isBlocked: false, startTime: { gte: dayStartUtc, lt: lessonStart } },
      })
      const freeAfter   = await tx.availability.count({
        where: { isBooked: false, isBlocked: false, startTime: { gte: lessonEnd, lt: dayEndUtc } },
      })
      if ((freeBefore > 0 && freeBefore < 3) || (freeAfter > 0 && freeAfter < 3)) {
        throw new Error('EDGE_GAP')
      }

      // Enforce isRestricted: lesson must not end in the last 20 min of that day's availability
      const studentUser = await tx.user.findUnique({ where: { id: studentId }, select: { isRestricted: true } })
      if (studentUser?.isRestricted) {
        const lastSlot = slots.slice().sort((a, b) => b.endTime.getTime() - a.endTime.getTime())[0]
        const day = lastSlot.endTime.toISOString().slice(0, 10)
        const daySlots = await tx.availability.findMany({
          where: { isBlocked: false, startTime: { gte: new Date(day), lt: new Date(new Date(day).getTime() + 86400000) } },
          select: { endTime: true },
        })
        const maxEnd = Math.max(...daySlots.map(s => s.endTime.getTime()))
        if (lastSlot.endTime.getTime() > maxEnd - 20 * 60 * 1000) {
          throw new Error('SLOT_UNAVAILABLE')
        }
      }

      // Enforce weekly limit: student may not exceed 4 slots (80 min) per week.
      // Exception: if the requested slots were freed by another student's cancellation
      // (CANCELLED record still exists on the slot), allow booking regardless of weekly count
      // so late-cancellation vacancies can always be filled.
      const isCancelledVacancy = await tx.booking.findFirst({
        where: { availabilityId: { in: availabilityIds }, status: { in: ['CANCELLED', 'REJECTED'] } },
      })

      if (!isCancelledVacancy) {
        const firstSlot = slots.slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0]
        const dayOfWeek = firstSlot.startTime.getUTCDay() // 0=Sun
        const weekStart = new Date(firstSlot.startTime)
        weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek)
        weekStart.setUTCHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

        const existingCount = await tx.booking.count({
          where: {
            studentId,
            status: { in: ['PENDING', 'APPROVED'] },
            availability: { startTime: { gte: weekStart, lt: weekEnd } },
          },
        })
        if (existingCount + availabilityIds.length > 4) {
          throw new Error('WEEKLY_LIMIT')
        }
      }

      // Create a booking for each slot
      const created = []
      for (const availabilityId of availabilityIds) {
        // Remove any old cancelled/rejected booking for this slot
        await tx.booking.deleteMany({
          where: { availabilityId, status: { in: ['CANCELLED', 'REJECTED'] } },
        })
        const booking = await tx.booking.create({
          data: { studentId, availabilityId, notes, pickupAddress, alternativeSlots: alternativeSlots || [] },
          include: { student: true, availability: true },
        })
        await tx.availability.update({ where: { id: availabilityId }, data: { isBooked: true } })
        created.push(booking)
      }
      return created
    })

    const firstName = bookings[0].student.name.split(' ')[0]
    sendPushToInstructor('בקשת שיעור חדשה', `${firstName} ביקש/ה שיעור`).catch(console.error)
    return NextResponse.json(bookings, { status: 201 })
  } catch (err: any) {
    if (err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'אחד השיעורים כבר לא פנוי' }, { status: 409 })
    }
    if (err.message === 'WEEKLY_LIMIT') {
      return NextResponse.json({ error: 'לא ניתן לקבוע יותר משיעור כפול אחד בשבוע' }, { status: 400 })
    }
    if (err.message === 'EDGE_GAP') {
      return NextResponse.json({ error: 'לא ניתן להשאיר פחות משעה פנויה בתחילת היום או בסופו' }, { status: 400 })
    }
    throw err
  }
}
