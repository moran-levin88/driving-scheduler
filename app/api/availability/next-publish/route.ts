export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// The soonest moment at which more availability will become visible to
// students — a slot scheduled with a future publishAt is hidden from the
// booking grid until then (see /api/availability's student branch). This
// doesn't reveal anything about the slots themselves, just when the next
// batch opens up, so a student can see a countdown to it.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const next = await prisma.availability.findFirst({
    where: { publishAt: { gt: new Date() }, isBlocked: false },
    orderBy: { publishAt: 'asc' },
    select: { publishAt: true },
  })

  return NextResponse.json({ nextPublishAt: next?.publishAt ?? null })
}
