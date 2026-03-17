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

  const { studentId, availabilityId, pickupAddress, notes } = await req.json()

  if (!studentId || !availabilityId) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  try {
    const booking = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const slot = await tx.availability.findUnique({ where: { id: availabilityId } })
      if (!slot || slot.isBooked || slot.isBlocked) throw new Error('SLOT_UNAVAILABLE')

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
      return created
    })

    sendBookingApproved(booking as any).catch(console.error)
    return NextResponse.json(booking, { status: 201 })
  } catch (err: any) {
    if (err.message === 'SLOT_UNAVAILABLE') {
      return NextResponse.json({ error: 'השעה כבר לא פנויה' }, { status: 409 })
    }
    throw err
  }
}
