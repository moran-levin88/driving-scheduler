export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteCalendarEvent } from '@/lib/calendar'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const slot = await prisma.availability.findUnique({ where: { id } })
  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (slot.isBooked) return NextResponse.json({ error: 'Cannot delete a booked slot' }, { status: 409 })

  if (slot.isBlocked && (slot as any).calendarEventId) {
    await deleteCalendarEvent((slot as any).calendarEventId)
  }
  await prisma.availability.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
