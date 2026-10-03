export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getAllStudentBalances } from '@/lib/balance'
import { groupBookingsIntoLessons } from '@/lib/groupLessons'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [students, balances] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'STUDENT' },
      include: {
        bookings: {
          include: { availability: true, payments: { select: { amount: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    getAllStudentBalances(),
  ])

  const now = new Date()
  const withStats = students.map(s => {
    const lessons = groupBookingsIntoLessons(s.bookings)
    // Only lessons that have actually happened (ended already) count toward
    // the displayed lesson count — a future approved booking isn't "taken" yet.
    const completedLessons = lessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status) && l.endTime <= now)
    // Debt is the shortfall per approved lesson that's already happened
    // (price minus whatever's been paid so far) — a future booked lesson
    // isn't owed yet, and a partially-paid past lesson still owes the
    // difference, not just lessons with zero payments.
    const approvedLessons = lessons.filter(l => l.status === 'APPROVED' && l.endTime <= now)
    const debt = s.pricePer20Min != null
      ? approvedLessons.reduce((sum, l) => sum + Math.max(0, s.pricePer20Min! * l.slots - l.paidSoFar), 0)
      : 0
    // A "lesson" is 40 min = two 20-min slots (a "שיעור וחצי" is 1.5, "כפול" is 2,
    // etc.) — count total slots, not sessions, so longer lessons count for more.
    // No rounding: a 60-min lesson alone is already a fractional 1.5, and
    // manualPriorLessons can carry its own quarter-lesson fraction too.
    const completedSlots = completedLessons.reduce((sum, l) => sum + l.slots, 0)
    return {
      ...s,
      lessonCount: completedSlots / 2 + s.manualPriorLessons,
      debt,
      balance: balances.get(s.id) ?? 0,
    }
  })

  return NextResponse.json(withStats)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, phone, email } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'שם הוא שדה חובה' }, { status: 400 })
  }

  const studentEmail = email?.trim()
    ? email.trim().toLowerCase()
    : `student_${Date.now()}_${Math.random().toString(36).slice(-4)}@placeholder.local`

  const existing = await prisma.user.findUnique({ where: { email: studentEmail } })
  if (existing) {
    return NextResponse.json({ error: 'כתובת האימייל כבר קיימת במערכת' }, { status: 409 })
  }

  const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase()
  const hash = await bcrypt.hash(tempPassword, 12)

  const student = await prisma.user.create({
    data: {
      name: name.trim(),
      email: studentEmail,
      phone: phone?.trim() || null,
      role: 'STUDENT',
      password: hash,
    },
  })

  return NextResponse.json({
    id: student.id,
    name: student.name,
    email: student.email,
    phone: student.phone,
    tempPassword: email?.trim() ? tempPassword : null,
  }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId } = await req.json()

  // Cancel all bookings and free up slots
  const bookings = await prisma.booking.findMany({
    where: { studentId, status: { in: ['PENDING', 'APPROVED'] } },
  })
  for (const b of bookings) {
    await prisma.availability.update({
      where: { id: b.availabilityId },
      data: { isBooked: false },
    })
  }

  await prisma.booking.deleteMany({ where: { studentId } })
  await prisma.account.deleteMany({ where: { userId: studentId } })
  await prisma.session.deleteMany({ where: { userId: studentId } })
  await prisma.user.delete({ where: { id: studentId } })

  return NextResponse.json({ success: true })
}
