export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findLessonChain } from '@/lib/lessonChain'

// Sets (or clears, with amount 0) a ₪ discount on a lesson — e.g. a
// shortened/delayed lesson or a free "gift" lesson. Stored on the chain's
// first booking only, same convention as Payment. Any status is allowed
// (unlike duration changes) since a discount can be applied retroactively
// to a lesson that's already in the past.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { amount, reason } = await req.json()
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })
  }

  const result = await findLessonChain(id, 'APPROVED') ?? await findLessonChain(id, 'PENDING')
  const firstId = result?.first.id ?? id

  const booking = await prisma.booking.findUnique({ where: { id: firstId } })
  if (!booking) return NextResponse.json({ error: 'שיעור לא נמצא' }, { status: 404 })

  const discountReason = typeof reason === 'string' ? reason.trim().slice(0, 200) : ''
  await prisma.booking.update({
    where: { id: firstId },
    data: { discountAmount: Math.round(amount), discountReason: discountReason || null },
  })

  return NextResponse.json({ ok: true, discountAmount: Math.round(amount), discountReason: discountReason || null })
}
