export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// The student's own upcoming practical tests, for their dashboard. Only the
// schedule is exposed — price/payment/result stay instructor-side.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'STUDENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tests = await prisma.charge.findMany({
    where: { studentId: (session.user as any).id, type: 'PRACTICAL_TEST', endTime: { gte: new Date() } },
    select: { id: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  })
  return NextResponse.json(tests)
}
