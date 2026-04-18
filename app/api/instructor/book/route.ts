export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved } from '@/lib/email'
import { Prisma } from '@prisma/client'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { studentId, availabilityIds, pickupAddress, notes } = await req.json()

  if (!studentId || !availabilityIds?.length) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  try {
    const firstBooking = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const slots = await tx.availability.findMany({ where: { id: { in: availabilityIds } } })
      if (slots.length !== availabilityIds.length || slots.some(s => s.isBooked || s.isBlocked)) {
        throw new Error('SLOT_UNAVAILABLE')
      }

      let first: any = null
      for (const availabilityId of availabilityIds) {
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
        await tx.availability.update({ where: { id: availabilityId }, data: { isBooked: true } })
        if (!first) first = created
      }
      return first
    })

    sendBookingApproved(firstBooking as any).catch(console.error)
    return NextResponse.json(firstBooking, { status: 201 })
  } catch (err: any) {
    if (err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'השעה כבר לא פנויה' }, { status: 409 })
    }
    throw err
  }
}
