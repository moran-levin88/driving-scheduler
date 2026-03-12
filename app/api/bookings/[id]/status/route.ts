export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendBookingApproved, sendBookingRejected } from '@/lib/email'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await req.json()
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { id } = await params
  const booking = await prisma.booking.update({
    where: { id },
    data: { status },
    include: {
      student: true,
      availability: true,
    },
  })

  if (status === 'REJECTED') {
    await prisma.availability.update({
      where: { id: booking.availabilityId },
      data: { isBooked: false },
    })
  }

  if (status === 'APPROVED') {
    sendBookingApproved(booking as any).catch(console.error)
  } else {
    sendBookingRejected(booking as any).catch(console.error)
  }

  return NextResponse.json(booking)
}
