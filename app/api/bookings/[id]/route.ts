export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteCalendarEvent } from '@/lib/calendar'
import { sendSmsToInstructor } from '@/lib/sms'
import { sendPushToInstructor } from '@/lib/push'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

const roundMin = (ms: number) => Math.round(ms / 60000) * 60000

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id
  const role   = (session.user as any).role

  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { availability: true, student: { select: { name: true } } },
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

  // Find all consecutive sibling bookings for the same lesson group
  const siblings = await prisma.booking.findMany({
    where: { studentId: booking.studentId, status: booking.status },
    include: { availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })

  // Build chains and find the one containing this booking
  const allChains: typeof siblings[] = []
  let current: typeof siblings = []
  for (const b of siblings) {
    const last = current[current.length - 1]
    if (last && roundMin(last.availability.endTime.getTime()) === roundMin(b.availability.startTime.getTime())) {
      current.push(b)
    } else {
      if (current.length) allChains.push(current)
      current = [b]
    }
  }
  if (current.length) allChains.push(current)
  const chain = allChains.find(c => c.some(b => b.id === id)) ?? [booking as any]

  const ids      = chain.map(b => b.id)
  const first    = chain[0]
  const lessonStart = first.availability.startTime

  await prisma.$transaction([
    prisma.booking.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED' } }),
    prisma.availability.updateMany({ where: { id: { in: chain.map(b => b.availabilityId) } }, data: { isBooked: false } }),
  ])

  if ((first as any).calendarEventId) {
    await deleteCalendarEvent((first as any).calendarEventId)
  }

  // SMS + Push to instructor for late cancellations (24-96h window, only once per lesson)
  if (role === 'STUDENT' && (first as any).calendarEventId) {
    const hoursUntil = (lessonStart.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil <= 96) {
      const dateStr = format(lessonStart, "EEEE, d בMMMM", { locale: he })
      const timeStr = format(lessonStart, 'HH:mm')
      const msg = `שיעור נהיגה התפנה ב${dateStr} בשעה ${timeStr}. מי מעוניין? היכנסו למערכת וקבעו שיעור 🚗`
      sendSmsToInstructor(msg).catch(console.error)
      sendPushToInstructor('שיעור התפנה', `${(booking as any).student?.name} ביטל — ${dateStr} ${timeStr}`).catch(console.error)
    }
  }

  return NextResponse.json({ success: true })
}
