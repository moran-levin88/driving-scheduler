import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id
  const role = (session.user as any).role

  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { availability: true },
  })
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role === 'STUDENT' && booking.studentId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (role === 'STUDENT') {
    const hoursUntilLesson = (new Date(booking.availability.startTime).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilLesson < 24) {
      return NextResponse.json({ error: 'לא ניתן לבטל שיעור פחות מ-24 שעות לפני תחילתו' }, { status: 400 })
    }
  }

  await prisma.$transaction([
    prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } }),
    prisma.availability.update({ where: { id: booking.availabilityId }, data: { isBooked: false } }),
  ])

  return NextResponse.json({ success: true })
}
