export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateCalendarEventStudent } from '@/lib/calendar'
import { sendBookingApproved, sendBookingCancelled } from '@/lib/email'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { bookingIds, newStudentId } = await req.json()
  if (!Array.isArray(bookingIds) || bookingIds.length === 0 || !newStudentId) {
    return NextResponse.json({ error: 'bookingIds and newStudentId required' }, { status: 400 })
  }

  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds }, status: 'APPROVED' },
    include: { student: true, availability: true },
    orderBy: { availability: { startTime: 'asc' } },
  })
  if (bookings.length === 0) {
    return NextResponse.json({ error: 'שיעור לא נמצא' }, { status: 404 })
  }

  const newStudent = await prisma.user.findUnique({ where: { id: newStudentId } })
  if (!newStudent || newStudent.role !== 'STUDENT') {
    return NextResponse.json({ error: 'תלמיד לא נמצא' }, { status: 404 })
  }

  const oldStudent = bookings[0].student
  const first = bookings[0]
  const last  = bookings[bookings.length - 1]

  if (oldStudent.id === newStudentId) {
    return NextResponse.json({ error: 'התלמיד שנבחר כבר משויך לשיעור זה' }, { status: 400 })
  }

  // Reassign all slots to the new student
  await prisma.booking.updateMany({
    where: { id: { in: bookingIds } },
    data: { studentId: newStudentId },
  })

  // Update calendar event title + description to reflect the new student
  if ((first as any).calendarEventId) {
    updateCalendarEventStudent(
      (first as any).calendarEventId,
      newStudent,
      first.pickupAddress,
    ).catch(console.error)
  }

  // Email old student: their lesson was cancelled
  const cancelEmail = {
    ...first,
    student: oldStudent,
    availability: { ...first.availability, endTime: last.availability.endTime },
  }
  sendBookingCancelled(cancelEmail as any).catch(console.error)

  // Email new student: they have a new lesson
  const approveEmail = {
    ...first,
    student: newStudent,
    availability: { ...first.availability, endTime: last.availability.endTime },
  }
  sendBookingApproved(approveEmail as any).catch(console.error)

  return NextResponse.json({ ok: true })
}
