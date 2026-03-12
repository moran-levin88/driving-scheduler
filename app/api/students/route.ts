export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    include: {
      bookings: {
        include: { availability: true },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(students)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId } = await req.json()

  // Cancel all bookings and free up slots
  const bookings = await prisma.booking.findMany({
    where: { studentId, status: { in: ['PENDING', 'APPROVED'] } },
  })
  for (const b of bookings) {
    await prisma.availability.update({
      where: { id: b.availabilityId },
      data: { isBooked: false },
    })
  }

  await prisma.booking.deleteMany({ where: { studentId } })
  await prisma.account.deleteMany({ where: { userId: studentId } })
  await prisma.session.deleteMany({ where: { userId: studentId } })
  await prisma.user.delete({ where: { id: studentId } })

  return NextResponse.json({ success: true })
}
