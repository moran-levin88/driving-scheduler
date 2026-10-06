export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { getAllStudentBalances } from '@/lib/balance'
import { groupBookingsIntoLessons } from '@/lib/groupLessons'
import { archiveStudent } from '@/lib/archiveStudent'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== 'INSTRUCTOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const showArchived = new URL(req.url).searchParams.get('archived') === '1'
  const now = new Date()

  const [students, balances, unpaidCharges, manualLessonSums] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'STUDENT', archivedAt: showArchived ? { not: null } : null },
      // Explicit select, not a bare include — this response goes straight to
      // the instructor's browser, and a bare include would also ship the
      // bcrypt password hash and login-lockout fields over the wire.
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isRestricted: true,
        pricePer20Min: true,
        idNumber: true,
        dateOfBirth: true,
        manualPriorLessons: true,
        manualPriorOtherTeacherLessons: true,
        manualPriorPracticalTests: true,
        manualPriorInternalTests: true,
        previousPlatformDebt: true,
        privacyConsentAt: true,
        bookings: {
          include: { availability: true, payments: { select: { amount: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    getAllStudentBalances(),
    // Only a test that's already happened can be owed for — one scheduled
    // for the future isn't a debt yet.
    prisma.charge.groupBy({ by: ['studentId'], where: { invoiceId: null, startTime: { lte: now } }, _sum: { amount: true } }),
    prisma.manualLessonRecord.groupBy({ by: ['studentId'], _sum: { lessons: true } }),
  ])
  const unpaidChargeByStudent = new Map(unpaidCharges.map(c => [c.studentId, c._sum.amount ?? 0]))
  const manualLessonsByStudent = new Map(manualLessonSums.map(m => [m.studentId, m._sum.lessons ?? 0]))

  const withStats = students.map(s => {
    const lessons = groupBookingsIntoLessons(s.bookings)
    // Only lessons that have actually happened (ended already) count toward
    // the displayed lesson count — a future approved booking isn't "taken" yet.
    const completedLessons = lessons.filter(l => ['APPROVED', 'COMPLETED'].includes(l.status) && l.endTime <= now)
    // Debt is the shortfall per approved lesson that's already happened
    // (price minus whatever's been paid so far) — a future booked lesson
    // isn't owed yet, and a partially-paid past lesson still owes the
    // difference, not just lessons with zero payments. Unpaid practical/
    // internal tests (Charges with no linked invoice yet) add to this too.
    const approvedLessons = lessons.filter(l => l.status === 'APPROVED' && l.endTime <= now)
    const debt = (s.pricePer20Min != null
      ? approvedLessons.reduce((sum, l) => sum + Math.max(0, s.pricePer20Min! * l.slots - l.paidSoFar), 0)
      : 0) + (unpaidChargeByStudent.get(s.id) ?? 0) + s.previousPlatformDebt
    // A "lesson" is 40 min = two 20-min slots (a "שיעור וחצי" is 1.5, "כפול" is 2,
    // etc.) — count total slots, not sessions, so longer lessons count for more.
    // No rounding: a 60-min lesson alone is already a fractional 1.5, and
    // manualPriorLessons can carry its own quarter-lesson fraction too.
    const completedSlots = completedLessons.reduce((sum, l) => sum + l.slots, 0)
    return {
      ...s,
      lessonCount: completedSlots / 2 + s.manualPriorLessons + s.manualPriorOtherTeacherLessons + (manualLessonsByStudent.get(s.id) ?? 0),
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
  await archiveStudent(studentId)

  return NextResponse.json({ success: true })
}
