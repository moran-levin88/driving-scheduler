export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingRequested } from '@/lib/email'
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

      // Create a booking for each slot
      const created = []
      for (const availabilityId of availabilityIds) {
        const booking = await tx.booking.create({
          data: { studentId, availabilityId, notes, pickupAddress, alternativeSlots: alternativeSlots || [] },
          include: { student: true, availability: true },
        })
        await tx.availability.update({ where: { id: availabilityId }, data: { isBooked: true } })
        created.push(booking)
      }
      return created
    })

    sendBookingRequested(bookings[0] as any).catch(console.error)
    return NextResponse.json(bookings, { status: 201 })
  } catch (err: any) {
    if (err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'אחד השיעורים כבר לא פנוי' }, { status: 409 })
    }
    throw err
  }
}
