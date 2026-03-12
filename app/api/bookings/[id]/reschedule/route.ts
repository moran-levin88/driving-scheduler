export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { alternativeDateTime } = await req.json()

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { availability: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newStart = new Date(alternativeDateTime)
  const newEnd = new Date(newStart.getTime() + 40 * 60 * 1000)
  const instructorId = (session.user as any).id

  // Create new availability slot for the alternative time
  const newSlot = await prisma.availability.create({
    data: { instructorId, startTime: newStart, endTime: newEnd, isBooked: true },
  })

  // Move booking to new slot and free the old one
  await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: { availabilityId: newSlot.id, status: 'PENDING' },
    }),
    prisma.availability.update({
      where: { id: booking.availabilityId },
      data: { isBooked: false },
    }),
  ])

  return NextResponse.json({ success: true })
}
