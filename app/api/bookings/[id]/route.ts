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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id
  const role = (session.user as any).role

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

  await prisma.$transaction([
    prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } }),
    prisma.availability.update({ where: { id: booking.availabilityId }, data: { isBooked: false } }),
  ])

  if ((booking as any).calendarEventId) {
    await deleteCalendarEvent((booking as any).calendarEventId)
  }

  // Notify instructor when lesson is cancelled within 24-96 hours
  if (role === 'STUDENT') {
    const lessonStart = new Date(booking.availability.startTime)
    const hoursUntil  = (lessonStart.getTime() - Date.now()) / (1000 * 60 * 60)
    // Only notify for lessons 24-96 hours away (< 24h are blocked above)
    // Only notify once per lesson (the booking that has calendarEventId is the primary slot)
    if (hoursUntil <= 96 && (booking as any).calendarEventId) {
      const dateStr = format(lessonStart, "EEEE, d בMMMM", { locale: he })
      const timeStr = format(lessonStart, 'HH:mm')
      const studentName = (booking as any).student?.name ?? ''
      const msg = `ביטול שיעור: ${studentName} ביטל את השיעור ביום ${dateStr} בשעה ${timeStr}.\nהעתק לקבוצה: "שיעור נהיגה התפנה ב${dateStr} בשעה ${timeStr}. מי מעוניין? היכנסו למערכת וקבעו שיעור 🚗"`
      sendSmsToInstructor(msg).catch(console.error)
      sendPushToInstructor('ביטול שיעור', `${studentName} ביטל את השיעור ב-${dateStr} ${timeStr}`).catch(console.error)
    }
  }

  return NextResponse.json({ success: true })
}
