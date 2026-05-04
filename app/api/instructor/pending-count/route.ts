export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ count: 0 })
  }

  // Count pending booking groups (not individual slots)
  const pending = await prisma.booking.findMany({
    where: { status: 'PENDING' },
    select: { studentId: true, pickupAddress: true, notes: true, availability: { select: { startTime: true, endTime: true } } },
    orderBy: { availability: { startTime: 'asc' } },
  })

  // Group consecutive bookings (same logic as dashboard)
  let count = 0
  let lastStudentId = '', lastEndMs = 0, lastPickup = '', lastNotes = ''
  for (const b of pending) {
    const startMs = b.availability.startTime.getTime()
    if (lastStudentId === b.studentId && lastEndMs === startMs && lastPickup === (b.pickupAddress ?? '') && lastNotes === (b.notes ?? '')) {
      lastEndMs = b.availability.endTime.getTime()
    } else {
      count++
      lastStudentId = b.studentId
      lastEndMs = b.availability.endTime.getTime()
      lastPickup = b.pickupAddress ?? ''
      lastNotes = b.notes ?? ''
    }
  }

  return NextResponse.json({ count })
}
