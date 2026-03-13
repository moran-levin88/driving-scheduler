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

  // Check if the alternative time is already taken
  const conflict = await prisma.availability.findFirst({
    where: {
      instructorId,
      startTime: newStart,
      isBooked: true,
      id: { not: booking.availabilityId },
    },
  })
  if (conflict) {
    return NextResponse.json({ error: 'השעה הזו כבר תפוסה — לא ניתן להזיז לשעה זו' }, { status: 409 })
  }

  // Check if an existing free slot exists at that time — use it instead of creating new
  const existingFreeSlot = await prisma.availability.findFirst({
    where: { instructorId, startTime: newStart, isBooked: false },
  })

  const targetSlot = existingFreeSlot ?? await prisma.availability.create({
    data: { instructorId, startTime: newStart, endTime: newEnd, isBooked: true },
  })

  if (existingFreeSlot) {
    await prisma.availability.update({ where: { id: existingFreeSlot.id }, data: { isBooked: true } })
  }

  // Move booking to new slot, keep APPROVED status, free the old slot
  await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: { availabilityId: targetSlot.id, status: 'APPROVED' },
    }),
    prisma.availability.update({
      where: { id: booking.availabilityId },
      data: { isBooked: false },
    }),
  ])

  return NextResponse.json({ success: true })
}
