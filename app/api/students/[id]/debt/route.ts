export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { groupBookingsIntoLessons } from '@/lib/groupLessons'
import { computeDebt } from '@/lib/debt'

// Lightweight single-student debt figure — used by the calendar's lesson
// and test click-modals, which want "what does this student owe in total"
// rather than just the one item clicked.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const now = new Date()

  const student = await prisma.user.findUnique({
    where: { id, role: 'STUDENT' },
    select: {
      pricePer20Min: true,
      previousPlatformDebt: true,
      bookings: {
        include: { availability: true, payments: { select: { amount: true } } },
      },
      charges: { where: { invoiceId: null, startTime: { lte: now } }, select: { amount: true } },
    },
  })
  if (!student) return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })

  const lessons = groupBookingsIntoLessons(student.bookings)
  const unpaidChargesTotal = student.charges.reduce((sum, c) => sum + c.amount, 0)
  const debt = computeDebt({
    pricePer20Min: student.pricePer20Min,
    previousPlatformDebt: student.previousPlatformDebt,
    lessons,
    unpaidChargesTotal,
    now,
  })

  return NextResponse.json({ debt })
}
